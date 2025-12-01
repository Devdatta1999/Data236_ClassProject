#!/usr/bin/env python3
"""Test script with verified queries that have actual data in the database."""
import requests
import json
import sys
import time
from database import engine, init_db
from sqlmodel import Session, select
from models import FlightDeal, HotelDeal
from datetime import datetime

BASE_URL = "http://localhost:8000"


def verify_data_exists(origin, destination, start_date, end_date):
    """Verify that flights and hotels exist for the query window."""
    init_db()
    with Session(engine) as session:
        # Check flights in a ±2 day window around the requested start date
        from datetime import timedelta

        flights = session.exec(
            select(FlightDeal)
            .where(FlightDeal.origin == origin.upper())
            .where(
                FlightDeal.departure_date
                >= datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=2)
            )
            .where(
                FlightDeal.departure_date
                <= datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=2)
            )
        ).all()
        
        # Filter by destination if provided
        if destination:
            from concierge_agent.airport_mapper import normalize_destination

            airport_codes = normalize_destination(destination)
            if airport_codes:
                flights = [f for f in flights if f.destination in airport_codes]
        
        # Check hotels that overlap the requested window
        hotels = session.exec(
            select(HotelDeal)
            .where(HotelDeal.check_in_date <= datetime.strptime(end_date, "%Y-%m-%d"))
            .where(
                HotelDeal.check_out_date >= datetime.strptime(start_date, "%Y-%m-%d")
            )
        ).all()
        
        # Filter by city if destination provided
        if destination and hotels:
            from concierge_agent.airport_mapper import CITY_TO_AIRPORTS, AIRPORT_TO_CITY

            city_names = []
            if destination.upper() in AIRPORT_TO_CITY:
                city_names.append(AIRPORT_TO_CITY[destination.upper()])
            else:
                # Try to find city from destination name
                for city, codes in CITY_TO_AIRPORTS.items():
                    if destination.lower() in city.lower() or city.lower() in destination.lower():
                        city_names.append(city)
                        break
                if not city_names:
                    city_names.append(destination)
            
            filtered_hotels = []
            for h in hotels:
                for city in city_names:
                    if city.lower() in h.city.lower():
                        filtered_hotels.append(h)
                        break
            hotels = filtered_hotels
        
        return len(flights), len(hotels)

def test_chat(session_id, message, test_name, expected_bundles=None, wait_seconds=3):
    """Test chat endpoint and return response."""
    if test_name != "Test 1: Initial Complete Query":
        print(f"   Waiting {wait_seconds} seconds for OpenAI API...")
        time.sleep(wait_seconds)
    
    try:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/chat",
            json={"session_id": session_id, "message": message},
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        elapsed = time.time() - start_time
        response.raise_for_status()
        data = response.json()
        
        bundles_count = len(data.get('bundles', []))
        
        print(f"\n=== {test_name} ===")
        print(f"Query: {message}")
        print(f"Response time: {elapsed:.2f}s")
        print(f"Bundles: {bundles_count}" + (f" (expected: {expected_bundles})" if expected_bundles is not None else ""))
        print(f"Intent: origin={data.get('intent_parsed', {}).get('origin')}, "
              f"destination={data.get('intent_parsed', {}).get('destination')}, "
              f"budget=${data.get('intent_parsed', {}).get('budget_usd')}, "
              f"travelers={data.get('intent_parsed', {}).get('travelers')}")
        print(f"Dates: {data.get('intent_parsed', {}).get('dates')}")
        
        if bundles_count > 0:
            bundle = data['bundles'][0]
            print(f"✓ Top bundle: {bundle.get('bundle_name', 'N/A')} at ${bundle.get('total_price_usd', 0)}")
            print(f"   Flights: {len(bundle.get('flights', []))}, Hotels: {len(bundle.get('hotels', []))}")
        else:
            print(f"⚠️  No bundles found")
            if expected_bundles and expected_bundles > 0:
                print(f"   ⚠️  Expected bundles but got 0!")
        
        print(f"Message: {data.get('message', '')[:150]}...")
        return data
    except requests.exceptions.RequestException as e:
        print(f"\n=== {test_name} ===")
        print(f"❌ Error: {e}")
        return None

