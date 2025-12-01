# Frontend Test Queries - Verified to Work

All queries use **October 25-27, 2024** which has both flights AND hotels in the database.

## ✅ Basic Queries (Will Return Bundles)

### 1. SFO → Los Angeles (Basic)
```
I need a trip from SFO to Los Angeles on October 25-27, 2024, budget $1200 for 2 people
```
**Expected**: 1 bundle at ~$899.98
- Flight: SFO → LAX ($299.99)
- Hotel: Grand Hotel in Los Angeles ($300 for 2 nights)

### 2. SFO → Miami (Pet-friendly)
```
I want a trip from SFO to Miami on October 25-27, budget $1500 for 2 people, pet-friendly
```
**Expected**: 1 bundle at ~$1160.00
- Flight: SFO → MIA ($380)
- Hotel: Beach Resort in Miami ($400 for 2 nights, pet-friendly ✅)

### 3. SFO → Seattle (Pet-friendly + Breakfast)
```
Find me a trip from SFO to Seattle, October 25-27, budget $1000 for 2 people, pet-friendly, breakfast included
```
**Expected**: 1 bundle at ~$639.98
- Flight: SFO → SEA ($199.99)
- Hotel: Boutique Inn in Seattle ($240 for 2 nights, pet-friendly ✅, breakfast ✅)

### 4. SFO → Chicago (Breakfast)
```
I need a trip from SFO to Chicago on October 25-27, budget $1500 for 2 people, breakfast included
```
**Expected**: 1 bundle at ~$1280.00
- Flight: SFO → ORD ($420)
- Hotel: Luxury Suites in Chicago ($440 for 2 nights, breakfast ✅)

### 5. SFO → New York (Basic)
```
I want a trip from SFO to New York on October 25-27, budget $1200 for 2 people
```
**Expected**: 1 bundle at ~$1120.00
- Flight: SFO → JFK ($450)
- Hotel: City Center Hotel in New York ($360 for 2 nights)

### 6. SFO → Los Angeles (Single Traveler)
```
I need a trip from SFO to Los Angeles on October 25-27, budget $700 for 1 person
```
**Expected**: 1 bundle at ~$599.99
- Flight: SFO → LAX ($299.99 for 1 person)
- Hotel: Grand Hotel ($300 for 2 nights)

## 🔄 Refinement Queries (Test Memory)

Use these **after** Query 1 above:

### 7. Add Constraint (Will Return 0)
```
Make it pet-friendly
```
**Expected**: 0 bundles (LA hotel is not pet-friendly)

### 8. Change Destination (Will Return 1)
```
I want to go to Miami instead
```
**Expected**: 1 bundle (Miami has pet-friendly hotel)

### 9. Change Budget
```
Increase my budget to $1500
```
**Expected**: 1 bundle (same bundle, higher budget allows it)

### 10. Add Breakfast
```
Also include breakfast
```
**Expected**: 1 bundle (if current hotel has breakfast) or 0 (if not)

## 📝 Alternative Date Formats

The agent understands various date formats:

```
October 25-27, 2024
Oct 25-27, 2024
2024-10-25 to 2024-10-27
October 25 to October 27, 2024
```

## ⚠️ Queries That Will Return 0 (No Data)

These queries will correctly return 0 bundles because data doesn't exist:

```
I need a trip from SFO to Los Angeles on November 23-28, 2024, budget $900 for 2 people
```
**Expected**: 0 bundles (no flights/hotels on these dates)

```
I want a trip from JFK to Seattle, January 1-3, 2024, budget $600 for 1 person
```
**Expected**: 0 bundles (has flights but no hotels on Jan 1-3)

## 🎯 Quick Test Sequence

1. **Start**: Query 1 (SFO → LA) → Should get 1 bundle
2. **Refine**: Query 7 (pet-friendly) → Should get 0 bundles
3. **Change**: Query 8 (Miami) → Should get 1 bundle
4. **Adjust**: Query 9 (budget) → Should get 1 bundle

This tests:
- ✅ Basic bundle creation
- ✅ Constraint filtering
- ✅ Memory/context preservation
- ✅ Destination change
- ✅ Budget adjustment

## 💡 Tips

- All working queries use **October 25-27, 2024**
- Budget should be at least **$600-1500** depending on route
- Pet-friendly works for: **Miami** and **Seattle**
- Breakfast works for: **Los Angeles, Miami, Seattle, Chicago**
- Use **2 people** for most queries (better price per person)

