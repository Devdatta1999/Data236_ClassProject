"""
SQLModel and Pydantic v2 schemas for the recommendation service.
Separates internal DB models (SQLModel) from API schemas (Pydantic v2).
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from enum import Enum

from sqlmodel import SQLModel, Field, Relationship, Column, JSON
from pydantic import BaseModel, Field as PydanticField, ConfigDict


# ============================================================================
# Enums
# ============================================================================

class DealType(str, Enum):
    FLIGHT = "flight"
    HOTEL = "hotel"


class TagType(str, Enum):
    REFUNDABLE = "refundable"
    NON_REFUNDABLE = "non_refundable"
    PET_FRIENDLY = "pet_friendly"
    NEAR_TRANSIT = "near_transit"
    BREAKFAST = "breakfast"


class WatchStatus(str, Enum):
    ACTIVE = "active"
    TRIGGERED = "triggered"
    CANCELLED = "cancelled"


# ============================================================================
# SQLModel Database Models (Internal)
# ============================================================================

class FlightDeal(SQLModel, table=True):
    """Normalized flight deal record."""
    __tablename__ = "flight_deals"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True)
    origin: str = Field(index=True)
    destination: str = Field(index=True)
    departure_date: datetime = Field(index=True)
    return_date: Optional[datetime] = None
    price_usd: Decimal = Field(default=Decimal("0.00"))
    currency: str = Field(default="USD")
    airline: Optional[str] = None
    flight_number: Optional[str] = None
    duration_minutes: Optional[int] = None
    stops: int = Field(default=0)
    is_red_eye: bool = Field(default=False)
    baggage_included: bool = Field(default=False)
    fare_class: Optional[str] = None
    
    # Price history metrics
    price_30d_avg: Optional[Decimal] = None
    price_60d_avg: Optional[Decimal] = None
    
    # Inventory & promo
    available_seats: Optional[int] = None
    promo_end_date: Optional[datetime] = None
    
    # Deal scoring
    deal_score: Optional[int] = None
    price_drop_pct: Optional[float] = None
    is_scarce: bool = Field(default=False)
    has_promo: bool = Field(default=False)
    
    # Metadata
    raw_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    tags: List["OfferTag"] = Relationship(back_populates="flight_deal")
    bundle_flights: List["BundleFlight"] = Relationship(back_populates="flight_deal")


class HotelDeal(SQLModel, table=True):
    """Normalized hotel deal record."""
    __tablename__ = "hotel_deals"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True)
    hotel_name: str = Field(index=True)
    city: str = Field(index=True)
    country: str = Field(default="USA")
    address: Optional[str] = None
    neighborhood: Optional[str] = None
    check_in_date: datetime = Field(index=True)
    check_out_date: datetime = Field(index=True)
    price_per_night_usd: Decimal = Field(default=Decimal("0.00"))
    total_price_usd: Decimal = Field(default=Decimal("0.00"))
    currency: str = Field(default="USD")
    star_rating: Optional[int] = None
    
    # Amenities & policies
    is_refundable: bool = Field(default=False)
    cancellation_window_days: Optional[int] = None
    pet_friendly: bool = Field(default=False)
    breakfast_included: bool = Field(default=False)
    near_transit: bool = Field(default=False)
    parking_available: bool = Field(default=False)
    
    # Price history metrics
    price_30d_avg: Optional[Decimal] = None
    price_60d_avg: Optional[Decimal] = None
    
    # Inventory & promo
    available_rooms: Optional[int] = None
    promo_end_date: Optional[datetime] = None
    
    # Deal scoring
    deal_score: Optional[int] = None
    price_drop_pct: Optional[float] = None
    is_scarce: bool = Field(default=False)
    has_promo: bool = Field(default=False)
    
    # Metadata
    raw_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    tags: List["OfferTag"] = Relationship(back_populates="hotel_deal")
    bundle_hotels: List["BundleHotel"] = Relationship(back_populates="hotel_deal")


class OfferTag(SQLModel, table=True):
    """Tags applied to deals."""
    __tablename__ = "offer_tags"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    tag_type: TagType
    flight_deal_id: Optional[int] = Field(default=None, foreign_key="flight_deals.id")
    hotel_deal_id: Optional[int] = Field(default=None, foreign_key="hotel_deals.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    flight_deal: Optional[FlightDeal] = Relationship(back_populates="tags")
    hotel_deal: Optional[HotelDeal] = Relationship(back_populates="tags")


class UserSession(SQLModel, table=True):
    """User chat session."""
    __tablename__ = "user_sessions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True, unique=True)
    user_id: Optional[str] = None  # Optional link to user service
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    chat_turns: List["ChatTurn"] = Relationship(back_populates="session")
    bundles: List["BundleRecommendation"] = Relationship(back_populates="session")
    watches: List["Watch"] = Relationship(back_populates="session")
    selected_bundles: List["SelectedBundle"] = Relationship(back_populates="session")


class ChatTurn(SQLModel, table=True):
    """Individual chat message turn."""
    __tablename__ = "chat_turns"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="user_sessions.id")
    role: str  # "user" or "assistant"
    message: str
    intent_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    session: UserSession = Relationship(back_populates="chat_turns")


class BundleRecommendation(SQLModel, table=True):
    """Flight + Hotel bundle recommendation."""
    __tablename__ = "bundle_recommendations"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="user_sessions.id")
    bundle_name: Optional[str] = None
    total_price_usd: Decimal = Field(default=Decimal("0.00"))
    fit_score: float = Field(default=0.0)
    explanation: Optional[str] = None
    watch_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    session: UserSession = Relationship(back_populates="bundles")
    flights: List["BundleFlight"] = Relationship(back_populates="bundle")
    hotels: List["BundleHotel"] = Relationship(back_populates="bundle")


class BundleFlight(SQLModel, table=True):
    """Flight component of a bundle."""
    __tablename__ = "bundle_flights"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    bundle_id: int = Field(foreign_key="bundle_recommendations.id")
    flight_deal_id: int = Field(foreign_key="flight_deals.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    bundle: BundleRecommendation = Relationship(back_populates="flights")
    flight_deal: FlightDeal = Relationship(back_populates="bundle_flights")


class BundleHotel(SQLModel, table=True):
    """Hotel component of a bundle."""
    __tablename__ = "bundle_hotels"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    bundle_id: int = Field(foreign_key="bundle_recommendations.id")
    hotel_deal_id: int = Field(foreign_key="hotel_deals.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    bundle: BundleRecommendation = Relationship(back_populates="hotels")
    hotel_deal: HotelDeal = Relationship(back_populates="bundle_hotels")


class Watch(SQLModel, table=True):
    """Price/inventory watch on a bundle or deal."""
    __tablename__ = "watches"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="user_sessions.id")
    bundle_id: Optional[int] = Field(default=None, foreign_key="bundle_recommendations.id")
    flight_deal_id: Optional[int] = Field(default=None, foreign_key="flight_deals.id")
    hotel_deal_id: Optional[int] = Field(default=None, foreign_key="hotel_deals.id")
    
    # Thresholds
    price_threshold_usd: Optional[Decimal] = None
    inventory_threshold: Optional[int] = None
    
    # Status
    status: WatchStatus = Field(default=WatchStatus.ACTIVE)
    last_triggered_at: Optional[datetime] = None
    trigger_count: int = Field(default=0)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    session: UserSession = Relationship(back_populates="watches")


# ============================================================================
# Pydantic v2 API Schemas (External)
# ============================================================================

class FlightDealResponse(BaseModel):
    """API response for flight deal."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    external_id: str
    origin: str
    destination: str
    departure_date: datetime
    return_date: Optional[datetime] = None
    price_usd: Decimal
    airline: Optional[str] = None
    duration_minutes: Optional[int] = None
    stops: int
    is_red_eye: bool
    deal_score: Optional[int] = None
    tags: List[str] = PydanticField(default_factory=list)