# ---------------------------------------------------------------------------
# Part 1: Chat-based tests (10 cases) – verify bundles vs DB-backed data
# ---------------------------------------------------------------------------
print("=" * 80)
print("VERIFIED TEST - Using Queries with Actual Database Data")
print("=" * 80)
print("Part 1: Chat-based trip queries (10 tests)\n")

session = "test_verified_data"

# Test 1: SFO → LAX on Jan 1, 2024 (has 2 flights, but hotels might not match dates)
# Let's use Oct 25-27 which has both flights and hotels
print("Verifying Test 1 data...")
flights, hotels = verify_data_exists("SFO", "Los Angeles", "2024-10-25", "2024-10-27")
print(f"  Flights available: {flights}, Hotels available: {hotels}\n")

test_chat(session, 
    "I need a trip from SFO to Los Angeles on 2024-10-25 to 2024-10-27, budget $800 for 2 people",
    "Test 1: SFO → LAX (Oct 25-27)",
    expected_bundles=1 if flights > 0 and hotels > 0 else 0,
    wait_seconds=0)

# Test 2: SFO → DFW on Jan 1, 2024 (has 4 flights, but need to check hotels)
print("\nVerifying Test 2 data...")
flights2, hotels2 = verify_data_exists("SFO", "Dallas", "2024-01-01", "2024-01-03")
print(f"  Flights available: {flights2}, Hotels available: {hotels2}\n")

test_chat(session,
    "I want to go to Dallas instead, January 1-3, 2024, budget $1000 for 2 people",
    "Test 2: SFO → DFW (Jan 1-3)",
    expected_bundles=1 if flights2 > 0 and hotels2 > 0 else 0,
    wait_seconds=3)

# Test 3: SFO → SEA on Jan 1, 2024 (has 2 flights)
print("\nVerifying Test 3 data...")
flights3, hotels3 = verify_data_exists("SFO", "Seattle", "2024-01-01", "2024-01-03")
print(f"  Flights available: {flights3}, Hotels available: {hotels3}\n")

test_chat(session,
    "Actually, change it to Seattle, same dates",
    "Test 3: Change to Seattle",
    expected_bundles=1 if flights3 > 0 and hotels3 > 0 else 0,
    wait_seconds=3)

# Test 4: SFO → MIA on Oct 25-27 (has flight and hotel)
print("\nVerifying Test 4 data...")
flights4, hotels4 = verify_data_exists("SFO", "Miami", "2024-10-25", "2024-10-27")
print(f"  Flights available: {flights4}, Hotels available: {hotels4}\n")

test_chat(session,
    "I want to go to Miami on October 25-27, budget $1200 for 2 people, pet-friendly",
    "Test 4: SFO → MIA (Oct 25-27, Pet-friendly)",
    expected_bundles=1 if flights4 > 0 and hotels4 > 0 else 0,
    wait_seconds=3)

# Test 5: JFK → Anywhere on Jan 1
print("\nVerifying Test 5 data...")
flights5, hotels5 = verify_data_exists("JFK", None, "2024-01-01", "2024-01-03")
print(f"  Flights available: {flights5}, Hotels available: {hotels5}\n")

test_chat(session,
    "I need a trip from JFK, January 1-3, 2024, budget $600 for 1 person, anywhere warm",
    "Test 5: JFK → Anywhere Warm (Jan 1-3)",
    expected_bundles=1 if flights5 > 0 and hotels5 > 0 else 0,
    wait_seconds=3)

