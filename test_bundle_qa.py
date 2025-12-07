"""
Test script for bundle Q&A feature.
Tests the intent classification and bundle question answering capabilities.
"""
import requests
import json
import time
from uuid import uuid4

BASE_URL = "http://localhost:8000"

def print_response(title, response):
    """Pretty print API response."""
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if 'message' in data:
            print(f"Message: {data['message']}")
        if 'bundles' in data and data['bundles']:
            print(f"\nBundles returned: {len(data['bundles'])}")
            for i, bundle in enumerate(data['bundles'], 1):
                print(f"\n  Bundle {i}:")
                print(f"    Name: {bundle.get('bundle_name')}")
                print(f"    Price: ${bundle.get('total_price_usd')}")
                print(f"    Fit Score: {bundle.get('fit_score')}/100")
                print(f"    Explanation: {bundle.get('explanation')}")
    else:
        print(f"Error: {response.text}")
    print(f"{'='*60}\n")

def test_bundle_qa():
    """Test bundle Q&A functionality."""
    session_id = str(uuid4())
    print(f"\n🧪 Testing Bundle Q&A Feature")
    print(f"Session ID: {session_id}\n")

    # Test 1: Initial trip request
    print("📍 TEST 1: Initial Trip Request")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "I need a trip from SFO to LAX from 2024-01-01 to 2024-01-02 for 3 people with a budget of $1000"
        }
    )
    print_response("Trip Planning Response", response)

    if response.status_code != 200:
        print("❌ Trip planning failed. Stopping tests.")
        return

    # Wait a moment for the data to be stored
    time.sleep(1)

    # Test 2: Ask about specific bundle
    print("\n📍 TEST 2: Question about Bundle 1")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "Tell me more about Bundle 1"
        }
    )
    print_response("Bundle 1 Details", response)

    # Test 3: Ask about hotel details
    print("\n📍 TEST 3: Question about Hotel")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "What's the hotel like in the first option?"
        }
    )
    print_response("Hotel Details", response)

    # Test 4: Ask about amenities
    print("\n📍 TEST 4: Question about Breakfast")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "Does bundle 1 include breakfast?"
        }
    )
    print_response("Breakfast Info", response)

    # Test 5: Compare bundles
    print("\n📍 TEST 5: Compare Bundles")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "What's the difference between bundle 1 and bundle 2?"
        }
    )
    print_response("Bundle Comparison", response)

    # Test 6: Ask about flight details
    print("\n📍 TEST 6: Question about Flight Stops")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "How many stops does the flight have in option 2?"
        }
    )
    print_response("Flight Stops Info", response)

    # Test 7: New trip request (should trigger new planning, not Q&A)
    print("\n📍 TEST 7: New Trip Request (Should NOT trigger Q&A)")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "Actually, show me trips from SFO to NYC for December 15-20 for 2 people, $2000 budget"
        }
    )
    print_response("New Trip Response", response)

    # Test 8: Ask about the NEW bundles
    print("\n📍 TEST 8: Question about NEW NYC Bundles")
    print("=" * 60)
    response = requests.post(
        f"{BASE_URL}/chat",
        json={
            "session_id": session_id,
            "message": "Tell me about the hotel in bundle 1"
        }
    )
    print_response("NYC Hotel Details", response)

    print("\n" + "="*60)
    print("✅ All tests completed!")
    print("="*60)

if __name__ == "__main__":
    try:
        # Check if service is running
        health_response = requests.get(f"{BASE_URL}/health", timeout=5)
        if health_response.status_code == 200:
            print("✅ Recommendation service is running\n")
            test_bundle_qa()
        else:
            print("❌ Recommendation service is not healthy")
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to recommendation service at", BASE_URL)
        print("   Make sure it's running on port 8000")
    except Exception as e:
        print(f"❌ Error: {e}")
