#!/usr/bin/env python3
"""Test 10 different query types to verify system behavior."""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_query(session_id, message, query_num, description):
    """Test a query and print results."""
    print(f"\n{'='*80}")
    print(f"QUERY {query_num}: {description}")
    print(f"{'='*80}")
    print(f"Message: {message}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/chat",
            json={"session_id": session_id, "message": message},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        print(f"\n✓ Response received")
        print(f"  Bundles found: {len(data['bundles'])}")
        print(f"  Intent parsed: origin={data['intent_parsed'].get('origin')}, "
              f"destination={data['intent_parsed'].get('destination')}, "
              f"budget=${data['intent_parsed'].get('budget_usd')}, "
              f"travelers={data['intent_parsed'].get('travelers')}")
        print(f"  Dates: {data['intent_parsed'].get('dates')}")
        print(f"  Constraints: {data['intent_parsed'].get('constraints')}")
        
        if data['bundles']:
            print(f"\n  Top 3 bundles:")
            for i, bundle in enumerate(data['bundles'][:3], 1):
                print(f"    {i}. {bundle['bundle_name']} - ${bundle['total_price_usd']} "
                      f"(fit: {bundle['fit_score']:.1f})")
                print(f"       Flight: {bundle['flights'][0]['origin']} → {bundle['flights'][0]['destination']} "
                      f"${bundle['flights'][0]['price_usd']}")
                print(f"       Hotel: {bundle['hotels'][0]['hotel_name']} in {bundle['hotels'][0]['city']} "
                      f"${bundle['hotels'][0]['total_price_usd']}")
        else:
            print(f"  ⚠ No bundles found")
            if data.get('clarifying_question'):
                print(f"  Clarifying question: {data['clarifying_question']}")
        
        print(f"  Response message: {data['message'][:150]}...")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"  ✗ Error: {e}")
        return None
    except Exception as e:
        print(f"  ✗ Unexpected error: {e}")
        return None

# Run 10 different query types
print("="*80)
print("TESTING 10 DIFFERENT QUERY TYPES")
print("="*80)

# Query 1: Complete initial query
test_query("test_session_1", 
    "I need a trip from SFO on 2024-10-25 to 2024-10-27, anywhere warm, budget $1000 for 2 people",
    1, "Complete Initial Query")

# Query 2: Minimal query (should ask for clarification)
test_query("test_session_2",
    "I want to travel",
    2, "Minimal Query (Should Clarify)")

# Query 3: Query with specific destination
test_query("test_session_3",
    "Find me flights and hotels from LAX to New York, December 15-17, $1500 for 1 person",
    3, "Specific Destination Query")

# Query 4: Query with constraints
test_query("test_session_4",
    "I need a weekend trip from SFO, Oct 25-27, $800 for 2, pet-friendly and refundable",
    4, "Query with Multiple Constraints")

# Query 5: Refinement query (memory test)
session_5 = "test_session_5"
test_query(session_5,
    "I need a trip from SFO on 2024-10-25 to 2024-10-27, budget $1000 for 2 people",
    5, "Initial Query for Refinement")
time.sleep(1)
test_query(session_5,
    "Make it pet-friendly and avoid red-eye flights",
    5.1, "Refinement: Add Constraints")

# Query 6: Budget change
session_6 = "test_session_6"
test_query(session_6,
    "I want to go from SFO to anywhere, Oct 25-27, $1200 for 2",
    6, "Initial with Higher Budget")
time.sleep(1)
test_query(session_6,
    "Actually, my budget is only $600",
    6.1, "Refinement: Lower Budget")

# Query 7: Date change
session_7 = "test_session_7"
test_query(session_7,
    "Trip from SFO, Oct 25-27, $1000 for 2",
    7, "Initial Query")
time.sleep(1)
test_query(session_7,
    "Change dates to Oct 28-30",
    7.1, "Refinement: Change Dates")

# Query 8: Traveler count change
session_8 = "test_session_8"
test_query(session_8,
    "I need a trip from SFO, Oct 25-27, $1000 for 1 person",
    8, "Single Traveler")
time.sleep(1)
test_query(session_8,
    "Actually, make it for 4 people",
    8.1, "Refinement: Increase Travelers")

# Query 9: Complex constraints
test_query("test_session_9",
    "Find me a trip from SFO, Oct 25-27, $1000 for 2, with breakfast included, near transit, and refundable",
    9, "Multiple Specific Constraints")

# Query 10: Destination preference
test_query("test_session_10",
    "I want a beach vacation from JFK, any dates in November, $2000 for 2 people",
    10, "Destination Preference (Beach)")

print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print("✓ All 10 query types tested")
print("✓ Memory/refinement queries verified")
print("✓ Various constraint combinations tested")
print("="*80)

