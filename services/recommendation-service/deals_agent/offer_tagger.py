"""
Offer Tagger: Consumes deals.scored, applies tags, writes to deals.tagged.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlmodel import Session, select

# Import from the top-level recommendation-service package so this module can
# be executed with `python -m deals_agent.offer_tagger` from the project root.
from kafka_config import (  # type: ignore
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_DEALS_SCORED,
    TOPIC_DEALS_TAGGED,
    CONSUMER_GROUP_TAGGER,
)
from database import engine  # type: ignore
from models import FlightDeal, HotelDeal, OfferTag, TagType  # type: ignore

logger = logging.getLogger(__name__)


class OfferTagger:
    """Tags deals based on metadata."""
    
    def __init__(self):
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start consumer and producer."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_DEALS_SCORED,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_TAGGER,
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
        logger.info("Offer Tagger started")
    
    async def stop(self):
        """Stop consumer and producer."""
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        logger.info("Offer Tagger stopped")
    
    def _extract_tags_flight(self, deal: FlightDeal) -> List[TagType]:
        """Extract tags for a flight deal."""
        tags = []
        
        # Note: Flights typically don't have refundable/pet-friendly tags
        # But we can tag based on other metadata if available
        
        return tags
    
    def _extract_tags_hotel(self, deal: HotelDeal) -> List[TagType]:
        """Extract tags for a hotel deal."""
        tags = []
        
        if deal.is_refundable:
            tags.append(TagType.REFUNDABLE)
        else:
            tags.append(TagType.NON_REFUNDABLE)
        
        if deal.pet_friendly:
            tags.append(TagType.PET_FRIENDLY)
        
        if deal.near_transit:
            tags.append(TagType.NEAR_TRANSIT)
        
        if deal.breakfast_included:
            tags.append(TagType.BREAKFAST)
        
        return tags
    
    async def process_message(self, message_value: Dict[str, Any]):
        """Process a scored deal message."""
        deal_type = message_value.get("deal_type")
        db_id = message_value.get("db_id")
        
        if not db_id:
            logger.warning("No db_id in scored message")
            return
        
        with Session(engine) as session:
            if deal_type == "flight":
                deal = session.get(FlightDeal, db_id)
                if not deal:
                    logger.warning(f"Flight deal {db_id} not found")
                    return
                
                tags = self._extract_tags_flight(deal)
                
                # Remove old tags and add new ones
                old_tags = session.exec(select(OfferTag).where(OfferTag.flight_deal_id == db_id)).all()
                for tag in old_tags:
                    session.delete(tag)
                
                for tag_type in tags:
                    tag = OfferTag(tag_type=tag_type, flight_deal_id=db_id)
                    session.add(tag)
                
                session.commit()
                
            else:  # hotel
                deal = session.get(HotelDeal, db_id)
                if not deal:
                    logger.warning(f"Hotel deal {db_id} not found")
                    return
                
                tags = self._extract_tags_hotel(deal)
                
                # Remove old tags and add new ones
                old_tags = session.exec(select(OfferTag).where(OfferTag.hotel_deal_id == db_id)).all()
                for tag in old_tags:
                    session.delete(tag)
                
                for tag_type in tags:
                    tag = OfferTag(tag_type=tag_type, hotel_deal_id=db_id)
                    session.add(tag)
                
                session.commit()
            
            # Prepare tagged message
            tagged_data = {
                "deal_type": deal_type,
                "db_id": db_id,
                "external_id": deal.external_id if deal else None,
                "tags": [tag.value for tag in tags],
                "deal_score": message_value.get("deal_score"),
                "tagged_at": datetime.utcnow().isoformat(),
            }
        
        # Publish to tagged topic
        try:
            await self.producer.send_and_wait(
                TOPIC_DEALS_TAGGED,
                value=tagged_data,
                key=str(db_id).encode('utf-8')
            )
            logger.debug(f"Published tagged {deal_type} deal: {tagged_data['external_id']} (tags: {tagged_data['tags']})")
        except Exception as e:
            logger.error(f"Error publishing tagged deal: {e}")
    
    async def run(self):
        """Run the tagger consumer loop."""
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
    tagger = OfferTagger()
    
    try:
        await tagger.start()
        await tagger.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await tagger.stop()


if __name__ == "__main__":
    asyncio.run(main())

