# Travel Concierge Recommendation Service

A multi-agent travel concierge service that discovers great deals, understands user needs in conversation, and generates actionable trip recommendations.

## Architecture

### Components

1. **FastAPI Application** (`main.py`)
   - HTTP endpoints for chat, bundles, and watch management
   - WebSocket `/events` endpoint for streaming updates

2. **Deals Agent** (Backend Worker)
   - **MongoDB Reader**: Scheduled job that reads from MongoDB collections (flights, hotels) and publishes to Kafka
   - **Normalizer**: Consumes raw feeds, normalizes data, writes to DB and Kafka
   - **Deal Detector**: Computes deal scores based on price drops, scarcity, promos
   - **Offer Tagger**: Applies tags (refundable, pet-friendly, etc.)
   - **Event Emitter**: Emits concise deal events

3. **Concierge Agent** (Chat-facing)
   - **LLM Client**: OpenAI integration for intent parsing and explanations
   - **Trip Planner**: Composes flight+hotel bundles and computes fit scores

4. **Watch Manager**: Evaluates watches and triggers notifications

5. **WebSocket Manager**: Streams Kafka events to connected clients

## Kafka Topics

- `raw_supplier_feeds`: Raw feed data from MongoDB
- `deals.normalized`: Normalized deal records
- `deals.scored`: Deals with computed scores
- `deals.tagged`: Deals with applied tags
- `deal.events`: Concise deal update events
- `watch.events`: Watch trigger notifications

## Data Models

### Core Entities

- **FlightDeal**: Normalized flight deals with pricing and metadata
- **HotelDeal**: Normalized hotel deals with amenities and policies
- **BundleRecommendation**: Flight+hotel bundles with fit scores
- **UserSession**: Chat sessions
- **ChatTurn**: Individual chat messages
- **Watch**: Price/inventory watches

## API Endpoints

### HTTP Endpoints

- `POST /chat`: Chat with the concierge agent
- `GET /sessions/{session_id}/bundles`: Get bundles for a session
- `POST /watches`: Create a watch
- `GET /watches?session_id={id}`: List watches for a session
- `GET /health`: Health check

### WebSocket

- `GET /events?session_id={id}`: Stream deal and watch events

## Environment Variables

- `DATABASE_URL`: SQLite database URL (default: `sqlite:///./recommendation_service.db`)
- `KAFKA_BROKERS`: Kafka broker addresses (default: `localhost:9092`)
- `MONGODB_URI`: MongoDB connection string (required, e.g., `mongodb+srv://user:pass@cluster.mongodb.net/aerive`)
- `OPENAI_API_KEY`: OpenAI API key (required)

## Running the Service

### Prerequisites

- Python 3.11+
- Kafka running (see docker-compose.yml)
- OpenAI API key

### Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
```bash
export OPENAI_API_KEY=your_key_here
export KAFKA_BROKERS=localhost:9092
export MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aerive
```

3. Initialize database:
```python
from database import init_db
init_db()
```

### Running Components

1. **Start MongoDB Reader** (in one terminal):
```bash
python -m deals_agent.mongo_reader
```

2. **Start Normalizer** (in another terminal):
```bash
python -m deals_agent.normalizer
```

3. **Start Deal Detector** (in another terminal):
```bash
python -m deals_agent.deal_detector
```

4. **Start Offer Tagger** (in another terminal):
```bash
python -m deals_agent.offer_tagger
```

5. **Start Event Emitter** (in another terminal):
```bash
python -m deals_agent.event_emitter
```

6. **Start Watch Evaluator** (in another terminal):
```bash
python watch_manager.py
```

7. **Start FastAPI Application**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Example Usage

### Chat Endpoint

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "user123",
    "message": "I need a weekend trip Oct 25-27, SFO to anywhere warm, budget $1000 for two"
  }'
```

### Create Watch

```bash
curl -X POST http://localhost:8000/watches \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "user123",
    "bundle_id": 1,
    "price_threshold_usd": 850
  }'
```

### WebSocket Events

Connect to `ws://localhost:8000/events?session_id=user123` to receive:
- Deal update events
- Watch trigger notifications

## Data Source

The service reads data directly from MongoDB collections:
- `flights` collection: Flight listings with seat types, pricing, and availability
- `hotels` collection: Hotel listings with room types, amenities, and pricing

The MongoDB Reader (`deals_agent/mongo_reader.py`) queries these collections periodically and publishes to Kafka for processing.

### MongoDB Schema Mapping

**Flights**: Maps `flightId`, `departureAirport`, `arrivalAirport`, `seatTypes`, `duration`, etc. to normalized flight deals.

**Hotels**: Maps `hotelId`, `hotelName`, `city`, `roomTypes`, `amenities`, etc. to normalized hotel deals.

Only documents with `status: "Active"` are processed.

## Development

### Running Tests

```bash
pytest tests/
```

### Code Structure

```
recommendation-service/
├── main.py                 # FastAPI application
├── models.py               # SQLModel and Pydantic schemas
├── database.py            # Database setup
├── kafka_config.py         # Kafka configuration
├── deals_agent/           # Deals Agent components
│   ├── mongo_reader.py     # MongoDB to Kafka reader
│   ├── normalizer.py
│   ├── deal_detector.py
│   ├── offer_tagger.py
│   └── event_emitter.py
├── concierge_agent/        # Concierge Agent components
│   ├── llm_client.py
│   └── trip_planner.py
├── watch_manager.py        # Watch evaluation
├── websocket_manager.py    # WebSocket event streaming
└── requirements.txt
```

## Notes

- The service uses SQLite for local development but can be configured for PostgreSQL
- Deal scoring uses simple heuristics (price drop %, scarcity, promos)
- Fit scores combine price vs budget, amenity matches, and convenience factors
- OpenAI is used for intent parsing and generating explanations
- All Kafka consumers use consumer groups for parallelism and fault tolerance

