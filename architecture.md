Here’s content you can save as `ARCHITECTURE.md` in the project root:

```markdown
## Aerive Architecture Overview

Aerive is a full‑stack travel marketplace with an AI travel concierge. It supports:

- **Travelers**: Search and book flights, hotels, and cars; manage bookings; use an AI agent to get trip bundles and deal alerts.
- **Hosts/Providers**: Manage property and inventory listings.
- **Admins**: Manage users and oversee the platform.
- **AI Recommendation Service**: Ingests real‑time inventory, scores deals, builds bundles, and powers an LLM‑based assistant.

The system is implemented as **React + Redux** frontend, **Node.js/Express** microservices behind an **API Gateway**, and a **Python FastAPI** recommendation service, orchestrated with **Docker + Kubernetes**, using **MongoDB**, **PostgreSQL/Supabase**, **Redis**, **Kafka**, and **SQLite**.

---

## High‑Level System Architecture

- **Frontend (React SPA)**
  - **Tech**: Vite, React, Redux Toolkit, TailwindCSS.
  - **Responsibilities**:
    - User auth and routing.
    - Traveler, host, and admin dashboards.
    - Classic search and booking flows.
    - AI Concierge chat UI and bundle selection.
    - Cart and checkout UI.

- **API Gateway (Node/Express)**
  - **File**: `services/api-gateway/server.js`
  - **Responsibilities**:
    - Single public entrypoint (`/api/...`).
    - Proxies requests to internal services:
      - `/api/users` → `user-service`
      - `/api/listings` → `listing-service`
      - `/api/bookings` → `booking-service`
      - `/api/billing` → `billing-service`
      - `/api/providers` → `provider-service`
      - `/api/admin` → `admin-service`
    - Handles CORS, JSON/body parsing, central error handling, and logging.

- **Core Microservices (Node/Express)**
  - **User Service** (`services/user-service`)
    - Auth (signup/login, JWT), roles (traveler/host/admin), profiles.
  - **Listing Service** (`services/listing-service`)
    - CRUD + search for flights, hotels, cars (backed by MongoDB Atlas).
    - Exposes `/api/listings/*` endpoints for frontend and AI cart enrichment.
  - **Booking Service** (`services/booking-service`)
    - Booking creation and retrieval.
    - Consumes/produces booking events via Kafka.
  - **Billing Service** (`services/billing-service`)
    - Payment and billing logic using PostgreSQL/Supabase.
  - **Provider Service** (`services/provider-service`)
    - Host/provider CRUD on properties and inventory, image uploads.
  - **Admin Service** (`services/admin-service`)
    - Admin APIs: manage users, inspect system state.
  - **Kafka Proxy** (`services/kafka-proxy`)
    - HTTP façade over Kafka for frontends and tools.

- **Shared Library (Node)**
  - **Directory**: `shared/`
  - **Key modules**:
    - `config/database.js`: MongoDB (Mongoose) + PostgreSQL connection management.
    - `middleware/auth.js`: JWT validation and role checks.
    - `utils/logger.js`, `utils/errors.js`, `utils/validators.js`: logging and error helpers.

- **AI Recommendation Service (Python/FastAPI)**
  - **Directory**: `services/recommendation-service`
  - **Core components**:
    - `main.py`: FastAPI app with HTTP and WebSocket endpoints.
    - `models.py`: SQLModel DB models + Pydantic response schemas.
    - `database.py`: SQLite DB initialization and Session management.
    - `concierge_agent/llm_client.py`: OpenAI wrapper and `TravelIntent` parsing.
    - `concierge_agent/trip_planner.py`: Flight+hotel bundle composition and fit scoring.
    - `deals_agent/*`: Mongo → Kafka reader, normalizer, deal detector, offer tagger, event emitter.
    - `watch_manager.py`: Evaluates price/inventory watches.
    - `websocket_manager.py`: Manages WebSocket connections and sends events.

- **Datastores & Messaging**
  - **MongoDB Atlas**
    - Primary operational data:
      - `flights`, `hotels`, `cars` collections.
  - **PostgreSQL / Supabase**
    - Billing and financial records for `billing-service`.
  - **Redis**
    - Caching and ephemeral state.
  - **SQLite**
    - `recommendation_service.db`: deals, chat sessions, bundles, watches, selected bundles.
  - **Kafka**
    - Topics for ingesting and enriching deal data:
      - `raw_supplier_feeds`, `deals.normalized`, `deals.scored`, `deals.tagged`, `deal.events`, `watch.events`.

- **Infrastructure**
  - `docker-compose.yml`: Kafka, Redis, and other infra for local dev.
  - `infrastructure/kubernetes/*.yaml`: Deployments, Services, PV/PVC, secrets, and ConfigMaps for all services.
  - Scripts: `build-images.sh`, `deploy-k8s.sh`, `setup-port-forwards.sh`.

---

## Frontend Architecture & Flows

### Frontend Structure

- **Entry**: `frontend/src/main.jsx`, `App.jsx`
  - Configures routes, Redux store, and renders global `Navbar`, `AIChatModal`, and notifications.
- **Pages**:
  - **Public**:
    - `LandingPage.jsx`: hero section, multi‑mode `SearchBar`, “AI Mode” launcher.
    - `LoginPage.jsx`, `SignupPage.jsx`, `HostSignupPage.jsx`, `AdminSignupPage.jsx`.
  - **Traveler** (`pages/traveler/`):
    - `TravelerDashboard`, `SearchResults`, `HotelDetailPage`, `FlightDetailPage`, `CarDetailPage`,
      `CheckoutPage`, `PaymentPage`, `AIPaymentQuotePage`, `MyBookings`, `ProfilePage`.
  - **Host**: `HostDashboard`, `HostProfilePage`.
  - **Admin**: `AdminDashboard`, `EditUserPage`.

- **Key Components**:
  - `components/search/SearchBar.jsx`
    - Unified flights/hotels/cars search UI.
    - On submit, navigates to `/search` with params.
    - “AI Mode” button generates a `sessionId` and opens chat.
  - `components/chat/AIChatModal.jsx`
    - Modal chat UI for the AI Travel Concierge.
    - Displays messages, typing indicator, and “Recommended Bundles” list with prices and fit scores.
    - Sends messages via `chatService.sendChatMessage`.
    - On bundle select, calls `chatService.selectBundle`, converts result into cart items, then navigates to checkout.
  - `hooks/useRecommendationEvents.js`
    - Subscribes to `ws://<VITE_RECOMMENDATION_WS_URL or localhost>:8000/events?session_id=<sessionId>`.
    - On `deal_update` with `reason: "simulated_price_drop"`, dispatches a success notification.
    - On `watch_triggered`, dispatches an info notification.

- **State Management (Redux)**
  - `authSlice`: JWT token, user info, user type (traveler/host/admin).
  - `chatSlice`:
    - **Fields**: `isOpen`, `sessionId`, `messages`, `bundles`, `isLoading`, `error`.
    - Persists `messages` in `localStorage` keyed by `chat_<sessionId>`.
    - `openChat` auto‑creates a `sessionId` if missing and restores previous messages.
  - `cartSlice`: list of items (flights/hotels/cars) ready for checkout.
  - `searchSlice`, `notificationSlice`, and others for auxiliary features.

### Main User Flows

- **Authentication Flow**
  - Frontend → `api-gateway /api/users` → `user-service`.
  - Successful login stores JWT and user data in localStorage; `authSlice` is hydrated on app start.

- **Classic Search & Booking Flow**
  - Traveler selects mode (Flights, Hotels, Cars) on `LandingPage`.
  - `SearchBar` captures parameters and dispatches a search, then navigates to `/search`.
  - Search page fetches from `api-gateway /api/listings` and shows results.
  - Details pages (`HotelDetailPage`, `FlightDetailPage`, `CarDetailPage`) show deep information and allow adding items to cart.
  - Checkout and payment:
    - `CheckoutPage` builds order from cart.
    - `PaymentPage` calls `api-gateway /api/billing` and `api-gateway /api/bookings`.
  - Travelers see their bookings on `MyBookings` and `BookingDetails`.

- **AI Concierge User Flow**
  1. **Start AI Mode**
     - User clicks “AI Mode” on `LandingPage` or in `SearchBar`.
     - A new `sessionId` is generated: `session_<timestamp>_<random>` and stored via `chatSlice.setSessionId`.
     - `openChat()` opens `AIChatModal`, optionally restoring existing chat for that `sessionId`.
  2. **Chat**
     - User types a request (e.g., “I need a trip from SFO to Los Angeles on Oct 25‑27, $800 for 2 people”).
     - The message is added to `chatSlice.messages` and persisted locally.
     - Frontend calls `sendChatMessage(sessionId, message)` → `recommendation-service /chat`.
  3. **Receive Recommendations**
     - Backend returns:
       - `message`: a conversational summary.
       - `bundles`: up to 3 `BundleResponse` objects with flights, hotels, prices, fit scores, explanations.
       - `intent_parsed`: the parsed `TravelIntent`.
     - These are rendered in the chat and in the “Recommended Bundles” section.
  4. **Select Bundle**
     - User clicks “Select” on a bundle.
     - Frontend calls `selectBundle(sessionId, bundleId)` → `recommendation-service /bundles/select`.
     - Backend responds with a `CheckoutQuote` (bundled flights/hotels, travelers, travel dates, total price).
     - Frontend:
       - Fetches detailed listing data via `api/listings/flights/:id` and `api/listings/hotels/:id`.
       - Converts the quote into cart items and dispatches `cartSlice.addToCart`.
       - Closes chat and navigates to `/checkout` or `AIPaymentQuotePage`.

- **Real‑Time Notifications**
  - `useRecommendationEvents` remains active while the app runs:
    - When a selected bundle experiences a simulated price drop, backend sends a `deal_update` event.
    - When a watch hits its threshold, backend sends a `watch_triggered` event.
  - Notifications appear globally with action buttons that can navigate to checkout.

---

## Backend Microservices & Data

### API Gateway

- **File**: `services/api-gateway/server.js`
- **Responsibilities**:
  - Load env via `dotenv`.
  - Configure service URLs (User, Listing, Booking, Billing, Provider, Admin).
  - Define `/health` endpoint for the gateway.
  - Proxy routes to the respective services using `http-proxy-middleware`.
  - Uniform error logging and response shaping.

### Core Domain Services

- **User Service**
  - Path: `services/user-service`
  - Uses shared `mongoose` instance from `shared/config/database.js`.
  - Supports:
    - Registration and login flows.
    - JWT issuing and validation (with `shared/middleware/auth.js`).
    - User CRUD and profile updates.

- **Listing Service**
  - Path: `services/listing-service`
  - Owns MongoDB models for:
    - Flights (`Flight`).
    - Hotels (`Hotel`).
    - Cars (`Car`).
  - Endpoints for:
    - Searching inventory by location, dates, and filters.
    - Retrieving detailed listing info (used by AI checkout flow).
  - Writes to Mongo `flights`, `hotels`, `cars` collections (which the recommendation service reads via `mongo_reader.py`).

- **Booking Service**
  - Path: `services/booking-service`
  - Uses:
    - MongoDB for booking records.
    - Kafka consumers for booking events.
  - Capabilities:
    - Create bookings from cart contents (after billing approval).
    - Fetch bookings by traveler or group.
    - Emit events for other parts of the system.

- **Billing Service**
  - Path: `services/billing-service`
  - Uses PostgreSQL / Supabase via `pg` pool in `shared/config/database.js`.
  - Responsibilities:
    - Validate cart and pricing.
    - Create charges and store billing outcomes.
    - Provide payment status back to frontend and booking service.

- **Provider Service**
  - Path: `services/provider-service`
  - For hosts:
    - Manage listings (CRUD).
    - Upload images and assets.
  - Integrates with `listing-service` and MongoDB to ensure provider changes propagate.

- **Admin Service**
  - Path: `services/admin-service`
  - Offers:
    - Admin CRUD on users and providers.
    - System‑level views suitable for admin dashboards.

- **Kafka Proxy**
  - Path: `services/kafka-proxy`
  - Bridges Kafka with HTTP/SSE/WebSockets to allow non‑Kafka clients to publish/subscribe to topics.

---

## Recommendation Service: AI Concierge & Deals Pipeline

### Data Flow from MongoDB to Deals

1. **MongoDB Collections** (`aerive` DB)
   - `flights` with `status: "Active"`.
   - `hotels` with `status: "Active"`.
   - `cars` with `status: "Active"` (optional for recommendations).

2. **Mongo Reader** (`deals_agent/mongo_reader.py`)
   - Uses `MONGODB_URI` to connect to MongoDB.
   - Reads all active documents from `flights` and `hotels`.
   - Transforms them into an intermediate format and publishes to Kafka topic `raw_supplier_feeds`.

3. **Normalizer** (`deals_agent/normalizer.py`)
   - Consumes `raw_supplier_feeds`.
   - Normalizes:
     - Flight → `FlightDeal` SQLModel instances.
     - Hotel → `HotelDeal` SQLModel instances.
   - Writes normalized rows into SQLite `recommendation_service.db`.
   - Publishes enriched records to `deals.normalized`.

4. **Deal Detector** (`deals_agent/deal_detector.py`)
   - Consumes `deals.normalized`.
   - Computes deal metrics:
     - `deal_score`, `price_drop_pct`, `is_scarce`, `has_promo`, etc.
   - Updates `FlightDeal` and `HotelDeal` records.
   - Publishes to `deals.scored`.

5. **Offer Tagger** (`deals_agent/offer_tagger.py`)
   - Consumes `deals.scored`.
   - Creates `OfferTag` entries per deal:
     - `refundable`, `non_refundable`, `pet_friendly`, `near_transit`, `breakfast`, etc.
   - Publishes to `deals.tagged`.

6. **Event Emitter** (`deals_agent/event_emitter.py`)
   - Listens to `deals.tagged`.
   - Emits light‑weight `deal.events` for notifications and analytics.

### Chat & Bundle Generation

1. **Session & History Handling** (`main.py`)
   - Endpoint: `POST /chat` with `{ "session_id": "<string>", "message": "<user text>" }`.
   - Logic:
     - Finds or creates a `UserSession` row keyed by `session_id`.
     - Loads all prior `ChatTurn` records for that session (for context).
     - Stores the new user message as a `ChatTurn`.

2. **Intent Parsing** (`concierge_agent/llm_client.py`)
   - Constructs a `system` prompt instructing the model to:
     - Preserve previously known details (origin, destination, dates, budget, travelers).
     - Update only fields mentioned in the latest user message.
     - Return a strict JSON object describing `TravelIntent`.
   - Calls OpenAI via `AsyncOpenAI`:
     - API key: read from environment (`OPENAI_API_KEY`) loaded via `python-dotenv` and `load_dotenv()`.
   - On failure or missing key:
     - Falls back to `_basic_intent_from_chat(chat_history)`:
       - Parses airport codes, dates (`YYYY-MM-DD`), budgets, and travelers across all user messages.
       - If origin, dates, or budget are missing, sets `needs_clarification = True` and returns a clarifying question instead of guessing.
   - Stores parsed intent as JSON on the latest `ChatTurn.intent_data`.

3. **Clarification Handling**
   - If `intent.needs_clarification` is `True`:
     - Writes an assistant `ChatTurn` with `intent.clarifying_question` text.
     - Returns a `ChatResponse` that only contains the clarifying message (no bundles).

4. **Trip Planning & Bundles** (`concierge_agent/trip_planner.py`)
   - `TripPlanner.plan_bundles(intent, session_internal_id, max_bundles=3)`:
     - Parses start/end dates; if needed, infers a short trip window when only start date is known.
     - Selects flights:
       - Origin must match.
       - Destination resolved via `airport_mapper` (city to airport codes).
       - Uses ±2‑day window around requested departure, then ±14‑day fallback if none found.
       - Applies constraints: avoid red‑eye, min `deal_score`, etc.
     - Selects hotels:
       - Checks date overlap with requested trip.
       - Filters by city/neighborhood resolved from destination + airport/city mappings.
       - Applies constraints: pet‑friendly, breakfast, near transit, refundable.
     - For each (flight, hotel) pair:
       - Ensures date overlap.
       - Computes bundle price: \( flight\_price \times travelers + hotel\_price \).
       - Enforces budget with some flexibility (e.g., allow up to 20% over).
       - Computes `fit_score` based on:
         - Price vs budget.
         - Flights/hotels `deal_score`.
         - Constraint satisfaction ratio.
         - Convenience (flight duration, hotel star rating).
       - Persists `BundleRecommendation`, `BundleFlight`, `BundleHotel` entries tied to the session.
   - Returns up to `max_bundles` top‑scoring bundles.

5. **Explanations & Watch Notes**
   - For each bundle, builds a summary and calls:
     - `explain_bundle(bundle_data, constraints)` → ≤ 25‑word human explanation.
     - `generate_watch_notes(bundle_data)` → ≤ 12‑word watch summary.
   - Stores explanation and watch notes on `BundleRecommendation` and returns them to the client.

6. **Chat Response Shape**
   - `ChatResponse` includes:
     - **`session_id`**: original string.
     - **`message`**: assistant summary (e.g., “I found 2 bundles… Top recommendation: …”).
     - **`bundles`**: array of `BundleResponse`:
       - `bundle_name`, `total_price_usd`, `fit_score`, `explanation`, `watch_notes`.
       - Arrays of `FlightDealResponse` and `HotelDealResponse`.
     - **`intent_parsed`**: JSON object of the `TravelIntent`.

### Bundle Selection, Quotes, and Events

1. **Bundle Selection** (`POST /bundles/select`)
   - Request: `{ "session_id": "<string>", "bundle_id": <int> }`.
   - Backend:
     - Validates that the bundle belongs to the given `UserSession`.
     - Ensures a `SelectedBundle` row exists (creates if not).
     - Builds a `CheckoutQuote`:
       - Rehydrates full flight & hotel records.
       - Deduces `travelers` from recent `ChatTurn.intent_data`.
       - Extracts travel dates from flight or hotel.
       - Assigns `quote_id` (`QUOTE-<bundle_id>-<timestamp>`) and expiry timestamp.
   - Response: `SelectBundleResponse { success, message, quote }`.

2. **Frontend Quote Handling**
   - On success with `quote`:
     - Fetches details for each `quote.flight` and `quote.hotel` via `listing-service` through `api-gateway`.
     - Converts them into cart entries with correct quantities, per-night/per-seat pricing, images, and addresses.
     - Clears previous cart, adds items, closes chat, navigates to `/checkout` or `AIPaymentQuotePage`.

3. **Simulated Price Drops** (`simulate_price_drop_for_bundle`)
   - Triggered after bundle selection.
   - Steps:
     - Wait ~5 seconds (async).
     - Compute a 5% discount on `bundle.total_price_usd`.
     - Update DB and construct an event payload:
       - `event_type: "deal_update"`, `reason: "simulated_price_drop"`, `old_total_price_usd`, `new_total_price_usd`, `bundle_id`, `session_id`.
     - Sends payload to all connections for that session via `websocket_manager.send_personal_message`.

4. **Watches** (`POST /watches`, `GET /watches`)
   - User can create a `Watch` on:
     - A bundle (`bundle_id`).
     - A specific flight (`flight_deal_id`).
     - A specific hotel (`hotel_deal_id`).
   - Attributes may include `price_threshold_usd` and/or `inventory_threshold`.
   - `WatchManager` evaluates these over time and emits `watch.events` when thresholds are crossed.
   - WebSocket clients receive `watch_triggered` messages, and frontend shows “A watch you set has been triggered” notifications.

---

## Capabilities Summary

- **What the project can do now**
  - **Travelers** can:
    - Sign up, log in, and manage profile and bookings.
    - Search flights, hotels, and cars with filters and date ranges.
    - View rich listing detail pages and book via a standard checkout flow.
    - Use the AI Travel Concierge channel to:
      - Describe a trip in natural language.
      - Get ranked flight+hotel bundles with explanations and fit scores.
      - Select an AI‑recommended bundle and flow into checkout.
      - Receive simulated price‑drop alerts and watch notifications in real time.
  - **Hosts/Providers** can:
    - Register as providers, manage listings and availability, upload images.
  - **Admins** can:
    - Manage users and providers and access admin dashboards.
  - **Platform**:
    - Ingests real inventory from MongoDB into the recommendation pipeline.
    - Scores deals and tags offers for better ranking and filtering.
    - Streams deal and watch events via Kafka and WebSockets.

- **Extensibility**
  - Add new deal heuristics and tags in `deal_detector.py` and `offer_tagger.py`.
  - Expand the AI agent to:
    - Support cars or multi‑city trips.
    - Answer more complex policy/logistics questions via `answer_policy_question`.
  - Integrate real payment providers in `billing-service`.
  - Scale individual services independently via Kubernetes.

```