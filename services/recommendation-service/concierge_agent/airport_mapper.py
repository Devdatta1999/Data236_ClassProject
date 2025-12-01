"""
Airport code and city name mapping for destination matching.
"""
# Common airport codes and their city names
AIRPORT_TO_CITY = {
    "MIA": "Miami",
    "LAX": "Los Angeles",
    "JFK": "New York",
    "LGA": "New York",
    "EWR": "New York",
    "SEA": "Seattle",
    "ORD": "Chicago",
    "SFO": "San Francisco",
    "DFW": "Dallas",
    "ATL": "Atlanta",
    "DEN": "Denver",
    "LAS": "Las Vegas",
    "PHX": "Phoenix",
    "IAH": "Houston",
    "MCO": "Orlando",
    "BOS": "Boston",
    "DTW": "Detroit",
    "MSP": "Minneapolis",
    "PHL": "Philadelphia",
    "CLT": "Charlotte",
}

# Reverse mapping: city name to airport codes
CITY_TO_AIRPORTS = {}
for code, city in AIRPORT_TO_CITY.items():
    city_lower = city.lower()
    if city_lower not in CITY_TO_AIRPORTS:
        CITY_TO_AIRPORTS[city_lower] = []
    CITY_TO_AIRPORTS[city_lower].append(code)

# Also add common variations
CITY_TO_AIRPORTS["miami"] = ["MIA"]
CITY_TO_AIRPORTS["los angeles"] = ["LAX"]
CITY_TO_AIRPORTS["new york"] = ["JFK", "LGA", "EWR"]
CITY_TO_AIRPORTS["nyc"] = ["JFK", "LGA", "EWR"]
CITY_TO_AIRPORTS["chicago"] = ["ORD"]
CITY_TO_AIRPORTS["san francisco"] = ["SFO"]
CITY_TO_AIRPORTS["sf"] = ["SFO"]


def normalize_destination(destination: str) -> list:
    """
    Normalize destination to possible airport codes.
    
    Args:
        destination: City name or airport code
    
    Returns:
        List of possible airport codes
    """
    if not destination:
        return []
    
    dest_upper = destination.upper().strip()
    dest_lower = destination.lower().strip()
    
    # If it's already an airport code (3 letters), return it
    if len(dest_upper) == 3 and dest_upper.isalpha():
        return [dest_upper]
    
    # Try to find airport codes for the city
    if dest_lower in CITY_TO_AIRPORTS:
        return CITY_TO_AIRPORTS[dest_lower]
    
    # Try partial matches
    for city, codes in CITY_TO_AIRPORTS.items():
        if dest_lower in city or city in dest_lower:
            return codes
    
    # If no match, return empty list (will search without destination filter)
    return []

