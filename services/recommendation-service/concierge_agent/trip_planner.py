"""
Trip Planner: Composes flight+hotel bundles and computes fit scores.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple

from sqlmodel import Session, select, and_, or_
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import FlightDeal, HotelDeal, BundleRecommendation, BundleFlight, BundleHotel
from concierge_agent.llm_client import TravelIntent
from concierge_agent.airport_mapper import normalize_destination, AIRPORT_TO_CITY

logger = logging.getLogger(__name__)


class TripPlanner:
    """Plans trips by composing bundles from cached deals."""
    
    def __init__(self, session: Session):
        self.session = session
    
    def _parse_dates(self, dates: Optional[Dict[str, str]]) -> Optional[Tuple[datetime, datetime]]:
        """Parse dates from intent."""
        if not dates:
            return None
        
        try:
            start = datetime.strptime(dates.get("start_date", ""), "%Y-%m-%d")
            end = datetime.strptime(dates.get("end_date", ""), "%Y-%m-%d")
            return (start, end)
        except (ValueError, TypeError):
            return None
    
    def _find_flights(
        self,
        origin: str,
        destination: Optional[str],
        destination_preference: Optional[str],
        start_date: datetime,
        end_date: Optional[datetime],
        constraints: Dict[str, Any]
    ) -> List[FlightDeal]:
        """Find matching flights."""
        # Primary search: narrow window around requested departure date
        primary_start = start_date - timedelta(days=2)
        primary_end = start_date + timedelta(days=2)
        query = select(FlightDeal).where(
            FlightDeal.origin == origin.upper(),
            FlightDeal.departure_date >= primary_start,
            FlightDeal.departure_date <= primary_end,
        )
        
        if destination:
            # Normalize destination to airport codes
            airport_codes = normalize_destination(destination)
            if airport_codes:
                # Match any of the possible airport codes
                query = query.where(FlightDeal.destination.in_(airport_codes))
            else:
                # If no mapping found, try direct match (might be airport code already)
                query = query.where(FlightDeal.destination == destination.upper())
        
        if constraints.get("avoid_red_eye"):
            query = query.where(FlightDeal.is_red_eye == False)
        
        # Filter by deal score (only good deals) - lower threshold to include more deals
        query = query.where(FlightDeal.deal_score >= 10)
        
        # Order by deal score and price
        flights = self.session.exec(
            query.order_by(
                FlightDeal.deal_score.desc(),
                FlightDeal.price_usd.asc(),
            ).limit(20)
        ).all()

        flights = list(flights)

        # If no flights are found in the narrow window, fall back to a wider window.
        # This makes the planner more forgiving when the user's dates are slightly
        # beyond the range covered by the ingested deals.
        if not flights:
            logger.info(
                "No flights found in ±2 day window for origin=%s, date=%s. "
                "Falling back to ±14 day window.",
                origin,
                start_date.date(),
            )

            fallback_start = start_date - timedelta(days=14)
            fallback_end = start_date + timedelta(days=14)

            fallback_query = select(FlightDeal).where(
                FlightDeal.origin == origin.upper(),
                FlightDeal.departure_date >= fallback_start,
                FlightDeal.departure_date <= fallback_end,
            )

            if destination:
                airport_codes = normalize_destination(destination)
                if airport_codes:
                    fallback_query = fallback_query.where(
                        FlightDeal.destination.in_(airport_codes)
                    )
                else:
                    fallback_query = fallback_query.where(
                        FlightDeal.destination == destination.upper()
                    )

            if constraints.get("avoid_red_eye"):
                fallback_query = fallback_query.where(FlightDeal.is_red_eye == False)

            fallback_query = fallback_query.where(FlightDeal.deal_score >= 10)

            flights = self.session.exec(
                fallback_query.order_by(
            FlightDeal.deal_score.desc(),
                    FlightDeal.price_usd.asc(),
                ).limit(20)
            ).all()
        
            flights = list(flights)

            logger.info(
                "Fallback flight search found %d flights for origin=%s, "
                "date window %s to %s.",
                len(flights),
                origin,
                fallback_start.date(),
                fallback_end.date(),
            )

        return flights
    
    def _find_hotels(
        self,
        destination: Optional[str],
        destination_preference: Optional[str],
        check_in: datetime,
        check_out: datetime,
        constraints: Dict[str, Any]
    ) -> List[HotelDeal]:
        """Find matching hotels."""
        # Use flexible date overlap: hotel must overlap with requested dates
        # Hotel check-in before or on requested check-out AND hotel check-out after or on requested check-in
        query = select(HotelDeal).where(
            HotelDeal.check_in_date <= check_out,
            HotelDeal.check_out_date >= check_in
        )
        
        if destination:
            # Normalize destination for hotel matching (city names)
            # Try airport code mapping first
            airport_codes = normalize_destination(destination)
            city_names = []
            for code in airport_codes:
                if code in AIRPORT_TO_CITY:
                    city_names.append(AIRPORT_TO_CITY[code])
            
            # Add original destination as potential city name
            if destination not in city_names:
                city_names.append(destination)
            
            # Match against any of the city names
            conditions = []
            for city in city_names:
                conditions.append(HotelDeal.city.ilike(f"%{city}%"))
                conditions.append(HotelDeal.neighborhood.ilike(f"%{city}%"))
            
            if conditions:
                query = query.where(or_(*conditions))
            else:
                # Fallback to original logic
                query = query.where(
                    or_(
                        HotelDeal.city.ilike(f"%{destination}%"),
                        HotelDeal.neighborhood.ilike(f"%{destination}%")
                    )
                )
        
        # Apply constraints
        if constraints.get("pet_friendly"):
            query = query.where(HotelDeal.pet_friendly == True)
        
        if constraints.get("breakfast_included"):
            query = query.where(HotelDeal.breakfast_included == True)
        
        if constraints.get("near_transit"):
            query = query.where(HotelDeal.near_transit == True)
        
        if constraints.get("refundable"):
            query = query.where(HotelDeal.is_refundable == True)
        
        # Filter by deal score - lower threshold to include more deals
        query = query.where(HotelDeal.deal_score >= 10)
        
        hotels = self.session.exec(query.order_by(
            HotelDeal.deal_score.desc(),
            HotelDeal.total_price_usd.asc()
        ).limit(20)).all()
        
        return list(hotels)
    
    def _compute_fit_score(
        self,
        bundle_price: Decimal,
        budget: float,
        travelers: int,
        flight: FlightDeal,
        hotel: HotelDeal,
        constraints: Dict[str, Any]
    ) -> float:
        """Compute fit score (0-100) for a bundle."""
        score = 0.0
        
        # Price vs budget (0-40 points)
        if budget:
            price_per_person = float(bundle_price) / travelers
            budget_per_person = budget / travelers
            
            if price_per_person <= budget_per_person:
                # Under budget - higher score
                ratio = price_per_person / budget_per_person if budget_per_person > 0 else 1.0
                score += 40 * (1.0 - ratio * 0.3)  # Up to 40 points, bonus for being well under
            else:
                # Over budget - penalty
                ratio = budget_per_person / price_per_person if price_per_person > 0 else 0.0
                score += 20 * ratio  # Up to 20 points if slightly over
        
        # Price vs median (0-20 points)
        # Use deal scores as proxy for value
        flight_score = flight.deal_score or 0
        hotel_score = hotel.deal_score or 0
        avg_deal_score = (flight_score + hotel_score) / 2
        score += 20 * (avg_deal_score / 100)
        
        # Amenity/policy match (0-20 points)
        match_count = 0
        total_constraints = 0
        
        if constraints.get("pet_friendly") and hotel.pet_friendly:
            match_count += 1
        if constraints.get("pet_friendly"):
            total_constraints += 1
        
        if constraints.get("breakfast_included") and hotel.breakfast_included:
            match_count += 1
        if constraints.get("breakfast_included"):
            total_constraints += 1
        
        if constraints.get("near_transit") and hotel.near_transit:
            match_count += 1
        if constraints.get("near_transit"):
            total_constraints += 1
        
        if constraints.get("refundable") and hotel.is_refundable:
            match_count += 1
        if constraints.get("refundable"):
            total_constraints += 1
        
        if constraints.get("avoid_red_eye") and not flight.is_red_eye:
            match_count += 1
        if constraints.get("avoid_red_eye"):
            total_constraints += 1
        
        if total_constraints > 0:
            score += 20 * (match_count / total_constraints)
        
        # Location/convenience (0-20 points)
        # Simple heuristic: shorter flight duration and good hotel rating
        if flight.duration_minutes and flight.duration_minutes < 300:  # < 5 hours
            score += 10
        
        if hotel.star_rating and hotel.star_rating >= 4:
            score += 10
        
        return min(score, 100.0)
    
    def plan_bundles(
        self,
        intent: TravelIntent,
        session_id: int,
        max_bundles: int = 3
    ) -> List[BundleRecommendation]:
        """
        Plan bundles from cached deals.
        
        Args:
            intent: Parsed travel intent
            session_id: User session ID
            max_bundles: Maximum number of bundles to return
        
        Returns:
            List of BundleRecommendation objects
        """
        dates = self._parse_dates(intent.dates)
        if not dates:
            logger.warning("No valid dates in intent")
            return []
        
        start_date, end_date = dates
        
        # Default end_date to start_date + 2 days if not provided
        if not end_date:
            end_date = start_date + timedelta(days=2)
        
        origin = intent.origin
        if not origin:
            logger.warning("No origin in intent")
            return []
        
        # Find flights
        flights = self._find_flights(
            origin,
            intent.destination,
            intent.destination_preference,
            start_date,
            end_date,
            intent.constraints
        )
        
        if not flights:
            logger.info("No matching flights found")
            return []
        
        # Find hotels (use flight destination or preference)
        # Don't filter by destination when user said "anywhere" - let all hotels be candidates
        destination = intent.destination
        # Only use flight destination if user didn't specify a preference
        if not destination and not intent.destination_preference and flights:
            # Use first flight's destination
            destination = flights[0].destination
        
        check_in = start_date
        check_out = end_date
        
        hotels = self._find_hotels(
            destination,
            intent.destination_preference,
            check_in,
            check_out,
            intent.constraints
        )
        
        if not hotels:
            logger.info("No matching hotels found")
            return []
        
        # Compose bundles
        bundles = []
        budget = intent.budget_usd or float('inf')
        travelers = intent.travelers or 1
        
        # Try to match flights and hotels
        for flight in flights[:10]:  # Limit to top 10 flights
            for hotel in hotels[:10]:  # Limit to top 10 hotels
                # Check date overlap (hotel must overlap with requested dates)
                if hotel.check_in_date > end_date:
                    continue
                if hotel.check_out_date < start_date:
                    continue

                # Compute bundle price using user's requested dates
                # Calculate nights from user's requested dates (not hotel deal dates)
                nights = (end_date - start_date).days

                # Calculate hotel price for requested nights
                if hotel.price_per_night_usd:
                    hotel_price = hotel.price_per_night_usd * Decimal(str(nights))
                else:
                    # Fallback to total_price_usd if price_per_night not available
                    hotel_price = hotel.total_price_usd

                bundle_price = flight.price_usd * Decimal(str(travelers)) + hotel_price
                
                # Check budget - allow 20% over budget for flexibility
                if budget and float(bundle_price) > budget * 1.2:  # Allow 20% over budget
                    continue
                
                # Compute fit score
                fit_score = self._compute_fit_score(
                    bundle_price,
                    budget,
                    travelers,
                    flight,
                    hotel,
                    intent.constraints
                )
                
                # Create bundle
                bundle = BundleRecommendation(
                    session_id=session_id,
                    bundle_name=f"{flight.origin} → {flight.destination}",
                    total_price_usd=bundle_price,
                    fit_score=fit_score
                )
                
                self.session.add(bundle)
                self.session.flush()
                
                # Link flight and hotel
                bundle_flight = BundleFlight(
                    bundle_id=bundle.id,
                    flight_deal_id=flight.id
                )
                bundle_hotel = BundleHotel(
                    bundle_id=bundle.id,
                    hotel_deal_id=hotel.id
                )
                
                self.session.add(bundle_flight)
                self.session.add(bundle_hotel)
                
                bundles.append(bundle)
                
                if len(bundles) >= max_bundles:
                    break
            
            if len(bundles) >= max_bundles:
                break
        
        self.session.commit()
        
        # Refresh bundles to load relationships
        for bundle in bundles:
            self.session.refresh(bundle)
        
        return bundles

