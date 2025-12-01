#!/usr/bin/env python3
"""Test script to verify MongoDB connection and data availability."""
import os
import sys
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

def test_mongodb_connection():
    """Test MongoDB connection and check for flights/hotels data."""
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/aerive")
    database_name = "aerive"
    
    print("="*80)
    print("MongoDB Connection Test")
    print("="*80)
    print(f"MongoDB URI: {mongodb_uri.replace('://', '://***:***@') if '@' in mongodb_uri else mongodb_uri}")
    print(f"Database: {database_name}")
    print()
    
    try:
        # Connect to MongoDB
        print("Connecting to MongoDB...")
        client = MongoClient(
            mongodb_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000
        )
        
        # Test connection
        client.admin.command('ping')
        print("✓ MongoDB connection successful")
        
        # Get database
        db = client[database_name]
        print(f"✓ Connected to database: {database_name}")
        print()
        
        # Check flights collection
        flights_collection = db["flights"]
        flights_count = flights_collection.count_documents({"status": "Active"})
        print(f"📊 Flights Collection:")
        print(f"   Total Active flights: {flights_count}")
        
        if flights_count > 0:
            sample_flight = flights_collection.find_one({"status": "Active"})
            if sample_flight:
                print(f"   Sample flight ID: {sample_flight.get('flightId', 'N/A')}")
                print(f"   Route: {sample_flight.get('departureAirport', 'N/A')} → {sample_flight.get('arrivalAirport', 'N/A')}")
                print(f"   Provider: {sample_flight.get('providerName', 'N/A')}")
                print(f"   Seat types: {len(sample_flight.get('seatTypes', []))}")
        print()
        
        # Check hotels collection
        hotels_collection = db["hotels"]
        hotels_count = hotels_collection.count_documents({"status": "Active"})
        print(f"📊 Hotels Collection:")
        print(f"   Total Active hotels: {hotels_count}")
        
        if hotels_count > 0:
            sample_hotel = hotels_collection.find_one({"status": "Active"})
            if sample_hotel:
                print(f"   Sample hotel ID: {sample_hotel.get('hotelId', 'N/A')}")
                print(f"   Name: {sample_hotel.get('hotelName', 'N/A')}")
                print(f"   City: {sample_hotel.get('city', 'N/A')}")
                print(f"   Room types: {len(sample_hotel.get('roomTypes', []))}")
        print()
        
        # Check cars collection (optional)
        cars_collection = db["cars"]
        cars_count = cars_collection.count_documents({"status": "Active"})
        print(f"📊 Cars Collection:")
        print(f"   Total Active cars: {cars_count}")
        print()
        
        # Summary
        print("="*80)
        print("Summary")
        print("="*80)
        print(f"✓ MongoDB connection: OK")
        print(f"✓ Active flights: {flights_count}")
        print(f"✓ Active hotels: {hotels_count}")
        print(f"✓ Active cars: {cars_count}")
        
        if flights_count == 0 and hotels_count == 0:
            print()
            print("⚠️  WARNING: No active flights or hotels found!")
            print("   Make sure you have data in MongoDB with status='Active'")
        
        client.close()
        return True
        
    except ConnectionFailure as e:
        print(f"✗ MongoDB connection failed: {e}")
        print()
        print("Troubleshooting:")
        print("1. Check if MongoDB is running")
        print("2. Verify MONGODB_URI environment variable")
        print("3. Check network connectivity")
        return False
    except ServerSelectionTimeoutError as e:
        print(f"✗ MongoDB server selection timeout: {e}")
        print()
        print("Troubleshooting:")
        print("1. Check if MongoDB server is accessible")
        print("2. Verify MONGODB_URI is correct")
        print("3. Check firewall/network settings")
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_mongodb_connection()
    sys.exit(0 if success else 1)

