"""
Deal Detector: Consumes deals.normalized, computes deal scores, writes to deals.scored.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlmodel import Session, select, func
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import (
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_DEALS_NORMALIZED,
    TOPIC_DEALS_SCORED,
    CONSUMER_GROUP_DETECTOR
)
from database import engine
from models import FlightDeal, HotelDeal

logger = logging.getLogger(__name__)


class DealDetector:
    """Detects and scores deals based on price drops, scarcity, and promos."""
    
    def __init__(self):
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start consumer and producer."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_DEALS_NORMALIZED,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_DETECTOR,
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
        logger.info("Deal Detector started")
    
    async def stop(self):
        """Stop consumer and producer."""
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        logger.info("Deal Detector stopped")
    
    def _compute_price_drop_pct(self, current_price: Decimal, avg_price: Optional[Decimal]) -> Optional[float]:
        """Compute price drop percentage."""
        if not avg_price or avg_price == 0:
            return None
        if current_price >= avg_price:
            return None
        return float((avg_price - current_price) / avg_price * 100)
    
    def _update_price_history(self, deal_type: str, deal_id: int, current_price: Decimal):
        """Update price history metrics (30-day and 60-day averages)."""
        with Session(engine) as session:
            if deal_type == "flight":
                deal = session.get(FlightDeal, deal_id)
                if not deal:
                    return
                
                # Compute 30-day average (simplified - in production, use actual historical data)
                # For MVP, we'll simulate by using a simple heuristic
                if not deal.price_30d_avg:
                    # Set initial average as 1.2x current price (simulating higher historical price)
                    deal.price_30d_avg = current_price * Decimal("1.2")
                    deal.price_60d_avg = current_price * Decimal("1.25")
                else:
                    # Update rolling average (simple exponential smoothing)
                    deal.price_30d_avg = (deal.price_30d_avg * Decimal("0.95") + current_price * Decimal("0.05"))
                    deal.price_60d_avg = (deal.price_60d_avg * Decimal("0.98") + current_price * Decimal("0.02"))
                
                session.add(deal)
                session.commit()
            else:  # hotel
                deal = session.get(HotelDeal, deal_id)
                if not deal:
                    return
                
                if not deal.price_30d_avg:
                    deal.price_30d_avg = current_price * Decimal("1.2")
                    deal.price_60d_avg = current_price * Decimal("1.25")
                else:
                    deal.price_30d_avg = (deal.price_30d_avg * Decimal("0.95") + current_price * Decimal("0.05"))
                    deal.price_60d_avg = (deal.price_60d_avg * Decimal("0.98") + current_price * Decimal("0.02"))
                
                session.add(deal)
                session.commit()
    
    def _compute_deal_score(
        self,
        price_drop_pct: Optional[float],
        is_scarce: bool,
        has_promo: bool,
        available_inventory: Optional[int]
    ) -> int:
        """Compute deal score (0-100)."""
        score = 0
        
        # Price drop component (0-50 points)
        if price_drop_pct:
            if price_drop_pct >= 15:
                score += 50
            elif price_drop_pct >= 10:
                score += 35
            elif price_drop_pct >= 5:
                score += 20
            else:
                score += 10
        
        # Scarcity component (0-30 points)
        if is_scarce:
            score += 30
        elif available_inventory and available_inventory < 10:
            score += 15
        
        # Promo component (0-20 points)
        if has_promo:
            score += 20
        
        return min(score, 100)
    
    async def process_message(self, message_value: Dict[str, Any]):
        """Process a normalized deal message."""
        deal_type = message_value.get("deal_type")
        data = message_value.get("data", {})
        db_id = data.get("db_id")
        
        if not db_id:
            logger.warning("No db_id in normalized message")
            return
        
        with Session(engine) as session:
            if deal_type == "flight":
                deal = session.get(FlightDeal, db_id)
                if not deal:
                    logger.warning(f"Flight deal {db_id} not found")
                    return
                
                current_price = deal.price_usd
                
                # Update price history
                self._update_price_history("flight", db_id, current_price)
                session.refresh(deal)
                
                # Compute price drop
                price_drop_pct = self._compute_price_drop_pct(
                    current_price,
                    deal.price_30d_avg
                )
                
                # Check scarcity (less than 5 seats)
                is_scarce = deal.available_seats is not None and deal.available_seats < 5
                
                # Check promo
                has_promo = deal.promo_end_date is not None and deal.promo_end_date > datetime.utcnow()
                
                # Compute deal score
                deal_score = self._compute_deal_score(
                    price_drop_pct,
                    is_scarce,
                    has_promo,
                    deal.available_seats
                )
                
                # Update deal
                deal.deal_score = deal_score
                deal.price_drop_pct = price_drop_pct
                deal.is_scarce = is_scarce
                deal.has_promo = has_promo
                deal.updated_at = datetime.utcnow()
                
                session.add(deal)
                session.commit()
                
                scored_data = {
                    "deal_type": "flight",
                    "db_id": db_id,
                    "external_id": deal.external_id,
                    "deal_score": deal_score,
                    "price_drop_pct": price_drop_pct,
                    "is_scarce": is_scarce,
                    "has_promo": has_promo,
                    "scored_at": datetime.utcnow().isoformat(),
                }
                
            else:  # hotel
                deal = session.get(HotelDeal, db_id)
                if not deal:
                    logger.warning(f"Hotel deal {db_id} not found")
                    return
                
                current_price = deal.price_per_night_usd
                
                self._update_price_history("hotel", db_id, current_price)
                session.refresh(deal)
                
                price_drop_pct = self._compute_price_drop_pct(
                    current_price,
                    deal.price_30d_avg
                )
                
                is_scarce = deal.available_rooms is not None and deal.available_rooms < 5
                has_promo = deal.promo_end_date is not None and deal.promo_end_date > datetime.utcnow()
                
                deal_score = self._compute_deal_score(
                    price_drop_pct,
                    is_scarce,
                    has_promo,
                    deal.available_rooms
                )
                
                deal.deal_score = deal_score
                deal.price_drop_pct = price_drop_pct
                deal.is_scarce = is_scarce
                deal.has_promo = has_promo
                deal.updated_at = datetime.utcnow()
                
                session.add(deal)
                session.commit()
                
                scored_data = {
                    "deal_type": "hotel",
                    "db_id": db_id,
                    "external_id": deal.external_id,
                    "deal_score": deal_score,
                    "price_drop_pct": price_drop_pct,
                    "is_scarce": is_scarce,
                    "has_promo": has_promo,
                    "scored_at": datetime.utcnow().isoformat(),
                }
        
        # Publish to scored topic
        try:
            await self.producer.send_and_wait(
                TOPIC_DEALS_SCORED,
                value=scored_data,
                key=str(db_id).encode('utf-8')
            )
            logger.debug(f"Published scored {deal_type} deal: {scored_data['external_id']} (score: {deal_score})")
        except Exception as e:
            logger.error(f"Error publishing scored deal: {e}")
    
    async def run(self):
        """Run the detector consumer loop."""
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
    detector = DealDetector()
    
    try:
        await detector.start()
        await detector.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await detector.stop()


if __name__ == "__main__":
    asyncio.run(main())

