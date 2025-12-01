"""
Utility script to create Kafka topics for the recommendation service.
Uses kafka-python for topic creation (aiokafka doesn't have admin client in 0.10.0).
"""
import logging
from kafka import KafkaAdminClient
from kafka.admin import NewTopic, ConfigResource, ConfigResourceType

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kafka_config import KAFKA_BOOTSTRAP_SERVERS, ALL_TOPICS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_topics():
    """Create all required Kafka topics."""
    try:
        admin_client = KafkaAdminClient(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            client_id='topic-creator'
        )
        logger.info("Connected to Kafka")
        
        # Create topics
        topics = [
            NewTopic(
                name=topic,
                num_partitions=3,
                replication_factor=1
            )
            for topic in ALL_TOPICS
        ]
        
        result = admin_client.create_topics(new_topics=topics, validate_only=False)
        logger.info(f"Created topics: {result}")
        
        admin_client.close()
        logger.info("Topics created successfully")
        
    except Exception as e:
        logger.error(f"Error creating topics: {e}")
        logger.info("Note: Topics may already exist, or Kafka auto-create is enabled")


if __name__ == "__main__":
    create_topics()

