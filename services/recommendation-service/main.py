"""
FastAPI application for the recommendation service.
"""
import logging
import asyncio
import json
import re
from contextlib import asynccontextmanager
from typing import List
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

import sys
import os
# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import get_session, init_db, engine
from models import (
    ChatRequest, ChatResponse, BundleResponse, WatchRequest, WatchResponse,
    FlightDealResponse, HotelDealResponse, EventMessage, UserSession, ChatTurn,
    Watch, WatchStatus, BundleRecommendation, BundleFlight, BundleHotel,
    SelectedBundle, SelectBundleRequest, SelectBundleResponse, CheckoutQuote
)
from concierge_agent.llm_client import parse_intent, explain_bundle, generate_watch_notes
from concierge_agent.trip_planner import TripPlanner
from websocket_manager import websocket_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown.

    In the simplified, no-Kafka dev mode we only need to initialise the
    database. Kafka consumers/producers are not started so the app can
    run without any Kafka infrastructure.
    """
    logger.info("Initializing database...")
    init_db()
    
    # No-op on startup/shutdown beyond DB init.
    yield
    
    logger.info("Shutting down recommendation-service (no Kafka cleanup needed)")


app = FastAPI(
    title="Travel Concierge Recommendation Service",
    description="Multi-agent travel concierge with deal discovery and recommendations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, session: Session = Depends(get_session)):
    """Chat endpoint for user interactions."""
    # Get or create session
    user_session = session.exec(
        select(UserSession).where(UserSession.session_id == request.session_id)
    ).first()
    
    if not user_session:
        user_session = UserSession(session_id=request.session_id)
        session.add(user_session)
        session.commit()
        session.refresh(user_session)
    
    # Get chat history
    chat_turns = session.exec(
        select(ChatTurn).where(ChatTurn.session_id == user_session.id)
        .order_by(ChatTurn.created_at)
    ).all()
    
    chat_history = [
        {"role": turn.role, "content": turn.message}
        for turn in chat_turns
    ]
    
    # Add current user message
    chat_history.append({"role": "user", "content": request.message})
    
    # Save user message
    user_turn = ChatTurn(
        session_id=user_session.id,
        role="user",
        message=request.message
    )
    session.add(user_turn)
    session.commit()

    # If the user just sends a short greeting or small-talk (e.g. "hi"),
    # don't re-run the planner or repeat previous bundles. Instead, reply
    # with a friendly clarifying prompt.
    normalized = request.message.strip().lower()
    if normalized:
        tokens = normalized.split()
        is_short = len(tokens) <= 4
        is_greeting = re.search(
            r"\b(hi|hello|hey|thanks|thank you|hola|yo)\b", normalized
        )
        has_airport_code = re.search(r"\b[A-Z]{3}\b", request.message)

        if is_short and is_greeting and not has_airport_code:
            assistant_text = (
                "Hi! Tell me where you're traveling from and to, your dates, "
                "budget, and how many people are traveling."
            )

            assistant_turn = ChatTurn(
                session_id=user_session.id,
                role="assistant",
                message=assistant_text,
            )
            session.add(assistant_turn)
            session.commit()

            return ChatResponse(
                session_id=request.session_id,
                message=assistant_text,
                # ChatResponse expects a dict here, so return an empty object
                # rather than None when we're only sending a greeting reply.
                intent_parsed={},
            )
    
    # Parse intent
    intent = await parse_intent(chat_history)
    
    # Save intent data
    user_turn.intent_data = intent.model_dump()
    session.add(user_turn)
    session.commit()
    
    # Handle clarifying question
    if intent.needs_clarification:
        assistant_turn = ChatTurn(
            session_id=user_session.id,
            role="assistant",
            message=intent.clarifying_question or "Could you provide more details?"
        )
        session.add(assistant_turn)
        session.commit()
        
        return ChatResponse(
            session_id=request.session_id,
            message=intent.clarifying_question or "Could you provide more details?",
            clarifying_question=intent.clarifying_question,
            intent_parsed=intent.model_dump()
        )
    
    # Plan bundles
    planner = TripPlanner(session)
    bundles = planner.plan_bundles(intent, user_session.id, max_bundles=3)
    
    if not bundles:
        assistant_message = "I couldn't find any matching deals. Could you try adjusting your dates or budget?"
        assistant_turn = ChatTurn(
            session_id=user_session.id,
            role="assistant",
            message=assistant_message
        )
        session.add(assistant_turn)
        session.commit()
        
        return ChatResponse(
            session_id=request.session_id,
            message=assistant_message,
            intent_parsed=intent.model_dump()
        )
    
    # Generate explanations for bundles
    bundle_responses = []
    for bundle in bundles:
        # Load relationships
        session.refresh(bundle)
        
        # Get flights and hotels
        flights = []
        hotels = []
        
        for bf in bundle.flights:
            flight = bf.flight_deal
            flights.append(FlightDealResponse(
                id=flight.id,
                external_id=flight.external_id,
                origin=flight.origin,
                destination=flight.destination,
                departure_date=flight.departure_date,
                return_date=flight.return_date,
                price_usd=flight.price_usd,
                airline=flight.airline,
                duration_minutes=flight.duration_minutes,
                stops=flight.stops,
                is_red_eye=flight.is_red_eye,
                deal_score=flight.deal_score,
                tags=[tag.tag_type.value for tag in flight.tags]
            ))
        
        for bh in bundle.hotels:
            hotel = bh.hotel_deal
            hotels.append(HotelDealResponse(
                id=hotel.id,
                external_id=hotel.external_id,
                hotel_name=hotel.hotel_name,
                city=hotel.city,
                check_in_date=hotel.check_in_date,
                check_out_date=hotel.check_out_date,
                price_per_night_usd=hotel.price_per_night_usd,
                total_price_usd=hotel.total_price_usd,
                star_rating=hotel.star_rating,
                is_refundable=hotel.is_refundable,
                pet_friendly=hotel.pet_friendly,
                breakfast_included=hotel.breakfast_included,
                near_transit=hotel.near_transit,
                deal_score=hotel.deal_score,
                tags=[tag.tag_type.value for tag in hotel.tags]
            ))
        
        # Generate explanation
        bundle_data = {
            "total_price_usd": float(bundle.total_price_usd),
            "fit_score": bundle.fit_score,
            "flight_summary": f"{flights[0].origin} → {flights[0].destination}" if flights else "N/A",
            "hotel_summary": hotels[0].hotel_name if hotels else "N/A"
        }
        
        explanation = await explain_bundle(bundle_data, intent.constraints)
        watch_notes = await generate_watch_notes(bundle_data)
        
        # Update bundle
        bundle.explanation = explanation
        bundle.watch_notes = watch_notes
        session.add(bundle)
        session.commit()
        
        bundle_responses.append(BundleResponse(
            id=bundle.id,
            bundle_name=bundle.bundle_name,
            total_price_usd=bundle.total_price_usd,
            fit_score=bundle.fit_score,
            explanation=explanation,
            watch_notes=watch_notes,
            flights=flights,
            hotels=hotels
        ))
    
    # Generate assistant message
    assistant_message = f"I found {len(bundle_responses)} bundle{'s' if len(bundle_responses) > 1 else ''} for you. "
    if bundle_responses:
        assistant_message += f"Top recommendation: {bundle_responses[0].bundle_name} at ${bundle_responses[0].total_price_usd:.2f}. "
        if bundle_responses[0].explanation:
            assistant_message += bundle_responses[0].explanation
    
    assistant_turn = ChatTurn(
        session_id=user_session.id,
        role="assistant",
        message=assistant_message,
        intent_data=intent.model_dump()
    )
    session.add(assistant_turn)
    session.commit()
    
    return ChatResponse(
        session_id=request.session_id,
        message=assistant_message,
        bundles=bundle_responses,
        intent_parsed=intent.model_dump()
    )


@app.get("/sessions/{session_id}/bundles", response_model=List[BundleResponse])
async def get_bundles(session_id: str, session: Session = Depends(get_session)):
    """Get bundles for a session."""
    user_session = session.exec(
        select(UserSession).where(UserSession.session_id == session_id)
    ).first()
    
    if not user_session:
        return []
    
    bundles = session.exec(
        select(BundleRecommendation).where(BundleRecommendation.session_id == user_session.id)
        .order_by(BundleRecommendation.fit_score.desc())
    ).all()
    
    bundle_responses = []
    for bundle in bundles:
        session.refresh(bundle)
        
        flights = [
            FlightDealResponse(
                id=bf.flight_deal.id,
                external_id=bf.flight_deal.external_id,
                origin=bf.flight_deal.origin,
                destination=bf.flight_deal.destination,
                departure_date=bf.flight_deal.departure_date,
                return_date=bf.flight_deal.return_date,
                price_usd=bf.flight_deal.price_usd,
                airline=bf.flight_deal.airline,
                duration_minutes=bf.flight_deal.duration_minutes,
                stops=bf.flight_deal.stops,
                is_red_eye=bf.flight_deal.is_red_eye,
                deal_score=bf.flight_deal.deal_score,
                tags=[tag.tag_type.value for tag in bf.flight_deal.tags]
            )
            for bf in bundle.flights
        ]
        
        hotels = [
            HotelDealResponse(
                id=bh.hotel_deal.id,
                external_id=bh.hotel_deal.external_id,
                hotel_name=bh.hotel_deal.hotel_name,
                city=bh.hotel_deal.city,
                check_in_date=bh.hotel_deal.check_in_date,
                check_out_date=bh.hotel_deal.check_out_date,
                price_per_night_usd=bh.hotel_deal.price_per_night_usd,
                total_price_usd=bh.hotel_deal.total_price_usd,
                star_rating=bh.hotel_deal.star_rating,
                is_refundable=bh.hotel_deal.is_refundable,
                pet_friendly=bh.hotel_deal.pet_friendly,
                breakfast_included=bh.hotel_deal.breakfast_included,
                near_transit=bh.hotel_deal.near_transit,
                deal_score=bh.hotel_deal.deal_score,
                tags=[tag.tag_type.value for tag in bh.hotel_deal.tags]
            )
            for bh in bundle.hotels
        ]
        
        bundle_responses.append(BundleResponse(
            id=bundle.id,
            bundle_name=bundle.bundle_name,
            total_price_usd=bundle.total_price_usd,
            fit_score=bundle.fit_score,
            explanation=bundle.explanation,
            watch_notes=bundle.watch_notes,
            flights=flights,
            hotels=hotels
        ))
    
    return bundle_responses


@app.post("/watches", response_model=WatchResponse)
async def create_watch(request: WatchRequest, session: Session = Depends(get_session)):
    """Create a watch."""
    user_session = session.exec(
        select(UserSession).where(UserSession.session_id == request.session_id)
    ).first()
    
    if not user_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not request.bundle_id and not request.flight_deal_id and not request.hotel_deal_id:
        raise HTTPException(status_code=400, detail="Must specify bundle_id, flight_deal_id, or hotel_deal_id")
    
    if not request.price_threshold_usd and not request.inventory_threshold:
        raise HTTPException(status_code=400, detail="Must specify price_threshold_usd or inventory_threshold")
    
    watch = Watch(
        session_id=user_session.id,
        bundle_id=request.bundle_id,
        flight_deal_id=request.flight_deal_id,
        hotel_deal_id=request.hotel_deal_id,
        price_threshold_usd=request.price_threshold_usd,
        inventory_threshold=request.inventory_threshold,
        status=WatchStatus.ACTIVE
    )
    
    session.add(watch)
    session.commit()
    session.refresh(watch)
    
    return WatchResponse(
        id=watch.id,
        session_id=watch.session_id,
        bundle_id=watch.bundle_id,
        status=watch.status,
        price_threshold_usd=watch.price_threshold_usd,
        inventory_threshold=watch.inventory_threshold,
        last_triggered_at=watch.last_triggered_at
    )


@app.get("/watches", response_model=List[WatchResponse])
async def list_watches(session_id: str, session: Session = Depends(get_session)):
    """List watches for a session."""
    user_session = session.exec(
        select(UserSession).where(UserSession.session_id == session_id)
    ).first()
    
    if not user_session:
        return []
    
    watches = session.exec(
        select(Watch).where(Watch.session_id == user_session.id)
    ).all()
    
    return [
        WatchResponse(
            id=w.id,
            session_id=w.session_id,
            bundle_id=w.bundle_id,
            status=w.status,
            price_threshold_usd=w.price_threshold_usd,
            inventory_threshold=w.inventory_threshold,
            last_triggered_at=w.last_triggered_at
        )
        for w in watches
    ]


@app.post("/bundles/select", response_model=SelectBundleResponse)
async def select_bundle(
    request: SelectBundleRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Select a bundle for checkout."""
    # Get or create session
    user_session = session.exec(
        select(UserSession).where(UserSession.session_id == request.session_id)
    ).first()
    
    if not user_session:
        return SelectBundleResponse(
            success=False,
            message="Session not found"
        )
    
    # Get bundle
    bundle = session.get(BundleRecommendation, request.bundle_id)
    if not bundle:
        return SelectBundleResponse(
            success=False,
            message="Bundle not found"
        )
    
    # Verify bundle belongs to session
    if bundle.session_id != user_session.id:
        return SelectBundleResponse(
            success=False,
            message="Bundle does not belong to this session"
        )
    
    # Check if bundle already selected
    existing = session.exec(
        select(SelectedBundle).where(
            SelectedBundle.session_id == user_session.id,
            SelectedBundle.bundle_id == request.bundle_id,
            SelectedBundle.status == "pending"
        )
    ).first()
    
    if existing:
        # Return existing quote
        session.refresh(bundle)
        quote = _create_checkout_quote(bundle, user_session, session)
        return SelectBundleResponse(
            success=True,
            quote=quote,
            message="Bundle already selected"
        )
    
    # Create selected bundle record
    selected = SelectedBundle(
        session_id=user_session.id,
        bundle_id=request.bundle_id,
        status="pending"
    )
    session.add(selected)
    session.commit()
    
    # Load bundle relationships
    session.refresh(bundle)
    
    # Create checkout quote
    quote = _create_checkout_quote(bundle, user_session, session)

    # In no-Kafka mode we simulate the price drop entirely in-process:
    # schedule a background task that waits a few seconds, applies a
    # small discount to the bundle, and notifies the traveler via the
    # WebSocket manager.
    background_tasks.add_task(
        simulate_price_drop_for_bundle,
        session_id=request.session_id,
        bundle_id=request.bundle_id,
    )
    
    return SelectBundleResponse(
        success=True,
        quote=quote,
        message="Bundle selected successfully"
    )


