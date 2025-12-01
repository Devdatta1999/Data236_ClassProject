"""
Event Emitter: Consumes deals.tagged, emits concise events to deal.events.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import (
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_DEALS_TAGGED,
    TOPIC_DEAL_EVENTS,
    CONSUMER_GROUP_EVENT_EMITTER
)

logger = logging.getLogger(__name__)


class EventEmitter:
    """Emits concise deal events."""
    
    def __init__(self):
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start consumer and producer."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_DEALS_TAGGED,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_EVENT_EMITTER,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='earliest',
            enable_auto_commit=True
        )
        
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        
        await self.consumer.start()
        await self.producer.start()
        logger.info("Event Emitter started")
    
    async def stop(self):
        """Stop consumer and producer."""
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        logger.info("Event Emitter stopped")
    
    async def process_message(self, message_value: Dict[str, Any]):
        """Process a tagged deal message and emit event."""
        deal_type = message_value.get("deal_type")
        db_id = message_value.get("db_id")
        external_id = message_value.get("external_id")
        deal_score = message_value.get("deal_score", 0)
        tags = message_value.get("tags", [])
        
        # Only emit events for high-scoring deals (score >= 50)
        if deal_score < 50:
            return
        
        # Create concise event
        event = {
            "event_type": "deal_update",
            "deal_type": deal_type,
            "deal_id": db_id,
            "external_id": external_id,
            "deal_score": deal_score,
            "tags": tags,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        # Key by listing/route for stable partitioning
        key = f"{deal_type}_{external_id}".encode('utf-8')
        
        try:
            await self.producer.send_and_wait(
                TOPIC_DEAL_EVENTS,
                value=event,
                key=key
            )
            logger.info(f"Emitted deal event: {deal_type} {external_id} (score: {deal_score})")
        except Exception as e:
            logger.error(f"Error emitting deal event: {e}")
    
    async def run(self):
        """Run the emitter consumer loop."""
        try:
            async for message in self.consumer:
                try:
                    await self.process_message(message.value)
                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Consumer error: {e}", exc_info=True)


async def main():
    """Main entry point."""
    logging.basicConfig(level=logging.INFO)
    emitter = EventEmitter()
    
    try:
        await emitter.start()
        await emitter.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await emitter.stop()


if __name__ == "__main__":
    asyncio.run(main())

