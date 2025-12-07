"""
FastAPI application for the recommendation service.
"""
import logging
import asyncio
import json
import re
from contextlib import asynccontextmanager
from typing import List
from datetime import datetime as dt_datetime, timedelta
from decimal import Decimal

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
from concierge_agent.llm_client import (
    parse_intent, explain_bundle, generate_watch_notes,
    MessageIntent, classify_message_intent, answer_bundle_question
)
from concierge_agent.trip_planner import TripPlanner
from websocket_manager import websocket_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def decimal_to_str(obj):
    """Recursively convert Decimal and datetime objects to strings for JSON serialization."""
    if isinstance(obj, Decimal):
        return str(obj)
    elif isinstance(obj, dt_datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: decimal_to_str(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [decimal_to_str(item) for item in obj]
    return obj


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

    # Check if we have recent bundles (within last hour)
    has_recent_bundles = (
        user_session.last_bundles_data and
        user_session.last_bundles_shown_at and
        (dt_datetime.utcnow() - user_session.last_bundles_shown_at).total_seconds() < 3600  # 1 hour
    )

    # Classify the message intent
    message_intent = await classify_message_intent(
        request.message,
        chat_history,
        has_recent_bundles
    )

    logger.info(f"Message intent classified as: {message_intent}")

    # Handle bundle questions
    if message_intent == MessageIntent.BUNDLE_QUESTION and has_recent_bundles:
        bundles_data = user_session.last_bundles_data.get("bundles", [])

        if not bundles_data:
            assistant_text = "I don't have any bundles to reference. Could you tell me about your trip first?"
        else:
            assistant_text = await answer_bundle_question(
                request.message,
                bundles_data,
                chat_history
            )

        # Save Q&A to chat history
        assistant_turn = ChatTurn(
            session_id=user_session.id,
            role="assistant",
            message=assistant_text
        )
        session.add(assistant_turn)
        session.commit()

        return ChatResponse(
            session_id=request.session_id,
            message=assistant_text,
            intent_parsed={"type": "bundle_question"}
        )

    # Handle greetings
    if message_intent == MessageIntent.GREETING:
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
            intent_parsed={},
        )

    # Handle new trip planning (existing logic)
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

    # Calculate nights from user's requested dates
    nights = 1  # default
    user_check_in = None
    user_check_out = None
    user_departure = None
    user_return = None
    if intent.dates and isinstance(intent.dates, dict):
        start_date_str = intent.dates.get("start_date")
        end_date_str = intent.dates.get("end_date")
        if start_date_str and end_date_str:
            from datetime import datetime
            try:
                start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
                end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
                nights = max((end_date - start_date).days, 1)
                user_check_in = start_date
                user_check_out = end_date
                user_departure = start_date
                user_return = end_date
            except:
                nights = 1

    for bundle in bundles:
        # Load relationships
        session.refresh(bundle)

        # Get flights and hotels
        flights = []
        hotels = []

        for bf in bundle.flights:
            flight = bf.flight_deal
            # Use user's requested dates if available, otherwise use flight database dates
            departure_date = user_departure if user_departure else flight.departure_date
            return_date = user_return if user_return else flight.return_date

            flights.append(FlightDealResponse(
                id=flight.id,
                external_id=flight.external_id,
                origin=flight.origin,
                destination=flight.destination,
                departure_date=departure_date,  # Use user's dates
                return_date=return_date,  # Use user's dates
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
            # Recalculate hotel total based on user's requested nights
            recalculated_total = float(hotel.price_per_night_usd) * nights if hotel.price_per_night_usd else float(hotel.total_price_usd)

            # Use user's requested dates if available, otherwise use hotel database dates
            check_in_date = user_check_in if user_check_in else hotel.check_in_date
            check_out_date = user_check_out if user_check_out else hotel.check_out_date

            hotels.append(HotelDealResponse(
                id=hotel.id,
                external_id=hotel.external_id,
                hotel_name=hotel.hotel_name,
                city=hotel.city,
                check_in_date=check_in_date,  # Use user's dates
                check_out_date=check_out_date,  # Use user's dates
                price_per_night_usd=hotel.price_per_night_usd,
                total_price_usd=recalculated_total,  # Use recalculated total
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
            hotels=hotels,
            travelers=intent.travelers or 1
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

    # Store bundles in session for Q&A (convert Decimals to strings for JSON storage)
    bundles_dict = {
        "bundles": [bundle.model_dump() for bundle in bundle_responses],
        "generated_at": dt_datetime.utcnow().isoformat()
    }
    user_session.last_bundles_data = decimal_to_str(bundles_dict)
    user_session.last_bundles_shown_at = dt_datetime.utcnow()
    session.add(user_session)

    session.commit()
    logger.info(f"Stored {len(bundle_responses)} bundles in session for Q&A")

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

    # Get user's requested dates and travelers from most recent chat turn
    nights = 1  # default
    travelers = 1  # default
    chat_turns = session.exec(
        select(ChatTurn).where(ChatTurn.session_id == user_session.id)
        .order_by(ChatTurn.created_at.desc())
        .limit(5)
    ).all()

    for turn in chat_turns:
        if turn.intent_data:
            # Get travelers
            if turn.intent_data.get("travelers"):
                travelers = turn.intent_data.get("travelers")
            # Get dates
            if turn.intent_data.get("dates"):
                dates_info = turn.intent_data.get("dates")
                if isinstance(dates_info, dict):
                    start_date_str = dates_info.get("start_date")
                    end_date_str = dates_info.get("end_date")
                    if start_date_str and end_date_str:
                        from datetime import datetime
                        try:
                            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
                            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
                            nights = max((end_date - start_date).days, 1)
                            break
                        except:
                            pass

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

        # Recalculate hotel totals based on user's requested nights
        hotels = []
        for bh in bundle.hotels:
            hotel_deal = bh.hotel_deal
            recalculated_total = float(hotel_deal.price_per_night_usd) * nights if hotel_deal.price_per_night_usd else float(hotel_deal.total_price_usd)
            hotels.append(HotelDealResponse(
                id=hotel_deal.id,
                external_id=hotel_deal.external_id,
                hotel_name=hotel_deal.hotel_name,
                city=hotel_deal.city,
                check_in_date=hotel_deal.check_in_date,
                check_out_date=hotel_deal.check_out_date,
                price_per_night_usd=hotel_deal.price_per_night_usd,
                total_price_usd=recalculated_total,  # Use recalculated total
                star_rating=hotel_deal.star_rating,
                is_refundable=hotel_deal.is_refundable,
                pet_friendly=hotel_deal.pet_friendly,
                breakfast_included=hotel_deal.breakfast_included,
                near_transit=hotel_deal.near_transit,
                deal_score=hotel_deal.deal_score,
                tags=[tag.tag_type.value for tag in hotel_deal.tags]
            ))
        
        bundle_responses.append(BundleResponse(
            id=bundle.id,
            bundle_name=bundle.bundle_name,
            total_price_usd=bundle.total_price_usd,
            fit_score=bundle.fit_score,
            explanation=bundle.explanation,
            watch_notes=bundle.watch_notes,
            flights=flights,
            hotels=hotels,
            travelers=travelers
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
    # Get travelers and user's requested dates from recent chat FIRST
    # (we need these to recalculate prices)
    chat_turns = db_session.exec(
        select(ChatTurn).where(ChatTurn.session_id == user_session.id)
        .order_by(ChatTurn.created_at.desc())
        .limit(5)
    ).all()

    travelers = 2  # default
    user_departure_date = None
    user_return_date = None

    # Extract intent data from chat history (user's actual request)
    for turn in chat_turns:
        if turn.intent_data:
            if turn.intent_data.get("travelers"):
                travelers = turn.intent_data.get("travelers")
            # Get dates from user's query intent
            if turn.intent_data.get("dates"):
                dates_info = turn.intent_data.get("dates")
                if isinstance(dates_info, dict):
                    user_departure_date = dates_info.get("start_date") or dates_info.get("start") or dates_info.get("departure")
                    user_return_date = dates_info.get("end_date") or dates_info.get("end") or dates_info.get("return")
                elif isinstance(dates_info, str):
                    # Single date string, use as departure
                    user_departure_date = dates_info
            # Alternative: check for departure_date and return_date directly
            if not user_departure_date and turn.intent_data.get("departure_date"):
                user_departure_date = turn.intent_data.get("departure_date")
            if not user_return_date and turn.intent_data.get("return_date"):
                user_return_date = turn.intent_data.get("return_date")
            if user_departure_date and user_return_date:
                break

    # Parse user dates for calculations
    from datetime import datetime as dt_parser
    user_departure_dt = None
    user_return_dt = None

    def parse_date_string(date_str):
        """Parse various date formats"""
        if not date_str:
            return None
        if not isinstance(date_str, str):
            return date_str  # Already a datetime object

        # Try common formats
        formats = [
            '%Y-%m-%d',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S',
        ]
        for fmt in formats:
            try:
                return dt_parser.strptime(date_str, fmt)
            except:
                continue
        return None

    if user_departure_date:
        user_departure_dt = parse_date_string(user_departure_date)

    if user_return_date:
        user_return_dt = parse_date_string(user_return_date)

    # Calculate nights from user dates
    nights_from_user_dates = None
    if user_departure_dt and user_return_dt:
        nights_from_user_dates = (user_return_dt - user_departure_dt).days
        if nights_from_user_dates < 1:
            nights_from_user_dates = 1  # At least 1 night

    # Now build flights and hotels with adjusted dates and prices
    flights = []
    hotels = []
    adjusted_total_price = 0

    for bf in bundle.flights:
        flight = bf.flight_deal
        # Use user's departure date if available, otherwise use flight's date
        flight_departure = user_departure_dt or flight.departure_date
        flight_return = user_return_dt or flight.return_date

        flights.append(FlightDealResponse(
            id=flight.id,
            external_id=flight.external_id,
            origin=flight.origin,
            destination=flight.destination,
            departure_date=flight_departure,
            return_date=flight_return,
            price_usd=flight.price_usd,
            airline=flight.airline,
            duration_minutes=flight.duration_minutes,
            stops=flight.stops,
            is_red_eye=flight.is_red_eye,
            deal_score=flight.deal_score,
            tags=[tag.tag_type.value for tag in flight.tags]
        ))
        # Multiply flight price by number of travelers
        adjusted_total_price += float(flight.price_usd) * travelers

    for bh in bundle.hotels:
        hotel = bh.hotel_deal
        # Use user's dates if available, otherwise use hotel's dates
        hotel_check_in = user_departure_dt or hotel.check_in_date
        hotel_check_out = user_return_dt or hotel.check_out_date

        # Recalculate hotel price based on user's nights
        if nights_from_user_dates and hotel.price_per_night_usd:
            recalculated_total = float(hotel.price_per_night_usd) * nights_from_user_dates
        else:
            recalculated_total = float(hotel.total_price_usd)

        hotels.append(HotelDealResponse(
            id=hotel.id,
            external_id=hotel.external_id,
            hotel_name=hotel.hotel_name,
            city=hotel.city,
            check_in_date=hotel_check_in,
            check_out_date=hotel_check_out,
            price_per_night_usd=hotel.price_per_night_usd,
            total_price_usd=recalculated_total,  # Use recalculated price
            star_rating=hotel.star_rating,
            is_refundable=hotel.is_refundable,
            pet_friendly=hotel.pet_friendly,
            breakfast_included=hotel.breakfast_included,
            near_transit=hotel.near_transit,
            deal_score=hotel.deal_score,
            tags=[tag.tag_type.value for tag in hotel.tags]
        ))
        adjusted_total_price += recalculated_total

    # Extract travel dates for the quote
    travel_dates = {}
    if user_departure_date or user_return_date:
        # Use user's requested dates from intent
        travel_dates = {
            "departure_date": user_departure_date,
            "return_date": user_return_date
        }
    elif flights:
        # Fallback to flight deal dates only if user dates not found
        travel_dates = {
            "departure_date": flights[0].departure_date.isoformat(),
            "return_date": flights[0].return_date.isoformat() if flights[0].return_date else None
        }
    elif hotels:
        # Fallback to hotel deal dates only if user dates not found
        travel_dates = {
            "check_in": hotels[0].check_in_date.isoformat(),
            "check_out": hotels[0].check_out_date.isoformat()
        }

    # Check if bundle has a discounted price (from price drop simulation)
    # If bundle.total_price_usd is less than our calculated price, apply the discount proportionally
    final_total_price = adjusted_total_price
    if bundle.total_price_usd and float(bundle.total_price_usd) < float(adjusted_total_price):
        discount_multiplier = float(bundle.total_price_usd) / float(adjusted_total_price)
        final_total_price = bundle.total_price_usd

        # Apply discount proportionally to all items
        for flight in flights:
            flight.price_usd = Decimal(str(float(flight.price_usd) * discount_multiplier))

        for hotel in hotels:
            hotel.total_price_usd = Decimal(str(float(hotel.total_price_usd) * discount_multiplier))
            if hotel.price_per_night_usd:
                hotel.price_per_night_usd = Decimal(str(float(hotel.price_per_night_usd) * discount_multiplier))

    # Generate quote ID
    quote_id = f"QUOTE-{bundle.id}-{int(dt_datetime.utcnow().timestamp())}"

    # Quote expires in 30 minutes
    quote_expires_at = dt_datetime.utcnow() + timedelta(minutes=30)

    # For MVP, checkout URL is just a placeholder - in production, this would be a real checkout page
    checkout_url = f"/checkout?quote_id={quote_id}"

    return CheckoutQuote(
        quote_id=quote_id,
        bundle_id=bundle.id,
        session_id=user_session.session_id,
        total_price_usd=final_total_price,  # Use discounted total if available
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
    from models import BundleRecommendation, UserSession, ChatTurn  # local import to avoid cycles
    from datetime import datetime as dt

    # Work with a fresh DB session independent of the request lifecycle.
    with SQLSession(engine) as db:
        bundle = db.get(BundleRecommendation, bundle_id)
        if not bundle:
            logger.warning(
                "simulate_price_drop_for_bundle: bundle %s not found", bundle_id
            )
            return

        # Get user session to access chat history
        user_session = db.exec(
            select(UserSession).where(UserSession.session_id == session_id)
        ).first()

        if not user_session:
            logger.warning("simulate_price_drop_for_bundle: session %s not found", session_id)
            return

        # Get user's requested dates and travelers from chat history to calculate actual price
        nights = 1
        travelers = 1
        chat_turns = db.exec(
            select(ChatTurn).where(ChatTurn.session_id == user_session.id)
            .order_by(ChatTurn.created_at.desc())
            .limit(5)
        ).all()

        for turn in chat_turns:
            if turn.intent_data:
                if turn.intent_data.get("travelers"):
                    travelers = turn.intent_data.get("travelers")
                if turn.intent_data.get("dates"):
                    dates_info = turn.intent_data.get("dates")
                    if isinstance(dates_info, dict):
                        start_date_str = dates_info.get("start_date")
                        end_date_str = dates_info.get("end_date")
                        if start_date_str and end_date_str:
                            try:
                                start_date = dt.strptime(start_date_str, "%Y-%m-%d")
                                end_date = dt.strptime(end_date_str, "%Y-%m-%d")
                                nights = max((end_date - start_date).days, 1)
                                break
                            except:
                                pass

        # Refresh bundle to load relationships
        db.refresh(bundle)

        # Calculate actual bundle price based on user's dates and travelers
        actual_price = Decimal("0")
        for bf in bundle.flights:
            flight = bf.flight_deal
            actual_price += flight.price_usd * Decimal(str(travelers))

        for bh in bundle.hotels:
            hotel = bh.hotel_deal
            if hotel.price_per_night_usd:
                hotel_price = hotel.price_per_night_usd * Decimal(str(nights))
            else:
                hotel_price = hotel.total_price_usd
            actual_price += hotel_price

        old_price = actual_price
        if old_price is None or old_price == 0:
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

        # Update bundle price in database
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