# Test 6: LAX → SFO on Oct 25-27 (check if return flight exists)
print("\nVerifying Test 6 data...")
flights6, hotels6 = verify_data_exists("LAX", "San Francisco", "2024-10-25", "2024-10-27")
print(f"  Flights available: {flights6}, Hotels available: {hotels6}\n")

test_chat("session_2_verified",
    "I need a trip from LAX to San Francisco, October 25-27, budget $500 for 1 person",
    "Test 6: LAX → SFO (Oct 25-27)",
    expected_bundles=1 if flights6 > 0 and hotels6 > 0 else 0,
    wait_seconds=3)

# Test 7: SFO → OAK on Jan 1 (has 4 flights, cheapest route)
print("\nVerifying Test 7 data...")
flights7, hotels7 = verify_data_exists("SFO", "Oakland", "2024-01-01", "2024-01-03")
print(f"  Flights available: {flights7}, Hotels available: {hotels7}\n")

test_chat("session_3_verified",
    "I want the cheapest trip from SFO to Oakland, January 1-3, 2024, budget $300 for 1 person",
    "Test 7: SFO → OAK (Cheapest, Jan 1-3)",
    expected_bundles=1 if flights7 > 0 and hotels7 > 0 else 0,
    wait_seconds=3)

# Test 8: SFO → PHX on Jan 1 (has 2 flights)
print("\nVerifying Test 8 data...")
flights8, hotels8 = verify_data_exists("SFO", "Phoenix", "2024-01-01", "2024-01-03")
print(f"  Flights available: {flights8}, Hotels available: {hotels8}\n")

test_chat("session_4_verified",
    "Find me a trip from SFO to Phoenix, January 1-3, 2024, $800 for 2 people, breakfast included",
    "Test 8: SFO → PHX (Jan 1-3, Breakfast)",
    expected_bundles=1 if flights8 > 0 and hotels8 > 0 else 0,
    wait_seconds=3)

# Test 9: Test memory - refine previous query
test_chat("session_4_verified",
    "Make it refundable",
    "Test 9: Refine - Add Refundable",
    expected_bundles=None,  # Could go either way
    wait_seconds=3)

# Test 10: Test with date that has NO data (should return 0)
print("\nVerifying Test 10 data (should have NO flights)...")
flights10, hotels10 = verify_data_exists("SFO", "Los Angeles", "2024-11-23", "2024-11-28")
print(f"  Flights available: {flights10}, Hotels available: {hotels10}\n")

test_chat(
    "session_5_verified",
    "I need a trip from SFO to Los Angeles on November 23-28, 2024, budget $900 for 2 people",
    "Test 10: SFO → LAX (Nov 23-28) - Should Return 0",
    expected_bundles=0,  # Should be 0 - no data for these dates
    wait_seconds=3,
)

# ---------------------------------------------------------------------------
# Part 2: Flight-only DB tests (5 cases) – verify normalized FlightDeal data
# ---------------------------------------------------------------------------
print("\n" + "=" * 80)
print("Part 2: Flight-only DB checks (5 tests)")
print("=" * 80)