def _create_checkout_quote(bundle: BundleRecommendation, user_session: UserSession, db_session: Session) -> CheckoutQuote:
    """Create a checkout quote from a bundle."""
    # Load flights and hotels
    flights = []
    hotels = []
    
    for bf in bundle.flights:
        flight = bf.flight_deal
        flights.append(FlightDealResponse(
            id=flight.id,
            external_id=flight.external_id,
            origin=flight.origin,
            destination=flight.destination,
            departure_date=flight.departure_date,
            return_date=flight.return_date,
            price_usd=flight.price_usd,
            airline=flight.airline,
            duration_minutes=flight.duration_minutes,
            stops=flight.stops,
            is_red_eye=flight.is_red_eye,
            deal_score=flight.deal_score,
            tags=[tag.tag_type.value for tag in flight.tags]
        ))
    
    for bh in bundle.hotels:
        hotel = bh.hotel_deal
        hotels.append(HotelDealResponse(
            id=hotel.id,
            external_id=hotel.external_id,
            hotel_name=hotel.hotel_name,
            city=hotel.city,
            check_in_date=hotel.check_in_date,
            check_out_date=hotel.check_out_date,
            price_per_night_usd=hotel.price_per_night_usd,
            total_price_usd=hotel.total_price_usd,
            star_rating=hotel.star_rating,
            is_refundable=hotel.is_refundable,
            pet_friendly=hotel.pet_friendly,
            breakfast_included=hotel.breakfast_included,
            near_transit=hotel.near_transit,
            deal_score=hotel.deal_score,
            tags=[tag.tag_type.value for tag in hotel.tags]
        ))
    
    # Get travelers from recent chat (estimate)
    chat_turns = db_session.exec(
        select(ChatTurn).where(ChatTurn.session_id == user_session.id)
        .order_by(ChatTurn.created_at.desc())
        .limit(5)
    ).all()
    
    travelers = 2  # default
    for turn in chat_turns:
        if turn.intent_data and turn.intent_data.get("travelers"):
            travelers = turn.intent_data.get("travelers")
            break
    
    # Extract travel dates
    travel_dates = {}
    if flights:
        travel_dates = {
            "departure_date": flights[0].departure_date.isoformat(),
            "return_date": flights[0].return_date.isoformat() if flights[0].return_date else None
        }
    elif hotels:
        travel_dates = {
            "check_in": hotels[0].check_in_date.isoformat(),
            "check_out": hotels[0].check_out_date.isoformat()
        }
    
    # Generate quote ID
    quote_id = f"QUOTE-{bundle.id}-{int(datetime.utcnow().timestamp())}"
    
    # Quote expires in 30 minutes
    quote_expires_at = datetime.utcnow() + timedelta(minutes=30)
    
    # For MVP, checkout URL is just a placeholder - in production, this would be a real checkout page
    checkout_url = f"/checkout?quote_id={quote_id}"
    
    return CheckoutQuote(
        quote_id=quote_id,
        bundle_id=bundle.id,
        session_id=user_session.session_id,
        total_price_usd=bundle.total_price_usd,
        flights=flights,
        hotels=hotels,
        travelers=travelers,
        travel_dates=travel_dates,
        quote_expires_at=quote_expires_at,
        checkout_url=checkout_url
    )


