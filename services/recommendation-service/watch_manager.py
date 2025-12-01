"""
Watch management and evaluation worker.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from aiokafka import AIOKafkaProducer
from sqlmodel import Session, select
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine
from models import Watch, WatchStatus, BundleRecommendation, FlightDeal, HotelDeal
from kafka_config import KAFKA_BOOTSTRAP_SERVERS, TOPIC_WATCH_EVENTS

logger = logging.getLogger(__name__)


class WatchEvaluator:
    """Evaluates watches and triggers notifications."""
    
    def __init__(self):
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start producer."""
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        await self.producer.start()
        logger.info("Watch Evaluator started")
    
    async def stop(self):
        """Stop producer."""
        if self.producer:
            await self.producer.stop()
        logger.info("Watch Evaluator stopped")
    
    def _evaluate_bundle_watch(self, watch: Watch, bundle: BundleRecommendation) -> bool:
        """Evaluate a bundle watch."""
        triggered = False
        
        if watch.price_threshold_usd and bundle.total_price_usd <= watch.price_threshold_usd:
            triggered = True
        
        # Check inventory for flights and hotels in bundle
        if watch.inventory_threshold is not None:
            with Session(engine) as session:
                from .models import BundleFlight, BundleHotel
                
                flights = session.exec(
                    select(BundleFlight).where(BundleFlight.bundle_id == bundle.id)
                ).all()
                
                hotels = session.exec(
                    select(BundleHotel).where(BundleHotel.bundle_id == bundle.id)
                ).all()
                
                for bf in flights:
                    flight = session.get(FlightDeal, bf.flight_deal_id)
                    if flight and flight.available_seats and flight.available_seats < watch.inventory_threshold:
                        triggered = True
                        break
                
                for bh in hotels:
                    hotel = session.get(HotelDeal, bh.hotel_deal_id)
                    if hotel and hotel.available_rooms and hotel.available_rooms < watch.inventory_threshold:
                        triggered = True
                        break
        
        return triggered
    
    def _evaluate_deal_watch(self, watch: Watch) -> bool:
        """Evaluate a deal watch."""
        triggered = False
        
        with Session(engine) as session:
            if watch.flight_deal_id:
                deal = session.get(FlightDeal, watch.flight_deal_id)
                if deal:
                    if watch.price_threshold_usd and deal.price_usd <= watch.price_threshold_usd:
                        triggered = True
                    if watch.inventory_threshold and deal.available_seats and deal.available_seats < watch.inventory_threshold:
                        triggered = True
            
            elif watch.hotel_deal_id:
                deal = session.get(HotelDeal, watch.hotel_deal_id)
                if deal:
                    if watch.price_threshold_usd and deal.total_price_usd <= watch.price_threshold_usd:
                        triggered = True
                    if watch.inventory_threshold and deal.available_rooms and deal.available_rooms < watch.inventory_threshold:
                        triggered = True
        
        return triggered
    
    async def evaluate_watches(self):
        """Evaluate all active watches."""
        with Session(engine) as session:
            watches = session.exec(
                select(Watch).where(Watch.status == WatchStatus.ACTIVE)
            ).all()
            
            logger.info(f"Evaluating {len(watches)} active watches")
            
            for watch in watches:
                try:
                    triggered = False
                    
                    if watch.bundle_id:
                        bundle = session.get(BundleRecommendation, watch.bundle_id)
                        if bundle:
                            triggered = self._evaluate_bundle_watch(watch, bundle)
                    else:
                        triggered = self._evaluate_deal_watch(watch)
                    
                    if triggered:
                        # Update watch
                        watch.status = WatchStatus.TRIGGERED
                        watch.last_triggered_at = datetime.utcnow()
                        watch.trigger_count += 1
                        watch.updated_at = datetime.utcnow()
                        session.add(watch)
                        session.commit()
                        
                        # Emit event
                        event = {
                            "event_type": "watch_triggered",
                            "watch_id": watch.id,
                            "session_id": watch.session_id,
                            "bundle_id": watch.bundle_id,
                            "flight_deal_id": watch.flight_deal_id,
                            "hotel_deal_id": watch.hotel_deal_id,
                            "triggered_at": datetime.utcnow().isoformat(),
                        }
                        
                        try:
                            await self.producer.send_and_wait(
                                TOPIC_WATCH_EVENTS,
                                value=event,
                                key=str(watch.id).encode('utf-8')
                            )
                            logger.info(f"Watch {watch.id} triggered and event emitted")
                        except Exception as e:
                            logger.error(f"Error emitting watch event: {e}")
                
                except Exception as e:
                    logger.error(f"Error evaluating watch {watch.id}: {e}", exc_info=True)


async def run_watch_evaluator(interval_seconds: int = 300):
    """Run watch evaluator on a schedule."""
    evaluator = WatchEvaluator()
    
    try:
        await evaluator.start()
        
        while True:
            await evaluator.evaluate_watches()
            logger.info(f"Sleeping for {interval_seconds} seconds before next evaluation...")
            await asyncio.sleep(interval_seconds)
    
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await evaluator.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_watch_evaluator(interval_seconds=300))

