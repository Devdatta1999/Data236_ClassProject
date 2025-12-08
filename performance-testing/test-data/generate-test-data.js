/**
 * Test Data Generator for Performance Testing
 * Generates CSV files for JMeter with test users, search queries, etc.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'test-data');
const US_AIRPORTS = [
  'JFK', 'LAX', 'ORD', 'DFW', 'DEN', 'SFO', 'SEA', 'LAS', 'MIA', 'PHX',
  'IAH', 'MSP', 'DTW', 'PHL', 'LGA', 'BWI', 'SLC', 'DCA', 'MDW', 'HNL'
];

const US_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
  'San Francisco', 'Columbus', 'Fort Worth', 'Charlotte', 'Seattle', 'Denver',
  'Washington', 'Boston', 'El Paso', 'Detroit', 'Nashville', 'Portland',
  'Memphis', 'Oklahoma City', 'Las Vegas', 'Louisville', 'Baltimore', 'Milwaukee'
];

const US_STATES = [
  'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI',
  'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI'
];

const CAR_TYPES = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Convertible', 'Hatchback'];
const TRANSMISSION_TYPES = ['Automatic', 'Manual'];
const SEAT_TYPES = ['Economy', 'Business', 'First'];

// Generate unique SSN (userId)
function generateSSN(index) {
  const area = String(Math.floor(Math.random() * 900) + 100);
  const group = String(Math.floor(Math.random() * 90) + 10);
  const serial = String(index).padStart(4, '0');
  return `${area}-${group}-${serial}`;
}

// Generate email
function generateEmail(index) {
  const domains = ['test.com', 'example.com', 'demo.com', 'perf.com'];
  const domain = domains[index % domains.length];
  return `user${index}@${domain}`;
}

// Generate phone number
function generatePhone(index) {
  const area = Math.floor(Math.random() * 800) + 200;
  const exchange = Math.floor(Math.random() * 800) + 200;
  const number = String(index % 10000).padStart(4, '0');
  return `(${area}) ${exchange}-${number}`;
}

// Generate test users CSV
function generateUsers(count = 100) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const firstName = `Test${i}`;
    const lastName = `User${i}`;
    const userId = generateSSN(i);
    const email = generateEmail(i);
    const password = 'Test123!@#'; // Same password for all test users
    const phone = generatePhone(i);
    const city = US_CITIES[i % US_CITIES.length];
    const state = US_STATES[i % US_STATES.length];
    const zipCode = String(10000 + (i % 90000));
    const address = `${Math.floor(Math.random() * 9999) + 1} Test Street`;
    
    users.push({
      userId,
      email,
      password,
      firstName,
      lastName,
      phoneNumber: phone,
      address,
      city,
      state,
      zipCode,
      ssn: userId
    });
  }
  
  const csv = [
    'userId,email,password,firstName,lastName,phoneNumber,address,city,state,zipCode,ssn',
    ...users.map(u => Object.values(u).join(','))
  ].join('\n');
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'users.csv'), csv);
  console.log(`Generated ${count} test users in users.csv`);
}

// Generate search queries CSV
function generateSearchQueries(count = 200) {
  const queries = [];
  
  // Flight searches
  for (let i = 0; i < count * 0.4; i++) {
    const departure = US_AIRPORTS[Math.floor(Math.random() * US_AIRPORTS.length)];
    let arrival = US_AIRPORTS[Math.floor(Math.random() * US_AIRPORTS.length)];
    while (arrival === departure) {
      arrival = US_AIRPORTS[Math.floor(Math.random() * US_AIRPORTS.length)];
    }
    
    const departureDate = new Date();
    departureDate.setDate(departureDate.getDate() + Math.floor(Math.random() * 30) + 1);
    const returnDate = new Date(departureDate);
    returnDate.setDate(returnDate.getDate() + Math.floor(Math.random() * 7) + 1);
    
    queries.push({
      type: 'flight',
      departureAirport: departure,
      arrivalAirport: arrival,
      departureDate: departureDate.toISOString().split('T')[0],
      returnDate: returnDate.toISOString().split('T')[0],
      tripType: Math.random() > 0.5 ? 'one-way' : 'round-trip',
      seatType: SEAT_TYPES[Math.floor(Math.random() * SEAT_TYPES.length)],
      numberOfPassengers: Math.floor(Math.random() * 3) + 1
    });
  }
  
  // Hotel searches
  for (let i = 0; i < count * 0.35; i++) {
    const city = US_CITIES[Math.floor(Math.random() * US_CITIES.length)];
    const state = US_STATES[Math.floor(Math.random() * US_STATES.length)];
    
    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + Math.floor(Math.random() * 30) + 1);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + Math.floor(Math.random() * 7) + 1);
    
    queries.push({
      type: 'hotel',
      city,
      state,
      checkInDate: checkIn.toISOString().split('T')[0],
      checkOutDate: checkOut.toISOString().split('T')[0],
      numberOfRooms: Math.floor(Math.random() * 2) + 1,
      numberOfAdults: Math.floor(Math.random() * 3) + 1,
      starRating: Math.floor(Math.random() * 3) + 3
    });
  }
  
  // Car searches
  for (let i = 0; i < count * 0.25; i++) {
    const city = US_CITIES[Math.floor(Math.random() * US_CITIES.length)];
    const state = US_STATES[Math.floor(Math.random() * US_STATES.length)];
    
    const pickup = new Date();
    pickup.setDate(pickup.getDate() + Math.floor(Math.random() * 30) + 1);
    const dropoff = new Date(pickup);
    dropoff.setDate(dropoff.getDate() + Math.floor(Math.random() * 7) + 1);
    
    queries.push({
      type: 'car',
      location: `${city}, ${state}`,
      pickupDate: pickup.toISOString().split('T')[0],
      dropoffDate: dropoff.toISOString().split('T')[0],
      carType: CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)],
      transmissionType: TRANSMISSION_TYPES[Math.floor(Math.random() * TRANSMISSION_TYPES.length)]
    });
  }
  
  // Shuffle queries
  for (let i = queries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queries[i], queries[j]] = [queries[j], queries[i]];
  }
  
  const csv = [
    'type,departureAirport,arrivalAirport,departureDate,returnDate,tripType,seatType,numberOfPassengers,city,state,checkInDate,checkOutDate,numberOfRooms,numberOfAdults,starRating,location,pickupDate,dropoffDate,carType,transmissionType',
    ...queries.map(q => [
      q.type || '',
      q.departureAirport || '',
      q.arrivalAirport || '',
      q.departureDate || '',
      q.returnDate || '',
      q.tripType || '',
      q.seatType || '',
      q.numberOfPassengers || '',
      q.city || '',
      q.state || '',
      q.checkInDate || '',
      q.checkOutDate || '',
      q.numberOfRooms || '',
      q.numberOfAdults || '',
      q.starRating || '',
      q.location || '',
      q.pickupDate || '',
      q.dropoffDate || '',
      q.carType || '',
      q.transmissionType || ''
    ].join(','))
  ].join('\n');
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search-queries.csv'), csv);
  console.log(`Generated ${queries.length} search queries in search-queries.csv`);
}

// Generate card data for payment testing
function generateCardData(count = 50) {
  const cards = [];
  // Only use all 1's for test cards (other test numbers won't work due to Luhn algorithm)
  const testCardNumber = '1111111111111111';
  
  for (let i = 0; i < count; i++) {
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const year = String((new Date().getFullYear() % 100) + Math.floor(Math.random() * 5) + 1);
    const zipCode = String(10000 + (i % 90000));
    
    cards.push({
      cardNumber: testCardNumber,
      cardHolderName: `Test User ${i}`,
      expiryDate: `${month}/${year}`,
      cvv: String(Math.floor(Math.random() * 900) + 100),
      zipCode
    });
  }
  
  const csv = [
    'cardNumber,cardHolderName,expiryDate,cvv,zipCode',
    ...cards.map(c => Object.values(c).join(','))
  ].join('\n');
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'cards.csv'), csv);
  console.log(`Generated ${count} test cards in cards.csv`);
}

// Main execution
function main() {
  console.log('Generating test data...\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  generateUsers(100);
  generateSearchQueries(200);
  generateCardData(50);
  
  console.log('\nTest data generation complete!');
  console.log(`Files created in: ${OUTPUT_DIR}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateUsers, generateSearchQueries, generateCardData };


