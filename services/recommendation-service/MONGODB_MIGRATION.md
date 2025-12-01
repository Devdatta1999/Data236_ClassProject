# MongoDB Integration - Migration Summary

## Overview

The recommendation service has been updated to read data directly from MongoDB instead of CSV files. This provides real-time access to flight and hotel listings from the main database.

## Changes Made

### 1. New Component: `mongo_reader.py`
- **Location**: `deals_agent/mongo_reader.py`
- **Purpose**: Reads from MongoDB collections (`flights`, `hotels`) and publishes to Kafka
- **Features**:
  - Connects to MongoDB using `MONGODB_URI` environment variable
  - Queries only documents with `status: "Active"`
  - Transforms MongoDB documents to match expected format for normalizer
  - Publishes to Kafka topic `raw_supplier_feeds`
  - Runs on a schedule (default: every 5 minutes)

### 2. Data Transformation

**Flights**:
- Maps `flightId` → `id`
- Maps `departureAirport` → `origin`
- Maps `arrivalAirport` → `destination`
- Extracts first `seatType` for pricing and availability
- Determines red-eye flights based on departure time
- Uses `departureDateTime` or constructs from `availableFrom` + `departureTime`

**Hotels**:
- Maps `hotelId` → `id`
- Maps `hotelName` → `hotel_name`
- Extracts first `roomType` for pricing and availability
- Maps `amenities` array to boolean flags (pet_friendly, breakfast_included, etc.)
- Uses `availableFrom`/`availableTo` as check-in/check-out dates

### 3. Updated Files

- `requirements.txt`: Added `pymongo==4.6.0`
- `run_all_workers.sh`: Replaced `feed_producer` with `mongo_reader`
- `README.md`: Updated documentation to reflect MongoDB integration
- Created `test_mongo_connection.py`: Test script to verify MongoDB connection

### 4. Environment Variables

**New Required Variable**:
- `MONGODB_URI`: MongoDB connection string
  - Example: `mongodb+srv://user:pass@cluster.mongodb.net/aerive`
  - Default: `mongodb://localhost:27017/aerive` (for local development)

## Migration Steps

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set Environment Variable**:
   ```bash
   export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/aerive"
   ```

3. **Test MongoDB Connection**:
   ```bash
   python test_mongo_connection.py
   ```

4. **Start MongoDB Reader**:
   ```bash
   python -m deals_agent.mongo_reader
   ```

5. **Verify Data Flow**:
   - Check Kafka topic `raw_supplier_feeds` for messages
   - Verify normalizer is processing messages
   - Check SQLite database for new deals

## Data Flow

```
MongoDB (flights, hotels collections)
    ↓
MongoDB Reader (mongo_reader.py)
    ↓
Kafka Topic: raw_supplier_feeds
    ↓
Normalizer (normalizer.py)
    ↓
SQLite Database + Kafka Topic: deals.normalized
    ↓
Deal Detector → Offer Tagger → Event Emitter
```

## Notes

- **CSV Files**: The old CSV-based `feed_producer.py` is still available but not used by default. You can switch back by updating `run_all_workers.sh` if needed.
- **Cars**: Cars are out of scope for MVP, but the MongoDB reader can be extended to include them if needed.
- **Performance**: The MongoDB reader uses synchronous pymongo in async context. For high-frequency operations, consider switching to `motor` (async MongoDB driver).
- **Filtering**: Only documents with `status: "Active"` are processed. Make sure your MongoDB documents have this field set correctly.

## Troubleshooting

### Connection Issues
- Verify `MONGODB_URI` is set correctly
- Check MongoDB server is accessible
- Verify network/firewall settings
- Test with `test_mongo_connection.py`

### No Data Processing
- Check MongoDB collections have documents with `status: "Active"`
- Verify Kafka is running and accessible
- Check MongoDB reader logs for errors
- Verify normalizer is running and consuming messages

### Data Format Issues
- Ensure MongoDB documents match expected schema
- Check that flights have `seatTypes` or legacy pricing fields
- Verify hotels have `roomTypes` with pricing
- Review transformation logic in `mongo_reader.py`

## Testing

Run the test script to verify everything is working:

```bash
export MONGODB_URI="your_mongodb_uri"
python test_mongo_connection.py
```

This will:
- Test MongoDB connection
- Count active flights, hotels, and cars
- Display sample documents
- Provide troubleshooting tips if connection fails

