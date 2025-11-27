/**
 * US Airports Data
 * Major US airports with codes and city names for dropdowns
 */

export const US_AIRPORTS = [
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta, GA' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles, CA' },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago, IL' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas, TX' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver, CO' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York, NY' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco, CA' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle, WA' },
  { code: 'LAS', name: 'McCarran International Airport', city: 'Las Vegas, NV' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami, FL' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte, NC' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix, AZ' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark, NJ' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston, TX' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando, FL' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis, MN' },
  { code: 'DTW', name: 'Detroit Metropolitan Airport', city: 'Detroit, MI' },
  { code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia, PA' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York, NY' },
  { code: 'BWI', name: 'Baltimore/Washington International Airport', city: 'Baltimore, MD' },
  { code: 'SLC', name: 'Salt Lake City International Airport', city: 'Salt Lake City, UT' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington, DC' },
  { code: 'MDW', name: 'Chicago Midway International Airport', city: 'Chicago, IL' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu, HI' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston, MA' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale, FL' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington, DC' },
  { code: 'SAN', name: 'San Diego International Airport', city: 'San Diego, CA' },
  { code: 'TPA', name: 'Tampa International Airport', city: 'Tampa, FL' },
  { code: 'PDX', name: 'Portland International Airport', city: 'Portland, OR' },
  { code: 'STL', name: 'St. Louis Lambert International Airport', city: 'St. Louis, MO' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston, TX' },
  { code: 'OAK', name: 'Oakland International Airport', city: 'Oakland, CA' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin, TX' },
  { code: 'MCI', name: 'Kansas City International Airport', city: 'Kansas City, MO' },
  { code: 'CLE', name: 'Cleveland Hopkins International Airport', city: 'Cleveland, OH' },
  { code: 'RDU', name: 'Raleigh-Durham International Airport', city: 'Raleigh, NC' },
  { code: 'IND', name: 'Indianapolis International Airport', city: 'Indianapolis, IN' },
  { code: 'CMH', name: 'John Glenn Columbus International Airport', city: 'Columbus, OH' },
  { code: 'BNA', name: 'Nashville International Airport', city: 'Nashville, TN' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans, LA' },
  { code: 'PIT', name: 'Pittsburgh International Airport', city: 'Pittsburgh, PA' },
  { code: 'SJC', name: 'Norman Y. Mineta San Jose International Airport', city: 'San Jose, CA' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Santa Ana, CA' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas, TX' },
  { code: 'BUR', name: 'Hollywood Burbank Airport', city: 'Burbank, CA' },
  { code: 'JAX', name: 'Jacksonville International Airport', city: 'Jacksonville, FL' },
  { code: 'SMF', name: 'Sacramento International Airport', city: 'Sacramento, CA' },
  { code: 'MEM', name: 'Memphis International Airport', city: 'Memphis, TN' },
  { code: 'MKE', name: 'Milwaukee Mitchell International Airport', city: 'Milwaukee, WI' },
  { code: 'RIC', name: 'Richmond International Airport', city: 'Richmond, VA' },
  { code: 'CHS', name: 'Charleston International Airport', city: 'Charleston, SC' },
  { code: 'SAV', name: 'Savannah/Hilton Head International Airport', city: 'Savannah, GA' },
  { code: 'BUF', name: 'Buffalo Niagara International Airport', city: 'Buffalo, NY' },
  { code: 'ALB', name: 'Albany International Airport', city: 'Albany, NY' },
  { code: 'OMA', name: 'Eppley Airfield', city: 'Omaha, NE' },
  { code: 'TUL', name: 'Tulsa International Airport', city: 'Tulsa, OK' },
  { code: 'OKC', name: 'Will Rogers World Airport', city: 'Oklahoma City, OK' },
  { code: 'ABQ', name: 'Albuquerque International Sunport', city: 'Albuquerque, NM' },
  { code: 'BOI', name: 'Boise Airport', city: 'Boise, ID' },
  { code: 'SBA', name: 'Santa Barbara Municipal Airport', city: 'Santa Barbara, CA' },
  { code: 'FAT', name: 'Fresno Yosemite International Airport', city: 'Fresno, CA' },
  { code: 'ONT', name: 'Ontario International Airport', city: 'Ontario, CA' },
  { code: 'LGB', name: 'Long Beach Airport', city: 'Long Beach, CA' }
];

// Helper function to get airport by code
export const getAirportByCode = (code) => {
  return US_AIRPORTS.find(airport => airport.code === code);
};

// Helper function to get airports by city
export const getAirportsByCity = (city) => {
  return US_AIRPORTS.filter(airport => 
    airport.city.toLowerCase().includes(city.toLowerCase())
  );
};

// Helper function to search airports
export const searchAirports = (query) => {
  const lowerQuery = query.toLowerCase();
  return US_AIRPORTS.filter(airport => 
    airport.code.toLowerCase().includes(lowerQuery) ||
    airport.name.toLowerCase().includes(lowerQuery) ||
    airport.city.toLowerCase().includes(lowerQuery)
  );
};