class HotelDealResponse(BaseModel):
    """API response for hotel deal."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    external_id: str
    hotel_name: str
    city: str
    check_in_date: datetime
    check_out_date: datetime
    price_per_night_usd: Decimal
    total_price_usd: Decimal
    star_rating: Optional[int] = None
    is_refundable: bool
    pet_friendly: bool
    breakfast_included: bool
    near_transit: bool
    deal_score: Optional[int] = None
    tags: List[str] = PydanticField(default_factory=list)


class BundleResponse(BaseModel):
    """API response for bundle recommendation."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    bundle_name: Optional[str] = None
    total_price_usd: Decimal
    fit_score: float
    explanation: Optional[str] = None
    watch_notes: Optional[str] = None
    flights: List[FlightDealResponse] = PydanticField(default_factory=list)
    hotels: List[HotelDealResponse] = PydanticField(default_factory=list)


class ChatRequest(BaseModel):
    """Request to chat endpoint."""
    session_id: str
    message: str


class ChatResponse(BaseModel):
    """Response from chat endpoint."""
    session_id: str
    message: str
    clarifying_question: Optional[str] = None
    bundles: List[BundleResponse] = PydanticField(default_factory=list)
    intent_parsed: Dict[str, Any] = PydanticField(default_factory=dict)


class WatchRequest(BaseModel):
    """Request to create/update watch."""
    session_id: str
    bundle_id: Optional[int] = None
    flight_deal_id: Optional[int] = None
    hotel_deal_id: Optional[int] = None
    price_threshold_usd: Optional[Decimal] = None
    inventory_threshold: Optional[int] = None


class WatchResponse(BaseModel):
    """Response for watch."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    session_id: int
    bundle_id: Optional[int] = None
    status: WatchStatus
    price_threshold_usd: Optional[Decimal] = None
    inventory_threshold: Optional[int] = None
    last_triggered_at: Optional[datetime] = None


class EventMessage(BaseModel):
    """WebSocket event message."""
    event_type: str  # "deal_update", "watch_triggered"
    timestamp: datetime = PydanticField(default_factory=datetime.utcnow)
    data: Dict[str, Any] = PydanticField(default_factory=dict)


class SelectedBundle(SQLModel, table=True):
    """Selected bundle by user for checkout."""
    __tablename__ = "selected_bundles"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="user_sessions.id")
    bundle_id: int = Field(foreign_key="bundle_recommendations.id")
    selected_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(default="pending")  # pending, processing, completed, cancelled
    
    # Relationships
    session: UserSession = Relationship(back_populates="selected_bundles")
    bundle: BundleRecommendation = Relationship()


class CheckoutQuote(BaseModel):
    """Quote for checkout with complete package details."""
    quote_id: str
    bundle_id: int
    session_id: str
    total_price_usd: Decimal
    flights: List[FlightDealResponse]
    hotels: List[HotelDealResponse]
    travelers: int
    travel_dates: Dict[str, str]
    quote_expires_at: datetime
    checkout_url: Optional[str] = None


class SelectBundleRequest(BaseModel):
    """Request to select a bundle for checkout."""
    session_id: str
    bundle_id: int


class SelectBundleResponse(BaseModel):
    """Response after selecting a bundle."""
    success: bool
    quote: Optional[CheckoutQuote] = None
    message: str