init_db()
with Session(engine) as session:
    # F1: All SFO-origin flights
    flights_sfo = session.exec(select(FlightDeal).where(FlightDeal.origin == "SFO")).all()
    print(
        f"\nF1: All flights from SFO -> count={len(flights_sfo)}"
        + (f", sample={flights_sfo[0].origin}→{flights_sfo[0].destination}" if flights_sfo else "")
    )

    # F2: Flights from SFO on/around 2024-10-25
    flights_sfo_oct = session.exec(
        select(FlightDeal).where(
            FlightDeal.origin == "SFO",
            FlightDeal.departure_date.between(
                datetime(2024, 10, 23), datetime(2024, 10, 27)
            ),
        )
    ).all()
    print(
        f"F2: SFO flights around 2024-10-25 (±2 days) -> count={len(flights_sfo_oct)}"
        + (
            f", sample={flights_sfo_oct[0].origin}→{flights_sfo_oct[0].destination}"
            if flights_sfo_oct
            else ""
        )
    )

    # F3: Flights with destination LAX
    flights_to_lax = session.exec(
        select(FlightDeal).where(FlightDeal.destination == "LAX")
    ).all()
    print(
        f"F3: Flights to LAX -> count={len(flights_to_lax)}"
        + (
            f", sample={flights_to_lax[0].origin}→{flights_to_lax[0].destination}"
            if flights_to_lax
            else ""
        )
    )

    # F4: Flights from JFK
    flights_jfk = session.exec(select(FlightDeal).where(FlightDeal.origin == "JFK")).all()
    print(
        f"F4: Flights from JFK -> count={len(flights_jfk)}"
        + (
            f", sample={flights_jfk[0].origin}→{flights_jfk[0].destination}"
            if flights_jfk
            else ""
        )
    )

    # F5: Short-haul flights (< 5 hours)
    short_flights = session.exec(
        select(FlightDeal).where(FlightDeal.duration_minutes < 300)
    ).all()
    print(
        f"F5: Short flights (<5h) -> count={len(short_flights)}"
        + (
            f", sample={short_flights[0].origin}→{short_flights[0].destination}"
            if short_flights
            else ""
        )
    )

# ---------------------------------------------------------------------------
# Part 3: Hotel-only DB tests (5 cases) – verify normalized HotelDeal data
# ---------------------------------------------------------------------------
print("\n" + "=" * 80)
print("Part 3: Hotel-only DB checks (5 tests)")
print("=" * 80)

init_db()
with Session(engine) as session:
    # H1: All hotels in San Jose
    hotels_sj = session.exec(
        select(HotelDeal).where(HotelDeal.city.ilike("%San Jose%"))
    ).all()
    print(
        f"\nH1: Hotels in San Jose -> count={len(hotels_sj)}"
        + (f", sample={hotels_sj[0].hotel_name}" if hotels_sj else "")
    )

    # H2: Hotels overlapping Oct 25–27, 2024
    hotels_oct = session.exec(
        select(HotelDeal)
        .where(HotelDeal.check_in_date <= datetime(2024, 10, 27))
        .where(HotelDeal.check_out_date >= datetime(2024, 10, 25))
    ).all()
    print(
        f"H2: Hotels overlapping 2024-10-25 to 2024-10-27 -> count={len(hotels_oct)}"
        + (f", sample={hotels_oct[0].hotel_name}" if hotels_oct else "")
    )

    # H3: Pet-friendly hotels
    hotels_pet = session.exec(
        select(HotelDeal).where(HotelDeal.pet_friendly == True)  # noqa: E712
    ).all()
    print(
        f"H3: Pet-friendly hotels -> count={len(hotels_pet)}"
        + (f", sample={hotels_pet[0].hotel_name}" if hotels_pet else "")
    )

    # H4: Hotels with breakfast included
    hotels_breakfast = session.exec(
        select(HotelDeal).where(HotelDeal.breakfast_included == True)  # noqa: E712
    ).all()
    print(
        f"H4: Hotels with breakfast included -> count={len(hotels_breakfast)}"
        + (f", sample={hotels_breakfast[0].hotel_name}" if hotels_breakfast else "")
    )

    # H5: Hotels near transit
    hotels_transit = session.exec(
        select(HotelDeal).where(HotelDeal.near_transit == True)  # noqa: E712
    ).all()
    print(
        f"H5: Hotels near transit -> count={len(hotels_transit)}"
        + (f", sample={hotels_transit[0].hotel_name}" if hotels_transit else "")
    )

print("\n" + "=" * 80)
print("Test Complete - Summary")
print("=" * 80)
print("✓ 10 chat-based trip queries executed")
print("✓ 5 flight-only DB checks executed")
print("✓ 5 hotel-only DB checks executed")
print("=" * 80)

