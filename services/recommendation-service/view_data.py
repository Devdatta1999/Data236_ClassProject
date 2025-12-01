#!/usr/bin/env python3
"""Quick script to view database inventory."""
from database import engine
from sqlmodel import Session, select
from models import FlightDeal, HotelDeal

print("="*80)
print("DATABASE INVENTORY")
print("="*80)

with Session(engine) as session:
    # Flights
    flights = session.exec(select(FlightDeal)).all()
    print(f"\n✈️  FLIGHTS: {len(flights)} records")
    print("-" * 80)
    for f in flights:
        print(f"  {f.origin} → {f.destination} | ${f.price_usd:.2f} | {f.departure_date.date()}")
        print(f"    Airline: {f.airline} | Seats: {f.available_seats} | Score: {f.deal_score} | Red-eye: {f.is_red_eye}")
    
    # Hotels
    hotels = session.exec(select(HotelDeal)).all()
    print(f"\n🏨 HOTELS: {len(hotels)} records")
    print("-" * 80)
    for h in hotels:
        print(f"  {h.hotel_name} ({h.city}) | ${h.price_per_night_usd:.2f}/night | Total: ${h.total_price_usd:.2f}")
        print(f"    Dates: {h.check_in_date.date()} to {h.check_out_date.date()}")
        print(f"    Stars: {h.star_rating} | Score: {h.deal_score} | Rooms: {h.available_rooms}")
        print(f"    Pet-friendly: {h.pet_friendly} | Refundable: {h.is_refundable} | Breakfast: {h.breakfast_included} | Near transit: {h.near_transit}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {len(flights)} flights, {len(hotels)} hotels")
    print("="*80)

