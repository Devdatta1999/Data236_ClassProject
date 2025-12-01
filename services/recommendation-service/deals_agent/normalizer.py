"""
Normalizer: Consumes raw_supplier_feeds, normalizes data, writes to deals.normalized and DB.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlmodel import Session, select
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import (
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_RAW_SUPPLIER_FEEDS,
    TOPIC_DEALS_NORMALIZED,
    CONSUMER_GROUP_NORMALIZER
)
from database import engine
from models import FlightDeal, HotelDeal, DealType

logger = logging.getLogger(__name__)


class Normalizer:
    """Normalizes raw feed data into structured deals."""
    
    def __init__(self):
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start consumer and producer."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_RAW_SUPPLIER_FEEDS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_NORMALIZER,
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
        logger.info("Normalizer started")
    
    async def stop(self):
        """Stop consumer and producer."""
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        logger.info("Normalizer stopped")
    
    def _normalize_currency(self, value: Any, source_currency: str = "USD") -> Decimal:
        """Normalize currency to USD."""
        # Simple conversion - in production, use real exchange rates
        currency_map = {
            "USD": 1.0,
            "EUR": 1.1,
            "GBP": 1.25,
            "JPY": 0.0067,
        }
        rate = currency_map.get(source_currency.upper(), 1.0)
        
        try:
            if isinstance(value, str):
                value = value.replace("$", "").replace(",", "").strip()
            return Decimal(str(float(value) * rate))
        except (ValueError, TypeError):
            return Decimal("0.00")
    
    def _parse_date(self, date_str: Any) -> Optional[datetime]:
        """Parse date string to datetime."""
        if not date_str:
            return None
        
        if isinstance(date_str, datetime):
            return date_str
        
        # Try common formats
        formats = [
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(str(date_str).strip(), fmt)
            except ValueError:
                continue
        
        logger.warning(f"Could not parse date: {date_str}")
        return None
    
    def _normalize_flight(self, raw_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalize a flight deal."""
        try:
            # Extract common fields (adjust based on actual CSV structure)
            external_id = raw_data.get("id") or raw_data.get("flight_id") or raw_data.get("external_id")
            if not external_id:
                external_id = f"flight_{hash(str(raw_data))}"
            
            origin = raw_data.get("origin") or raw_data.get("from") or raw_data.get("departure_airport")
            destination = raw_data.get("destination") or raw_data.get("to") or raw_data.get("arrival_airport")
            
            if not origin or not destination:
                return None
            
            departure_date = self._parse_date(
                raw_data.get("departure_date") or raw_data.get("departure") or raw_data.get("date")
            )
            if not departure_date:
                return None
            
            return_date = self._parse_date(
                raw_data.get("return_date") or raw_data.get("return")
            )
            
            price = self._normalize_currency(
                raw_data.get("price") or raw_data.get("price_usd") or raw_data.get("fare"),
                raw_data.get("currency", "USD")
            )
            
            return {
                "external_id": str(external_id),
                "origin": str(origin).upper(),
                "destination": str(destination).upper(),
                "departure_date": departure_date,
                "return_date": return_date,
                "price_usd": price,
                "currency": "USD",
                "airline": raw_data.get("airline") or raw_data.get("carrier"),
                "flight_number": raw_data.get("flight_number") or raw_data.get("flight_no"),
                "duration_minutes": self._safe_int(raw_data.get("duration") or raw_data.get("duration_minutes")),
                "stops": self._safe_int(raw_data.get("stops") or raw_data.get("stops_count"), default=0),
                "is_red_eye": self._safe_bool(raw_data.get("is_red_eye") or raw_data.get("redeye")),
                "baggage_included": self._safe_bool(raw_data.get("baggage_included") or raw_data.get("baggage")),
                "fare_class": raw_data.get("fare_class") or raw_data.get("class"),
                "available_seats": self._safe_int(raw_data.get("available_seats") or raw_data.get("seats")),
                "promo_end_date": self._parse_date(raw_data.get("promo_end") or raw_data.get("promo_end_date")),
                "raw_data": raw_data,
            }
        except Exception as e:
            logger.error(f"Error normalizing flight: {e}")
            return None
    
    def _normalize_hotel(self, raw_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalize a hotel deal."""
        try:
            external_id = raw_data.get("id") or raw_data.get("hotel_id") or raw_data.get("external_id")
            if not external_id:
                external_id = f"hotel_{hash(str(raw_data))}"
            
            hotel_name = raw_data.get("hotel_name") or raw_data.get("name") or raw_data.get("property_name")
            city = raw_data.get("city") or raw_data.get("location")
            
            if not hotel_name or not city:
                return None
            
            check_in = self._parse_date(
                raw_data.get("check_in") or raw_data.get("check_in_date") or raw_data.get("arrival_date")
            )
            check_out = self._parse_date(
                raw_data.get("check_out") or raw_data.get("check_out_date") or raw_data.get("departure_date")
            )
            
            if not check_in or not check_out:
                return None
            
            price_per_night = self._normalize_currency(
                raw_data.get("price_per_night") or raw_data.get("rate") or raw_data.get("nightly_rate"),
                raw_data.get("currency", "USD")
            )
            
            nights = (check_out - check_in).days
            total_price = price_per_night * Decimal(str(nights))
            
            return {
                "external_id": str(external_id),
                "hotel_name": str(hotel_name),
                "city": str(city),
                "country": raw_data.get("country", "USA"),
                "address": raw_data.get("address"),
                "neighborhood": raw_data.get("neighborhood") or raw_data.get("area"),
                "check_in_date": check_in,
                "check_out_date": check_out,
                "price_per_night_usd": price_per_night,
                "total_price_usd": total_price,
                "currency": "USD",
                "star_rating": self._safe_int(raw_data.get("stars") or raw_data.get("star_rating") or raw_data.get("rating")),
                "is_refundable": self._safe_bool(raw_data.get("refundable") or raw_data.get("is_refundable")),
                "cancellation_window_days": self._safe_int(raw_data.get("cancellation_days") or raw_data.get("cancel_window")),
                "pet_friendly": self._safe_bool(raw_data.get("pet_friendly") or raw_data.get("pets_allowed")),
                "breakfast_included": self._safe_bool(raw_data.get("breakfast") or raw_data.get("breakfast_included")),
                "near_transit": self._safe_bool(raw_data.get("near_transit") or raw_data.get("transit_nearby")),
                "parking_available": self._safe_bool(raw_data.get("parking") or raw_data.get("parking_available")),
                "available_rooms": self._safe_int(raw_data.get("available_rooms") or raw_data.get("rooms")),
                "promo_end_date": self._parse_date(raw_data.get("promo_end") or raw_data.get("promo_end_date")),
                "raw_data": raw_data,
            }
        except Exception as e:
            logger.error(f"Error normalizing hotel: {e}")
            return None
    
    def _safe_int(self, value: Any, default: Optional[int] = None) -> Optional[int]:
        """Safely convert to int."""
        if value is None:
            return default
        try:
            return int(float(str(value)))
        except (ValueError, TypeError):
            return default
    
    def _safe_bool(self, value: Any) -> bool:
        """Safely convert to bool."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "yes", "1", "y")
        return bool(value)
    
    async def process_message(self, message_value: Dict[str, Any]):
        """Process a raw feed message."""
        deal_type = message_value.get("deal_type", "unknown")
        data = message_value.get("data", {})
        
        normalized = None
        
        if deal_type == "flight":
            normalized = self._normalize_flight(data)
        elif deal_type == "hotel":
            normalized = self._normalize_hotel(data)
        else:
            logger.warning(f"Unknown deal type: {deal_type}")
            return
        
        if not normalized:
            logger.warning(f"Failed to normalize {deal_type} deal")
            return
        
        # Save to database
        with Session(engine) as session:
            if deal_type == "flight":
                # Check if exists
                existing = session.exec(
                    select(FlightDeal).where(FlightDeal.external_id == normalized["external_id"])
                ).first()
                
                if existing:
                    # Update
                    for key, value in normalized.items():
                        if key != "external_id":
                            setattr(existing, key, value)
                    existing.updated_at = datetime.utcnow()
                    session.add(existing)
                    normalized["db_id"] = existing.id
                else:
                    # Create
                    flight_deal = FlightDeal(**normalized)
                    session.add(flight_deal)
                    session.commit()
                    session.refresh(flight_deal)
                    normalized["db_id"] = flight_deal.id
            else:  # hotel
                existing = session.exec(
                    select(HotelDeal).where(HotelDeal.external_id == normalized["external_id"])
                ).first()
                
                if existing:
                    for key, value in normalized.items():
                        if key != "external_id":
                            setattr(existing, key, value)
                    existing.updated_at = datetime.utcnow()
                    session.add(existing)
                    normalized["db_id"] = existing.id
                else:
                    hotel_deal = HotelDeal(**normalized)
                    session.add(hotel_deal)
                    session.commit()
                    session.refresh(hotel_deal)
                    normalized["db_id"] = hotel_deal.id
        
        # Publish to normalized topic
        # Convert datetime objects to ISO strings for JSON serialization
        normalized_for_kafka = normalized.copy()
        for key, value in normalized_for_kafka.items():
            if isinstance(value, datetime):
                normalized_for_kafka[key] = value.isoformat()
            elif isinstance(value, Decimal):
                normalized_for_kafka[key] = str(value)
        
        normalized_message = {
            "deal_type": deal_type,
            "normalized_at": datetime.utcnow().isoformat(),
            "data": normalized_for_kafka
        }
        
        try:
            await self.producer.send_and_wait(
                TOPIC_DEALS_NORMALIZED,
                value=normalized_message,
                key=normalized["external_id"].encode('utf-8')
            )
            logger.debug(f"Published normalized {deal_type} deal: {normalized['external_id']}")
        except Exception as e:
            logger.error(f"Error publishing normalized deal: {e}")
    
    async def run(self):
        """Run the normalizer consumer loop."""
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
    normalizer = Normalizer()
    
    try:
        await normalizer.start()
        await normalizer.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await normalizer.stop()


if __name__ == "__main__":
    asyncio.run(main())

