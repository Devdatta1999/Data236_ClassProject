"""
OpenAI client wrapper for Concierge Agent.
"""
import os
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from enum import Enum

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Load environment variables from a .env file (if present) so that
# OPENAI_API_KEY and other secrets can be configured without having to
# export them manually in every environment. This is a no-op if no .env
# file exists or the variables are already set in the real environment.
load_dotenv()

# Initialize OpenAI client lazily
_client = None

def get_client():
    """Get or create OpenAI client."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        # Initialize client with only api_key to avoid any proxy/environment issues
        _client = AsyncOpenAI(api_key=api_key)
    return _client


class MessageIntent(str, Enum):
    """User message intent classification."""
    NEW_TRIP_PLANNING = "new_trip_planning"
    BUNDLE_QUESTION = "bundle_question"
    GENERAL_QUESTION = "general_question"
    GREETING = "greeting"


class TravelIntent(BaseModel):
    """Parsed travel intent from user message."""
    dates: Optional[Dict[str, str]] = Field(default=None, description="Start and end dates")
    origin: Optional[str] = Field(default=None, description="Origin airport code")
    destination: Optional[str] = Field(default=None, description="Destination city or airport code")
    destination_preference: Optional[str] = Field(default=None, description="e.g., 'warm', 'beach', 'city'")
    budget_usd: Optional[float] = Field(default=None, description="Total budget in USD")
    travelers: int = Field(default=1, description="Number of travelers")
    constraints: Dict[str, Any] = Field(default_factory=dict, description="Constraints like pet_friendly, avoid_red_eye, etc.")
    needs_clarification: bool = Field(default=False, description="Whether a clarifying question is needed")
    clarifying_question: Optional[str] = Field(default=None, description="Question to ask if needs_clarification is True")


def _basic_intent_from_chat(chat_history: List[Dict[str, str]]) -> "TravelIntent":
    """
    Lightweight, rule-based intent extraction used as a fallback when the
    OpenAI call fails or no API key is configured.

    This is intentionally simple but good enough for demos:
      - Looks for 3-letter airport codes (e.g. SFO, LAX)
      - Tries to infer budget from larger numbers in the text
      - Defaults dates to a short trip around a fixed reference date that
        matches the sample deals in the DB (e.g. 2024-10-25 to 2024-10-27)
    """
    # Get last user message (used mainly to detect greetings/small-talk)
    last_user = ""
    user_messages: List[str] = []
    for msg in chat_history:
        if msg.get("role") == "user":
            content = msg.get("content", "") or ""
            user_messages.append(content)
            last_user = content

    text = (last_user or "").strip()
    combined_user_text = " ".join(m.strip() for m in user_messages if m).strip()

    # If the latest message is just a short greeting or small-talk (e.g. "hi",
    # "hello", "thanks"), don't fabricate a default trip. Instead, ask the user
    # for proper travel details.
    lowered = text.lower()
    if not lowered or (
        len(lowered.split()) <= 4
        and re.search(r"\b(hi|hello|hey|thanks|thank you|hola|yo)\b", lowered)
        and not re.search(r"\b[A-Z]{3}\b", text)
    ):
        return TravelIntent(
            needs_clarification=True,
            clarifying_question=(
                "Hi! Tell me where you're traveling from and to, your dates, "
                "budget, and how many people are traveling."
            ),
        )
    # If there is no real content from the user at all, ask for details.
    if not combined_user_text:
        return TravelIntent(
            needs_clarification=True,
            clarifying_question=(
                "Hi! Tell me where you're traveling from and to, your dates, "
                "budget, and how many people are traveling."
            ),
        )

    # Airport codes: search across the whole conversation so we preserve
    # context like "make it pet-friendly" after an initial detailed query.
    codes = re.findall(r"\b[A-Z]{3}\b", combined_user_text)
    origin = codes[0] if len(codes) >= 1 else None
    destination = codes[1] if len(codes) >= 2 else None

    # Budget: pick the largest 3–5 digit number as an approximate budget
    numbers = [int(m) for m in re.findall(r"\b(\d{3,5})\b", combined_user_text)]
    budget = float(max(numbers)) if numbers else None

    # Travelers: "for 2 people", "for 3 travelers", etc. (use latest mention)
    travelers = 1
    travelers_match = re.search(
        r"\bfor\s+(\d+)\s+(people|persons|travellers|travelers)\b",
        combined_user_text,
        re.IGNORECASE,
    )
    if travelers_match:
        travelers = int(travelers_match.group(1))
    else:
        # Fallback to a simple "for X" pattern, but keep it optional.
        generic_match = re.search(r"\bfor\s+(\d+)\b", combined_user_text, re.IGNORECASE)
        if generic_match:
            travelers = int(generic_match.group(1))

    # Dates: look for explicit YYYY-MM-DD patterns in the conversation.
    date_strings = re.findall(r"\b(20[2-9]\d-\d{2}-\d{2})\b", combined_user_text)
    start_date_str = date_strings[0] if len(date_strings) >= 1 else None
    end_date_str = date_strings[1] if len(date_strings) >= 2 else None

    # If any of the critical fields (origin, dates, budget) are missing
    # across the *entire* conversation, don't fabricate defaults – ask
    # the user for proper travel details instead of returning SFO→LAX.
    if not origin or not start_date_str or budget is None:
        return TravelIntent(
            needs_clarification=True,
            clarifying_question=(
                "To help you book a trip, please tell me your origin, "
                "destination, exact dates, budget, and how many people are traveling."
            ),
        )

    # If only end_date is missing, assume a short 2‑day trip window.
    if not end_date_str:
        try:
            start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_dt = start_dt + timedelta(days=2)
            end_date_str = end_dt.strftime("%Y-%m-%d")
        except ValueError:
            # If parsing fails, fall back to asking for clarification instead
            return TravelIntent(
                needs_clarification=True,
                clarifying_question=(
                    "Could you confirm your exact travel dates in YYYY-MM-DD format?"
                ),
            )

    dates = {
        "start_date": start_date_str,
        "end_date": end_date_str,
    }

    return TravelIntent(
        dates=dates,
        origin=origin,
        destination=destination,
        budget_usd=budget,
        travelers=max(travelers, 1),
        constraints={},
        needs_clarification=False,
        clarifying_question=None,
    )


async def parse_intent(chat_history: List[Dict[str, str]]) -> TravelIntent:
    """
    Parse user intent from chat history using OpenAI.
    
    Args:
        chat_history: List of dicts with 'role' ('user' or 'assistant') and 'content'
    
    Returns:
        TravelIntent object
    """
    system_prompt = """You are a travel concierge assistant. Extract travel intent from user messages.

