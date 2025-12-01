# Checkout API Documentation

## Overview
The checkout flow allows travelers to select a bundle package and proceed to payment/checkout with the selected options.

## Endpoints

### 1. Select Bundle for Checkout
**POST** `/bundles/select`

Select a bundle to proceed to checkout.

**Request:**
```json
{
  "session_id": "user_session_123",
  "bundle_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "quote": {
    "quote_id": "QUOTE-1-1234567890",
    "bundle_id": 1,
    "session_id": "user_session_123",
    "total_price_usd": "759.98",
    "flights": [
      {
        "id": 2,
        "external_id": "FL004",
        "origin": "SFO",
        "destination": "SEA",
        "departure_date": "2024-10-25T00:00:00",
        "return_date": "2024-10-27T00:00:00",
        "price_usd": "199.99",
        "airline": "Alaska Airlines",
        "duration_minutes": 120,
        "stops": 0,
        "is_red_eye": false,
        "deal_score": 35,
        "tags": []
      }
    ],
    "hotels": [
      {
        "id": 3,
        "external_id": "HT003",
        "hotel_name": "City Center Hotel",
        "city": "New York",
        "check_in_date": "2024-10-25T00:00:00",
        "check_out_date": "2024-10-27T00:00:00",
        "price_per_night_usd": "180.00",
        "total_price_usd": "360.00",
        "star_rating": 4,
        "is_refundable": false,
        "pet_friendly": false,
        "breakfast_included": false,
        "near_transit": true,
        "deal_score": 50,
        "tags": []
      }
    ],
    "travelers": 2,
    "travel_dates": {
      "departure_date": "2024-10-25T00:00:00",
      "return_date": "2024-10-27T00:00:00"
    },
    "quote_expires_at": "2024-10-25T12:30:00",
    "checkout_url": "/checkout?quote_id=QUOTE-1-1234567890"
  },
  "message": "Bundle selected successfully"
}
```

### 2. Get Checkout Quote
**GET** `/checkout/quote/{quote_id}`

Retrieve a checkout quote by quote ID.

**Response:**
Same as the `quote` object in the select bundle response.

## Flow

1. **User gets recommendations** via `/chat` endpoint
2. **User selects a bundle** via `/bundles/select` endpoint
3. **System creates a quote** with complete package details
4. **User is redirected** to checkout URL with quote_id
5. **Checkout page retrieves quote** via `/checkout/quote/{quote_id}`
6. **User completes payment** (handled by checkout service)

## Data Model

### SelectedBundle (Database)
- Tracks which bundles users have selected
- Status: pending, processing, completed, cancelled
- Links bundle to session

### CheckoutQuote (API Response)
- Complete package details for checkout
- Includes all flight and hotel information
- Quote expires in 30 minutes
- Contains checkout URL for redirect

## Example Usage

```bash
# 1. Get recommendations
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "user123", "message": "I need a trip from SFO..."}'

# 2. Select bundle (use bundle_id from response)
curl -X POST http://localhost:8000/bundles/select \
  -H "Content-Type: application/json" \
  -d '{"session_id": "user123", "bundle_id": 1}'

# 3. Get quote for checkout page
curl http://localhost:8000/checkout/quote/QUOTE-1-1234567890
```