async def simulate_price_drop_for_bundle(session_id: str, bundle_id: int) -> None:
    """
    Simulate a price drop for a selected bundle and notify the traveler.

    This replaces the previous Kafka-based workflow with a simple, fully
    in-process background task:
      1. Waits 5 seconds
      2. Applies a 5% discount to the bundle total
      3. Sends a `deal_update` WebSocket message with reason
         `simulated_price_drop` to the given session.
    """
    try:
        # Delay before applying the simulated discount
        await asyncio.sleep(5)
    except Exception:
        # If the sleep is cancelled or fails, just bail out silently.
        return

    from decimal import Decimal
    from sqlmodel import Session as SQLSession
    from models import BundleRecommendation  # local import to avoid cycles
    from datetime import datetime as dt

    # Work with a fresh DB session independent of the request lifecycle.
    with SQLSession(engine) as db:
        bundle = db.get(BundleRecommendation, bundle_id)
        if not bundle:
            logger.warning(
                "simulate_price_drop_for_bundle: bundle %s not found", bundle_id
            )
            return

        old_price = bundle.total_price_usd
        if old_price is None:
            logger.warning(
                "simulate_price_drop_for_bundle: bundle %s has no price", bundle_id
            )
            return

        try:
            new_price = (old_price * Decimal("0.95")).quantize(Decimal("0.01"))
        except Exception as e:
            logger.error("Error computing simulated price drop: %s", e)
            return

        if new_price >= old_price:
            logger.info(
                "simulate_price_drop_for_bundle: no discount applied for bundle %s "
                "(old=%s, new=%s)",
                bundle_id,
                old_price,
                new_price,
            )
            return

        bundle.total_price_usd = new_price
        db.add(bundle)
        db.commit()
        db.refresh(bundle)

        logger.info(
            "Simulated price drop for bundle %s: %s -> %s",
            bundle_id,
            old_price,
            new_price,
        )

    # Build a payload compatible with the frontend hook `useRecommendationEvents`
    event = {
        "event_type": "deal_update",
        "reason": "simulated_price_drop",
        "bundle_id": bundle_id,
        "session_id": session_id,
        "old_total_price_usd": str(old_price),
        "new_total_price_usd": str(new_price),
        "timestamp": dt.utcnow().isoformat(),
    }

    payload = {
        "type": "deal_update",
        "data": event,
        "timestamp": event["timestamp"],
    }

    # Send the notification to all WebSocket connections for this session.
    try:
        await websocket_manager.send_personal_message(payload, session_id)
    except Exception as e:
        logger.error(
            "simulate_price_drop_for_bundle: error sending WebSocket message: %s", e
    )


@app.get("/checkout/quote/{quote_id}", response_model=CheckoutQuote)
async def get_checkout_quote(quote_id: str, session: Session = Depends(get_session)):
    """Get checkout quote by quote ID."""
    # Extract bundle ID from quote ID (format: QUOTE-{bundle_id}-{timestamp})
    try:
        parts = quote_id.split("-")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid quote ID")
        bundle_id = int(parts[1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid quote ID")
    
    bundle = session.get(BundleRecommendation, bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    
    # Get session
    user_session = session.get(UserSession, bundle.session_id)
    if not user_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Create quote
    quote = _create_checkout_quote(bundle, user_session, session)
    
    # Verify quote ID matches
    if quote.quote_id != quote_id:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    return quote


@app.websocket("/events")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming events."""
    await websocket_manager.connect(websocket, session_id)
    
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            # Echo back or handle client messages if needed
            await websocket.send_json({"type": "ack", "message": "Received"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket, session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

