"""
Feed Producer (Option 2): Scheduled job that reads CSV files and publishes to Kafka.
"""
import asyncio
import csv
import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kafka_config import KAFKA_BOOTSTRAP_SERVERS, TOPIC_RAW_SUPPLIER_FEEDS
import logging

logger = logging.getLogger(__name__)


class FeedProducer:
    """Produces CSV feed data to Kafka."""
    
    def __init__(self, feed_dir: str = "data/feeds"):
        self.feed_dir = Path(feed_dir)
        self.producer: Optional[AIOKafkaProducer] = None
        
    async def start(self):
        """Start the producer."""
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        await self.producer.start()
        logger.info("Feed producer started")
        
    async def stop(self):
        """Stop the producer."""
        if self.producer:
            await self.producer.stop()
            logger.info("Feed producer stopped")
    
    def _read_csv_file(self, file_path: Path) -> List[Dict[str, Any]]:
        """Read a CSV file and return rows as dictionaries."""
        rows = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Convert empty strings to None
                    cleaned_row = {k: (v if v else None) for k, v in row.items()}
                    rows.append(cleaned_row)
        except Exception as e:
            logger.error(f"Error reading CSV file {file_path}: {e}")
        return rows
    
    async def publish_csv_file(self, file_path: Path, deal_type: str = "unknown"):
        """Publish a CSV file's rows to Kafka."""
        if not self.producer:
            raise RuntimeError("Producer not started")
            
        rows = self._read_csv_file(file_path)
        logger.info(f"Publishing {len(rows)} rows from {file_path.name} to {TOPIC_RAW_SUPPLIER_FEEDS}")
        
        for idx, row in enumerate(rows):
            message = {
                "deal_type": deal_type,
                "source_file": file_path.name,
                "row_index": idx,
                "data": row,
                "ingested_at": datetime.utcnow().isoformat()
            }
            
            try:
                await self.producer.send_and_wait(
                    TOPIC_RAW_SUPPLIER_FEEDS,
                    value=message,
                    key=f"{deal_type}_{file_path.stem}_{idx}".encode('utf-8')
                )
            except KafkaError as e:
                logger.error(f"Error publishing row {idx} from {file_path.name}: {e}")
        
        logger.info(f"Successfully published {len(rows)} rows from {file_path.name}")
    
    async def scan_and_publish(self):
        """Scan feed directory and publish all CSV files."""
        if not self.feed_dir.exists():
            logger.warning(f"Feed directory {self.feed_dir} does not exist. Creating it.")
            self.feed_dir.mkdir(parents=True, exist_ok=True)
            return
        
        csv_files = list(self.feed_dir.glob("*.csv"))
        if not csv_files:
            logger.warning(f"No CSV files found in {self.feed_dir}")
            return
        
        logger.info(f"Found {len(csv_files)} CSV files to process")
        
        for csv_file in csv_files:
            # Infer deal type from filename (e.g., flights.csv, hotels.csv)
            deal_type = csv_file.stem.lower()
            if "flight" in deal_type:
                deal_type = "flight"
            elif "hotel" in deal_type:
                deal_type = "hotel"
            else:
                deal_type = "unknown"
            
            await self.publish_csv_file(csv_file, deal_type)


async def run_scheduled_producer(interval_seconds: int = 300):
    """Run the producer on a schedule."""
    producer = FeedProducer()
    
    try:
        await producer.start()
        
        while True:
            await producer.scan_and_publish()
            logger.info(f"Sleeping for {interval_seconds} seconds before next scan...")
            await asyncio.sleep(interval_seconds)
            
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        await producer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_scheduled_producer(interval_seconds=300))

