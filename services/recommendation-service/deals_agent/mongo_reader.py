"""
MongoDB Reader: Reads from MongoDB collections and publishes to Kafka.
Replaces CSV feed producer with direct MongoDB connection.
"""
import asyncio
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional, List

from bson import ObjectId
from dotenv import load_dotenv
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import KAFKA_BOOTSTRAP_SERVERS, TOPIC_RAW_SUPPLIER_FEEDS
import logging

logger = logging.getLogger(__name__)

# Load environment variables from a .env file (if present) so that
# MONGODB_URI and Kafka settings can be configured locally without
# needing to export them in every shell session.
load_dotenv()


class MongoReader:
    """Reads from MongoDB and produces to Kafka."""
    
    def __init__(self, mongodb_uri: Optional[str] = None, database_name: str = "aerive"):
        self.mongodb_uri = mongodb_uri or os.getenv("MONGODB_URI", "mongodb://localhost:27017/aerive")
        self.database_name = database_name
        self.client: Optional[MongoClient] = None
        self.db = None
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start MongoDB connection and Kafka producer."""
        # Connect to MongoDB (pymongo is synchronous, but we'll use it in async context)
        try:
            self.client = MongoClient(
                self.mongodb_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            # Test connection
            self.client.admin.command('ping')
            self.db = self.client[self.database_name]
            logger.info(f"MongoDB connected to {self.database_name}")
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        
        # Start Kafka producer
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8')
        )
        await self.producer.start()
        logger.info("Kafka producer started")
    
    async def stop(self):
        """Stop MongoDB connection and Kafka producer."""
        if self.producer:
            await self.producer.stop()
            logger.info("Kafka producer stopped")
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed")
    
    def _transform_flight(self, flight_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Transform MongoDB flight document to expected format.
        Returns a list because one flight can have multiple seat types."""
        try:
            # Get the first seat type (or use legacy fields)
            seat_type = None
            if flight_doc.get("seatTypes") and len(flight_doc["seatTypes"]) > 0:
                seat_type = flight_doc["seatTypes"][0]
                price = seat_type.get("ticketPrice", 0)
                available_seats = seat_type.get("availableSeats", 0)
            else:
                # Use legacy fields
                price = flight_doc.get("ticketPrice", 0)
                available_seats = flight_doc.get("availableSeats", 0)
            
            # Determine departure date
            # If departureDateTime exists, use it; otherwise construct from availableFrom + departureTime
            departure_date = flight_doc.get("departureDateTime")
            if not departure_date and flight_doc.get("availableFrom"):
                # Use availableFrom as base date (we'll use the date part)
                available_from = flight_doc["availableFrom"]
                if isinstance(available_from, str):
                    available_from = datetime.fromisoformat(available_from.replace('Z', '+00:00'))
                departure_date = available_from
            
            # Determine return date (if round trip)
            return_date = flight_doc.get("arrivalDateTime")
            
            # Determine if red-eye (departure time is late night/early morning)
            is_red_eye = False
            departure_time = flight_doc.get("departureTime", "")
            if departure_time:
                try:
                    hour = int(departure_time.split(":")[0])
                    if hour >= 22 or hour < 6:
                        is_red_eye = True
                except:
                    pass
            
            # Build the transformed document
            transformed = {
                "id": flight_doc.get("flightId", str(flight_doc.get("_id", ""))),
                "origin": flight_doc.get("departureAirport", "").upper(),
                "destination": flight_doc.get("arrivalAirport", "").upper(),
                "departure_date": departure_date.isoformat() if isinstance(departure_date, datetime) else str(departure_date),
                "return_date": return_date.isoformat() if return_date and isinstance(return_date, datetime) else (str(return_date) if return_date else None),
                "price": price,
                "currency": "USD",  # Assuming USD for now
                "airline": flight_doc.get("providerName", ""),
                "flight_number": flight_doc.get("flightId", ""),
                "duration_minutes": flight_doc.get("duration", 0),
                "stops": 0,  # Not in MongoDB schema, default to 0
                "is_red_eye": is_red_eye,
                "baggage_included": True,  # Not in schema, default to True
                "available_seats": available_seats,
                "promo_end_date": None,  # Not in schema
                # Include original document for reference
                "_mongo_id": str(flight_doc.get("_id", "")),
                "status": flight_doc.get("status", "Active"),
            }
            
            # Only return if we have required fields
            if transformed["origin"] and transformed["destination"] and transformed["departure_date"]:
                return [transformed]
            else:
                logger.warning(f"Skipping flight {flight_doc.get('flightId')} - missing required fields")
                return []
        except Exception as e:
            logger.error(f"Error transforming flight {flight_doc.get('flightId', 'unknown')}: {e}")
            return []
    
    def _transform_hotel(self, hotel_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Transform MongoDB hotel document to expected format.
        Returns a list because one hotel can have multiple room types."""
        try:
            # Get the first room type (or use default)
            room_type = None
            price_per_night = None
            available_rooms = 0
            
            if hotel_doc.get("roomTypes") and len(hotel_doc["roomTypes"]) > 0:
                room_type = hotel_doc["roomTypes"][0]
                price_per_night = room_type.get("pricePerNight")
                available_rooms = room_type.get("availableCount", 0)
            else:
                # No room types - try to get from availableRooms
                available_rooms = hotel_doc.get("availableRooms", 0)
                # If no price info, we can't create a valid deal - skip it
                logger.warning(f"Hotel {hotel_doc.get('hotelId')} has no roomTypes with pricing - skipping")
                return []
            
            # Skip if no valid price
            if not price_per_night or price_per_night <= 0:
                logger.warning(f"Hotel {hotel_doc.get('hotelId')} has invalid price - skipping")
                return []
            
            # Use availableFrom/availableTo as check-in/check-out dates
            check_in = hotel_doc.get("availableFrom")
            check_out = hotel_doc.get("availableTo")
            
            if isinstance(check_in, str):
                check_in = datetime.fromisoformat(check_in.replace('Z', '+00:00'))
            if isinstance(check_out, str):
                check_out = datetime.fromisoformat(check_out.replace('Z', '+00:00'))
            
            # Extract amenities to determine features
            amenities = hotel_doc.get("amenities", [])
            amenities_lower = [a.lower() if isinstance(a, str) else str(a).lower() for a in amenities]
            
            transformed = {
                "id": hotel_doc.get("hotelId", str(hotel_doc.get("_id", ""))),
                "hotel_name": hotel_doc.get("hotelName", ""),
                "city": hotel_doc.get("city", ""),
                "country": hotel_doc.get("country", "USA"),
                "address": hotel_doc.get("address", ""),
                "neighborhood": "",  # Not in schema
                "check_in_date": check_in.isoformat() if isinstance(check_in, datetime) else str(check_in),
                "check_out_date": check_out.isoformat() if isinstance(check_out, datetime) else str(check_out),
                "price_per_night": price_per_night,
                "currency": "USD",
                "star_rating": hotel_doc.get("starRating", 3),
                "is_refundable": True,  # Default, not in schema
                "cancellation_window_days": 7,  # Default, not in schema
                "pet_friendly": "pet" in " ".join(amenities_lower) or "pets" in " ".join(amenities_lower),
                "breakfast_included": "breakfast" in " ".join(amenities_lower),
                "near_transit": "transit" in " ".join(amenities_lower) or "metro" in " ".join(amenities_lower) or "subway" in " ".join(amenities_lower),
                "parking_available": "parking" in " ".join(amenities_lower),
                "available_rooms": available_rooms,
                "promo_end_date": None,
                # Include original document for reference
                "_mongo_id": str(hotel_doc.get("_id", "")),
                "status": hotel_doc.get("status", "Active"),
            }
            
            # Only return if we have required fields
            if transformed["hotel_name"] and transformed["city"] and transformed["check_in_date"]:
                return [transformed]
            else:
                logger.warning(f"Skipping hotel {hotel_doc.get('hotelId')} - missing required fields")
                return []
        except Exception as e:
            logger.error(f"Error transforming hotel {hotel_doc.get('hotelId', 'unknown')}: {e}")
            return []
    
    async def publish_documents(self, collection_name: str, deal_type: str, filter_query: Optional[Dict] = None):
        """Read documents from MongoDB collection and publish to Kafka."""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        collection = self.db[collection_name]
        
        # Default filter: only Active status
        if filter_query is None:
            filter_query = {"status": "Active"}
        else:
            filter_query.setdefault("status", "Active")
        
        try:
            # Query documents
            documents = list(collection.find(filter_query))
            logger.info(f"Found {len(documents)} {deal_type} documents in {collection_name}")
            
            if not documents:
                return
            
            published_count = 0
            for idx, doc in enumerate(documents):
                # Transform based on deal type
                if deal_type == "flight":
                    transformed_list = self._transform_flight(doc)
                elif deal_type == "hotel":
                    transformed_list = self._transform_hotel(doc)
                else:
                    logger.warning(f"Unknown deal type: {deal_type}")
                    continue
                
                # Publish each transformed document
                for transformed in transformed_list:
                    message = {
                        "deal_type": deal_type,
                        "source": f"mongodb:{collection_name}",
                        "row_index": idx,
                        "data": transformed,
                        "ingested_at": datetime.utcnow().isoformat()
                    }
                    
                    try:
                        await self.producer.send_and_wait(
                            TOPIC_RAW_SUPPLIER_FEEDS,
                            value=message,
                            key=f"{deal_type}_{transformed.get('id', idx)}".encode('utf-8')
                        )
                        published_count += 1
                    except KafkaError as e:
                        logger.error(f"Error publishing {deal_type} document {idx}: {e}")
            
            logger.info(f"Successfully published {published_count} {deal_type} documents to Kafka")
        except Exception as e:
            logger.error(f"Error reading from {collection_name}: {e}")
            raise
    
    async def scan_and_publish(self):
        """Scan MongoDB collections and publish all active documents."""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        # Publish flights
        try:
            await self.publish_documents("flights", "flight")
        except Exception as e:
            logger.error(f"Error publishing flights: {e}")
        
        # Publish hotels
        try:
            await self.publish_documents("hotels", "hotel")
        except Exception as e:
            logger.error(f"Error publishing hotels: {e}")
        
        # Note: Cars are out of scope for MVP, but we could add them here if needed


async def run_scheduled_reader(interval_seconds: int = 300):
    """Run the MongoDB reader on a schedule."""
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/aerive")
    reader = MongoReader(mongodb_uri=mongodb_uri)
    
    try:
        await reader.start()
        
        while True:
            await reader.scan_and_publish()
            logger.info(f"Sleeping for {interval_seconds} seconds before next scan...")
            await asyncio.sleep(interval_seconds)
            
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await reader.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_scheduled_reader(interval_seconds=300))

