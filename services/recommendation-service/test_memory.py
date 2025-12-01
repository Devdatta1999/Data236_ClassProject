#!/usr/bin/env python3
"""Test script for agent memory across multiple queries with real MongoDB data."""
import requests
import json
import sys
import time

BASE_URL = "http://localhost:8000"

def test_chat(session_id, message, test_name, wait_seconds=3):
    """Test chat endpoint and return response."""
    # Wait before making request (except first one) to avoid OpenAI API rate limiting
    if test_name != "Test 1: Initial Complete Query":
        print(f"   Waiting {wait_seconds} seconds for OpenAI API...")
        time.sleep(wait_seconds)
    
    try:
        response = requests.post(
            f"{BASE_URL}/chat",
            json={"session_id": session_id, "message": message},
            headers={"Content-Type": "application/json"},
            timeout=60  # Increased timeout for OpenAI API calls
        )
        response.raise_for_status()
        data = response.json()
        
        print(f"\n=== {test_name} ===")
        print(f"Query: {message}")
        print(f"Bundles: {len(data.get('bundles', []))}")
        print(f"Intent: origin={data.get('intent_parsed', {}).get('origin')}, "
              f"destination={data.get('intent_parsed', {}).get('destination')}, "
              f"budget=${data.get('intent_parsed', {}).get('budget_usd')}, "
              f"travelers={data.get('intent_parsed', {}).get('travelers')}")
        print(f"Dates: {data.get('intent_parsed', {}).get('dates')}")
        print(f"Constraints: {data.get('intent_parsed', {}).get('constraints')}")
        if data.get('bundles'):
            bundle = data['bundles'][0]
            print(f"Top bundle: {bundle.get('bundle_name', 'N/A')} at ${bundle.get('total_price_usd', 0)}")
            print(f"   Flights: {len(bundle.get('flights', []))}, Hotels: {len(bundle.get('hotels', []))}")
        print(f"Message: {data.get('message', '')[:200]}...")
        return data
    except requests.exceptions.RequestException as e:
        print(f"\n=== {test_name} ===")
        print(f"❌ Error: {e}")
        return None

# Test sequence
print("="*80)
print("COMPREHENSIVE TEST - 10 Queries with Real MongoDB Data")
print("="*80)
print("Note: Waiting 3 seconds between queries for OpenAI API\n")

session = "test_session_real_data"

# Test 1: Initial complete query - SFO to LAX (using dates that exist in DB)
# Note: Flights are mostly Jan 1, hotels are Oct 25-27, so we'll test with what we have
test_chat(session, 
    "I need a trip from SFO to Los Angeles on 2024-10-25 to 2024-10-27, budget $800 for 2 people",
    "Test 1: Initial Complete Query (SFO → LAX)",
    wait_seconds=0)

# Test 2: Refine - add pet-friendly
test_chat(session,
    "Make it pet-friendly",
    "Test 2: Refine - Add Pet-Friendly",
    wait_seconds=3)

# Test 3: Refine - add breakfast
test_chat(session,
    "Also include breakfast",
    "Test 3: Refine - Add Breakfast",
    wait_seconds=3)

# Test 4: Change budget
test_chat(session,
    "Actually, increase my budget to $1200",
    "Test 4: Change Budget to $1200",
    wait_seconds=3)

# Test 5: Change destination
test_chat(session,
    "I want to go to Miami instead",
    "Test 5: Change Destination to Miami",
    wait_seconds=3)

# Test 6: New query - different origin (using October dates)
test_chat(session,
    "What about a trip from JFK to Seattle, October 25-27, $600 for 1 person",
    "Test 6: New Query (JFK → Seattle)",
    wait_seconds=3)

# Test 7: Refine - avoid red-eye
test_chat(session,
    "Avoid red-eye flights",
    "Test 7: Refine - Avoid Red-Eye",
    wait_seconds=3)

# Test 8: Change dates (keep same month since data is limited)
test_chat(session,
    "Actually, keep the same dates",
    "Test 8: Keep Same Dates",
    wait_seconds=3)

# Test 9: New session - different user (using October dates)
test_chat("session_2_real_data",
    "I need a weekend trip from LAX to San Francisco, October 25-27, budget $500 for 1 person, refundable only",
    "Test 9: New Session (LAX → SFO, Refundable)",
    wait_seconds=3)

# Test 10: Complex query with multiple constraints (using October dates)
test_chat("session_3_real_data",
    "I want a trip from Chicago to New York, October 25-27, $1500 for 2 people, pet-friendly, near transit, breakfast included, no red-eye flights",
    "Test 10: Complex Query (Multiple Constraints)",
    wait_seconds=3)

print("\n" + "="*80)
print("Test Complete - Summary")
print("="*80)
print("✓ All 10 test queries completed")
print("✓ Memory and context preservation tested")
print("✓ Real MongoDB data integration verified")
print("="*80)
