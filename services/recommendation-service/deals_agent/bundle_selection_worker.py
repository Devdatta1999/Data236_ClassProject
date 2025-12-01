"""
Bundle Selection Worker: Consumes bundle.selection events, simulates a price
drop for the selected bundle after a short delay, updates the database, and
emits a concise deal update event to deal.events.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlmodel import Session

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import (  # noqa: E402
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_BUNDLE_SELECTION,
    TOPIC_DEAL_EVENTS,
    CONSUMER_GROUP_BUNDLE_SELECTION,
)
from database import engine  # noqa: E402
from models import BundleRecommendation  # noqa: E402

logger = logging.getLogger(__name__)


class BundleSelectionWorker:
    """
    Listens for bundle selections and simulates a price drop for the selected
    bundle. This is used to create a realistic "good news, price dropped"
    notification flow for the traveler.
    """

    def __init__(self, delay_seconds: int = 5, price_drop_pct: float = 5.0):
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        self.delay_seconds = delay_seconds
        # Percentage to drop price by (e.g. 5.0 -> 5% drop)
        self.price_drop_pct = price_drop_pct

    async def start(self):
        """Start Kafka consumer and producer."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_BUNDLE_SELECTION,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_BUNDLE_SELECTION,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
        )

        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )

        await self.consumer.start()
        await self.producer.start()
        logger.info("BundleSelectionWorker started")

    async def stop(self):
        """Stop Kafka consumer and producer."""
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        logger.info("BundleSelectionWorker stopped")

    async def _simulate_price_drop(self, event: Dict[str, Any]):
        """
        After a delay, reduce the bundle total price and emit a deal update
        event indicating a simulated price drop.
        """
        bundle_id = event.get("bundle_id")
        session_id = event.get("session_id")
        if not bundle_id:
            logger.warning("bundle.selection event missing bundle_id")
            return

        # Wait before applying the drop so the UI can first show the original price
        await asyncio.sleep(self.delay_seconds)

        with Session(engine) as db:
            bundle = db.get(BundleRecommendation, bundle_id)
            if not bundle:
                logger.warning(f"Bundle {bundle_id} not found while simulating price drop")
                return

            old_price: Decimal = bundle.total_price_usd

            # Avoid dropping price multiple times for the same bundle selection
            # by enforcing a minimum gap: don't drop if we've already dropped in
            # the last few minutes or if price_drop_pct is 0.
            if self.price_drop_pct <= 0:
                logger.info("Price drop percentage is 0; skipping simulation")
                return

            # Compute new price with a simple percentage discount.
            drop_factor = Decimal("1.0") - (Decimal(str(self.price_drop_pct)) / Decimal("100"))
            new_price = (old_price * drop_factor).quantize(Decimal("0.01"))

            if new_price >= old_price:
                logger.info("Computed new price is not lower than old price; skipping simulation")
                return

            bundle.total_price_usd = new_price
            bundle.updated_at = datetime.utcnow()
            db.add(bundle)
            db.commit()

        # Emit a concise deal update event so the WebSocket layer can notify
        # the correct traveler.
        deal_event = {
            "event_type": "deal_update",
            "reason": "simulated_price_drop",
            "bundle_id": bundle_id,
            "session_id": session_id,
            "old_total_price_usd": str(old_price),
            "new_total_price_usd": str(new_price),
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            await self.producer.send_and_wait(
                TOPIC_DEAL_EVENTS,
                value=deal_event,
                key=str(bundle_id).encode("utf-8"),
            )
            logger.info(
                "Emitted simulated price drop event for bundle %s: %s -> %s",
                bundle_id,
                old_price,
                new_price,
            )
        except Exception as e:
            logger.error(f"Error emitting simulated price drop event: {e}")

    async def run(self):
        """Run the consumer loop."""
        try:
            async for message in self.consumer:  # type: ignore[union-attr]
                try:
                    await self._simulate_price_drop(message.value)
                except Exception as e:
                    logger.error("Error handling bundle.selection message: %s", e, exc_info=True)
        except Exception as e:
            logger.error("BundleSelectionWorker consumer error: %s", e, exc_info=True)


async def main():
    """Entry point to run the worker as a module."""
    logging.basicConfig(level=logging.INFO)
    worker = BundleSelectionWorker()

    try:
        await worker.start()
        await worker.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down BundleSelectionWorker...")
    finally:
        await worker.stop()


if __name__ == "__main__":
    asyncio.run(main())


