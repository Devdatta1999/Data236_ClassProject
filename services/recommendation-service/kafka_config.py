"""
Kafka configuration and topic definitions for the recommendation service.
"""
import os
from typing import List

# Kafka broker configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BROKERS", 
    "localhost:9092"
).split(",")

# Topic names
TOPIC_RAW_SUPPLIER_FEEDS = "raw_supplier_feeds"
TOPIC_DEALS_NORMALIZED = "deals.normalized"
TOPIC_DEALS_SCORED = "deals.scored"
TOPIC_DEALS_TAGGED = "deals.tagged"
TOPIC_DEAL_EVENTS = "deal.events"
TOPIC_WATCH_EVENTS = "watch.events"
# New topic: bundle selections that should trigger simulated price drops
TOPIC_BUNDLE_SELECTION = "bundle.selection"

# Consumer group IDs
CONSUMER_GROUP_NORMALIZER = "deals-normalizer-group"
CONSUMER_GROUP_DETECTOR = "deals-detector-group"
CONSUMER_GROUP_TAGGER = "deals-tagger-group"
CONSUMER_GROUP_EVENT_EMITTER = "deals-event-emitter-group"
CONSUMER_GROUP_WATCH_EVALUATOR = "watch-evaluator-group"
CONSUMER_GROUP_FASTAPI_EVENTS = "fastapi-events-group"
# Consumer group for bundle selection price-drop simulator
CONSUMER_GROUP_BUNDLE_SELECTION = "bundle-selection-worker-group"

# All topics that need to be created
ALL_TOPICS: List[str] = [
    TOPIC_RAW_SUPPLIER_FEEDS,
    TOPIC_DEALS_NORMALIZED,
    TOPIC_DEALS_SCORED,
    TOPIC_DEALS_TAGGED,
    TOPIC_DEAL_EVENTS,
    TOPIC_WATCH_EVENTS,
    TOPIC_BUNDLE_SELECTION,
]

