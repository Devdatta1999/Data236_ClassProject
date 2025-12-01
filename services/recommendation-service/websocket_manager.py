"""
WebSocket manager for streaming events to clients.
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kafka_config import (
    KAFKA_BOOTSTRAP_SERVERS,
    TOPIC_DEAL_EVENTS,
    TOPIC_WATCH_EVENTS,
    CONSUMER_GROUP_FASTAPI_EVENTS
)
from aiokafka import AIOKafkaConsumer

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and streams Kafka events."""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # session_id -> set of websockets
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.running = False
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """Connect a WebSocket for a session."""
        await websocket.accept()
        
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        
        self.active_connections[session_id].add(websocket)
        logger.info(f"WebSocket connected for session {session_id}")
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        """Disconnect a WebSocket."""
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"WebSocket disconnected for session {session_id}")
    
    async def send_personal_message(self, message: dict, session_id: str):
        """Send message to all WebSockets for a session."""
        if session_id not in self.active_connections:
            return
        
        disconnected = set()
        for websocket in self.active_connections[session_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to WebSocket: {e}")
                disconnected.add(websocket)
        
        # Remove disconnected websockets
        for ws in disconnected:
            self.active_connections[session_id].discard(ws)
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected sessions."""
        for session_id in list(self.active_connections.keys()):
            await self.send_personal_message(message, session_id)
    
    async def start_kafka_consumer(self):
        """Start consuming Kafka events and forwarding to WebSockets."""
        self.consumer = AIOKafkaConsumer(
            TOPIC_DEAL_EVENTS,
            TOPIC_WATCH_EVENTS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=CONSUMER_GROUP_FASTAPI_EVENTS,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='latest',
            enable_auto_commit=True
        )
        
        await self.consumer.start()
        self.running = True
        logger.info("Kafka consumer started for WebSocket events")
        
        try:
            async for message in self.consumer:
                try:
                    event_data = message.value
                    event_type = event_data.get("event_type")
                    
                    # Route based on event type
                    if event_type == "deal_update":
                        # If the event is tied to a specific session (e.g., a
                        # simulated price drop for a selected bundle), send it
                        # only to that session. Otherwise broadcast.
                        target_session_id = event_data.get("session_id")
                        payload = {
                            "type": "deal_update",
                            "data": event_data,
                            "timestamp": event_data.get("timestamp"),
                        }
                        if target_session_id:
                            await self.send_personal_message(payload, str(target_session_id))
                        else:
                            await self.broadcast(payload)
                    
                    elif event_type == "watch_triggered":
                        # Send to specific session
                        session_id = str(event_data.get("session_id", ""))
                        if session_id:
                            await self.send_personal_message({
                                "type": "watch_triggered",
                                "data": event_data,
                                "timestamp": event_data.get("triggered_at")
                            }, session_id)
                
                except Exception as e:
                    logger.error(f"Error processing Kafka message: {e}", exc_info=True)
        
        except Exception as e:
            logger.error(f"Kafka consumer error: {e}", exc_info=True)
        finally:
            self.running = False
    
    async def stop_kafka_consumer(self):
        """Stop Kafka consumer."""
        self.running = False
        if self.consumer:
            await self.consumer.stop()
        logger.info("Kafka consumer stopped")


# Global instance
websocket_manager = WebSocketManager()