IMPORTANT: Preserve context from previous messages in the conversation. If the user is refining their request (e.g., "make it pet-friendly"), keep all previous information (dates, origin, budget, travelers) and only update the new constraints.

Extract:
- Dates (start_date, end_date in YYYY-MM-DD format) - preserve from previous messages if not mentioned
- Origin airport code (e.g., SFO, JFK) - preserve from previous messages if not mentioned
- Destination (city name or airport code, or preference like "warm", "beach") - preserve from previous messages if not mentioned
- Budget in USD (total for all travelers) - preserve from previous messages if not mentioned
- Number of travelers - preserve from previous messages if not mentioned
- Constraints: pet_friendly, avoid_red_eye, breakfast_included, near_transit, refundable - update based on current message, preserve others

If critical information is missing (dates, origin, or budget) AND it wasn't mentioned in previous messages, set needs_clarification=True and provide a clarifying_question.

Return ONLY valid JSON matching this schema:
{
  "dates": {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"} or null,
  "origin": "SFO" or null,
  "destination": "Tokyo" or null,
  "destination_preference": "warm" or null,
  "budget_usd": 1000.0 or null,
  "travelers": 2,
  "constraints": {
    "pet_friendly": true/false,
    "avoid_red_eye": true/false,
    "breakfast_included": true/false,
    "near_transit": true/false,
    "refundable": true/false
  },
  "needs_clarification": false,
  "clarifying_question": null or "What is your budget?"
}
"""

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history)
    
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",  # Use cheaper model for parsing
            messages=messages,
            temperature=0.1,  # Low temperature for deterministic parsing
            response_format={"type": "json_object"},
        )
        
        content = response.choices[0].message.content
        intent_dict = json.loads(content)
        
        return TravelIntent(**intent_dict)
        
    except Exception as e:
        logger.error(f"Error parsing intent: {e}")
        # Fallback to basic, rule-based intent so the system remains usable
        # even without a working OpenAI key/network.
        fallback_intent = _basic_intent_from_chat(chat_history)
        logger.info("Using rule-based fallback TravelIntent: %s", fallback_intent.model_dump())
        return fallback_intent


async def explain_bundle(bundle_data: Dict[str, Any], constraints: Dict[str, Any]) -> str:
    """
    Generate explanation for a bundle (≤25 words).
    
    Args:
        bundle_data: Bundle information (price, flights, hotels, fit_score)
        constraints: User constraints
    
    Returns:
        Short explanation string
    """
    prompt = f"""Generate a concise explanation (≤25 words) for why this travel bundle is recommended.

Bundle:
- Total price: ${bundle_data.get('total_price_usd', 0):.2f}
- Fit score: {bundle_data.get('fit_score', 0):.1f}/100
- Flights: {bundle_data.get('flight_summary', 'N/A')}
- Hotels: {bundle_data.get('hotel_summary', 'N/A')}

User constraints: {constraints}

Explain why this bundle works well for the user. Be specific about price, convenience, or matching preferences.
Keep it under 25 words and friendly."""

    try:
        client = get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=50
        )
        
        explanation = response.choices[0].message.content.strip()
        # Ensure it's ≤25 words
        words = explanation.split()
        if len(words) > 25:
            explanation = " ".join(words[:25]) + "..."
        
        return explanation
        
    except Exception as e:
        logger.error(f"Error generating explanation: {e}")
        return "Great value bundle matching your preferences."


async def generate_watch_notes(bundle_data: Dict[str, Any]) -> str:
    """
    Generate watch notes (≤12 words).
    
    Args:
        bundle_data: Bundle information
    
    Returns:
        Short watch notes string
    """
    prompt = f"""Generate a very short note (≤12 words) about what to watch for this bundle.

Bundle price: ${bundle_data.get('total_price_usd', 0):.2f}
Deal score: {bundle_data.get('deal_score', 0)}

What should the user watch for? (price drops, inventory, etc.)
Keep it under 12 words."""

    try:
        client = get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=30
        )
        
        notes = response.choices[0].message.content.strip()
        words = notes.split()
        if len(words) > 12:
            notes = " ".join(words[:12])
        
        return notes
        
    except Exception as e:
        logger.error(f"Error generating watch notes: {e}")
        return "Watch for price drops and inventory changes."


async def answer_policy_question(deal_data: Dict[str, Any], question: str) -> str:
    """
    Answer a policy/logistics question about a deal.
    
    Args:
        deal_data: Deal information (refundability, pets, breakfast, etc.)
        question: User's question
    
    Returns:
        Fact-based answer snippet
    """
    prompt = f"""Answer this question about a travel deal using ONLY the facts provided.

Deal facts:
- Refundable: {deal_data.get('is_refundable', False)}
- Cancellation window: {deal_data.get('cancellation_window_days', 'N/A')} days
- Pet friendly: {deal_data.get('pet_friendly', False)}
- Breakfast included: {deal_data.get('breakfast_included', False)}
- Near transit: {deal_data.get('near_transit', False)}
- Parking: {deal_data.get('parking_available', False)}

Question: {question}

Provide a short, factual answer based only on the facts above. If the information isn't available, say so."""
    
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=100
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Error answering policy question: {e}")
        return "I don't have that information available."


async def classify_message_intent(
    message: str,
    chat_history: List[Dict[str, str]],
    has_recent_bundles: bool
) -> MessageIntent:
    """
    Classify user's message intent to determine how to respond.

    Args:
        message: Current user message
        chat_history: Previous conversation history
        has_recent_bundles: Whether bundles were shown in the last hour

    Returns:
        MessageIntent enum indicating the type of message
    """
    message_lower = message.lower().strip()

    # Check for greetings first (highest priority for short messages)
    greeting_patterns = r"\b(hi|hello|hey|thanks|thank you|hola|yo|good morning|good afternoon)\b"
    if re.search(greeting_patterns, message_lower) and len(message.split()) <= 4:
        # Don't treat as greeting if it contains airport codes or trip keywords
        if not re.search(r"\b[A-Z]{3}\b", message) and not re.search(r"\b(trip|flight|hotel|bundle)\b", message_lower):
            return MessageIntent.GREETING

    # Check for bundle questions (only if bundles were recently shown)
    if has_recent_bundles:
        bundle_question_patterns = [
            r"\bbundle\s*\d+",  # "bundle 1", "bundle 2"
            r"\boption\s*\d+",  # "option 1", "option 2"
            r"\bfirst\s+(one|bundle|option)",  # "first one", "first bundle"
            r"\bsecond\s+(one|bundle|option)",
            r"\bthird\s+(one|bundle|option)",
            r"\bthe\s+(hotel|flight)\s+in\s+(bundle|option)",  # "the hotel in bundle 1"
            r"\btell me (more )?about\s+(bundle|option)",  # "tell me about bundle 1"
            r"\bwhat'?s?\s+the\s+(hotel|flight)",  # "what's the hotel like"
            r"\bdoes\s+(bundle|option|the|it)",  # "does bundle 1 include", "does it have"
            r"\bis\s+(the|it)\s+(refundable|pet.?friendly)",  # "is the hotel refundable"
            r"\bhow many\s+(stops|nights)",  # "how many stops"
            r"\bwhich\s+(bundle|option)\s+(has|is)",  # "which bundle has"
            r"\bdifference\s+between",  # "difference between bundle 1 and 2"
            r"\bcompare\s+(bundle|option|them)",  # "compare the bundles"
            r"\bbreakfast\s+(included|available)",  # "breakfast included?"
        ]

        for pattern in bundle_question_patterns:
            if re.search(pattern, message_lower):
                logger.info(f"Classified as BUNDLE_QUESTION (matched pattern: {pattern})")
                return MessageIntent.BUNDLE_QUESTION

    # Check for new trip planning - look for travel indicators
    trip_planning_patterns = [
        r"\b[A-Z]{3}\b.*\bto\b.*\b[A-Z]{3}\b",  # "SFO to LAX"
        r"\bfrom\b.*\bto\b",  # "from ... to ..."
        r"\btrip\s+to\b",  # "trip to NYC"
        r"\btravel\s+to\b",  # "travel to Boston"
        r"\bgoing\s+to\b",  # "going to Paris"
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b",  # month names
        r"\b\d{4}-\d{2}-\d{2}\b",  # date format 2025-11-29
        r"\b(budget|spend|cost).*\$\d+",  # "budget of $1000"
        r"\$\d+.*budget",  # "$1000 budget"
        r"\b\d+\s+(people|travelers|persons|adults)",  # "3 people"
        r"\bneed\s+(a\s+)?(flight|hotel|trip)",  # "need a trip"
    ]

    for pattern in trip_planning_patterns:
        if re.search(pattern, message, re.IGNORECASE):
            logger.info(f"Classified as NEW_TRIP_PLANNING (matched pattern: {pattern})")
            return MessageIntent.NEW_TRIP_PLANNING

    # Default to general question
    logger.info("Classified as GENERAL_QUESTION (no specific patterns matched)")
    return MessageIntent.GENERAL_QUESTION


async def answer_bundle_question(
    question: str,
    bundles_data: List[Dict[str, Any]],
    chat_history: List[Dict[str, str]]
) -> str:
    """
    Answer questions about previously shown bundles using LLM.

    Args:
        question: User's question about bundles
        bundles_data: List of bundle data from session
        chat_history: Conversation history for context

    Returns:
        Natural language answer to the question
    """
    # Format bundles for LLM context
    bundles_context = ""
    for i, bundle in enumerate(bundles_data, 1):
        bundles_context += f"\n\n=== Bundle {i} ==="
        bundles_context += f"\n  Total Price: ${bundle.get('total_price_usd', 0)}"
        bundles_context += f"\n  Fit Score: {bundle.get('fit_score', 0)}/100"
        bundles_context += f"\n  Explanation: {bundle.get('explanation', 'N/A')}"

        # Flight details
        flights = bundle.get('flights', [])
        if flights:
            bundles_context += "\n\n  Flights:"
            for flight in flights:
                bundles_context += f"\n    - Airline: {flight.get('airline', 'N/A')} {flight.get('flight_number', '')}"
                bundles_context += f"\n      Route: {flight.get('origin', 'N/A')} → {flight.get('destination', 'N/A')}"
                bundles_context += f"\n      Departure: {flight.get('departure_date', 'N/A')}"
                if flight.get('return_date'):
                    bundles_context += f"\n      Return: {flight.get('return_date')}"
                bundles_context += f"\n      Price: ${flight.get('price_usd', 0)}"
                bundles_context += f"\n      Stops: {flight.get('stops', 0)}"
                bundles_context += f"\n      Duration: {flight.get('duration_minutes', 'N/A')} minutes"
                bundles_context += f"\n      Baggage included: {flight.get('baggage_included', False)}"
                bundles_context += f"\n      Red-eye: {flight.get('is_red_eye', False)}"

        # Hotel details
        hotels = bundle.get('hotels', [])
        if hotels:
            bundles_context += "\n\n  Hotels:"
            for hotel in hotels:
                bundles_context += f"\n    - Name: {hotel.get('hotel_name', 'N/A')}"
                bundles_context += f"\n      Location: {hotel.get('city', 'N/A')}"
                if hotel.get('neighborhood'):
                    bundles_context += f"\n      Neighborhood: {hotel.get('neighborhood')}"
                bundles_context += f"\n      Star Rating: {hotel.get('star_rating', 'N/A')}⭐"
                bundles_context += f"\n      Price/night: ${hotel.get('price_per_night_usd', 0)}"
                bundles_context += f"\n      Total price: ${hotel.get('total_price_usd', 0)}"
                bundles_context += f"\n      Check-in: {hotel.get('check_in_date', 'N/A')}"
                bundles_context += f"\n      Check-out: {hotel.get('check_out_date', 'N/A')}"
                bundles_context += f"\n      Refundable: {hotel.get('is_refundable', False)}"
                bundles_context += f"\n      Breakfast included: {hotel.get('breakfast_included', False)}"
                bundles_context += f"\n      Pet friendly: {hotel.get('pet_friendly', False)}"
                bundles_context += f"\n      Near transit: {hotel.get('near_transit', False)}"
                bundles_context += f"\n      Parking: {hotel.get('parking_available', False)}"

    prompt = f"""You are a helpful travel assistant. Answer the user's question about the travel bundles shown below.

Previously shown travel bundles:
{bundles_context}

User's question: {question}

Instructions:
- Provide a helpful, concise answer based on the bundle data above
- If asking about a specific bundle number, reference that bundle's details
- If comparing bundles, highlight the key differences
- Keep the answer friendly and conversational
- Stay under 150 words
- If the information isn't in the data, say so politely

Answer:"""

    try:
        client = get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=250
        )

        answer = response.choices[0].message.content.strip()
        logger.info(f"Generated bundle answer: {answer[:100]}...")
        return answer

    except Exception as e:
        logger.error(f"Error answering bundle question: {e}")
        return "I'd be happy to answer questions about the bundles I showed you, but I'm having trouble accessing that information right now. Could you ask your question again?"

