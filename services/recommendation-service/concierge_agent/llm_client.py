"""
OpenAI client wrapper for Concierge Agent.
"""
import os
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

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

