/**
 * Kafka Event Producer Test Script
 * Tests all Kafka events for frontend-backend communication
 * 
 * Usage: node test-kafka-events.js
 */

const { Kafka } = require('kafkajs');
const readline = require('readline');

const KAFKA_BROKERS = process.env.KAFKA_BROKERS ? 
  process.env.KAFKA_BROKERS.split(',') : 
  ['localhost:9092'];

const kafka = new Kafka({
  clientId: 'aerive-test-client',
  brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-response-consumer' });

// Store responses by requestId
const responseHandlers = new Map();

// Generate unique request ID
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Wait for response
function waitForResponse(requestId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responseHandlers.delete(requestId);
      reject(new Error('Timeout waiting for response'));
    }, timeout);

    responseHandlers.set(requestId, (response) => {
      clearTimeout(timer);
      responseHandlers.delete(requestId);
      resolve(response);
    });
  });
}

// Send event and wait for response
async function sendEventAndWait(topic, event, responseTopic, timeout = 10000) {
  const requestId = event.requestId || generateRequestId();
  event.requestId = requestId;

  console.log(`\n📤 Sending event to ${topic}:`);
  console.log(JSON.stringify(event, null, 2));

  await producer.send({
    topic,
    messages: [{
      key: requestId,
      value: JSON.stringify(event),
    }],
  });

  console.log(`⏳ Waiting for response on ${responseTopic}...`);

  try {
    const response = await waitForResponse(requestId, timeout);
    console.log(`\n✅ Response received:`);
    console.log(JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    return null;
  }
}

// Test functions
async function testUserSignup() {
  console.log('\n=== Testing User Signup ===');
  // Generate valid SSN format: XXX-XX-XXXX
  const ssnPart1 = String(Math.floor(Math.random() * 900) + 100); // 100-999
  const ssnPart2 = String(Math.floor(Math.random() * 90) + 10);   // 10-99
  const ssnPart3 = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); // 0000-9999
  const userId = `${ssnPart1}-${ssnPart2}-${ssnPart3}`;
  
  return await sendEventAndWait(
    'user-events',
    {
      eventType: 'user.signup',
      userId: userId,
      firstName: 'John',
      lastName: 'Doe',
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      phoneNumber: '1234567890',
      email: `test${Date.now()}@example.com`,
      password: 'Test123!@#',
    },
    'user-events-response'
  );
}

async function testUserLogin(email) {
  console.log('\n=== Testing User Login ===');
  return await sendEventAndWait(
    'user-events',
    {
      eventType: 'user.login',
      email: email,
      password: 'Test123!@#',
    },
    'user-events-response'
  );
}

async function testFlightSearch() {
  console.log('\n=== Testing Flight Search ===');
  return await sendEventAndWait(
    'search-events',
    {
      eventType: 'search.flights',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDate: '2024-12-25',
      minPrice: 100,
      maxPrice: 500,
      flightClass: 'Economy',
      sortBy: 'departureDateTime',
    },
    'search-events-response'
  );
}

async function testHotelSearch() {
  console.log('\n=== Testing Hotel Search ===');
  return await sendEventAndWait(
    'search-events',
    {
      eventType: 'search.hotels',
      city: 'San Francisco',
      state: 'CA',
      checkIn: '2024-12-01',
      checkOut: '2024-12-03',
      guests: 2,
      minPrice: 100,
      maxPrice: 300,
    },
    'search-events-response'
  );
}

async function testCarSearch() {
  console.log('\n=== Testing Car Search ===');
  return await sendEventAndWait(
    'search-events',
    {
      eventType: 'search.cars',
      location: 'San Francisco',
      pickupDate: '2024-12-01',
      returnDate: '2024-12-03',
      carType: 'Sedan',
      minPrice: 30,
      maxPrice: 100,
    },
    'search-events-response'
  );
}

async function testBookingCreate(userId, listingId, listingType) {
  console.log('\n=== Testing Booking Create ===');
  return await sendEventAndWait(
    'booking-events',
    {
      eventType: 'booking.create',
      userId: userId,
      listingType: listingType,
      listingId: listingId,
      bookingDate: new Date().toISOString(),
      passengers: 1,
      totalPrice: 299.99,
    },
    'booking-events-response'
  );
}

async function testCheckoutInitiate(userId, cartItems) {
  console.log('\n=== Testing Checkout Initiate ===');
  return await sendEventAndWait(
    'checkout-events',
    {
      eventType: 'checkout.initiate',
      userId: userId,
      cartItems: cartItems,
    },
    'checkout-events-response',
    30000 // Longer timeout for checkout
  );
}

async function testPaymentComplete(userId, bookingIds, amount) {
  console.log('\n=== Testing Payment Complete ===');
  return await sendEventAndWait(
    'payment-events',
    {
      eventType: 'payment.complete',
      userId: userId,
      bookingIds: bookingIds,
      amount: amount,
      paymentMethod: {
        type: 'credit_card',
        cardNumber: '4111111111111111',
        expiryDate: '12/25',
        cvv: '123',
        cardholderName: 'John Doe',
      },
      billingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94102',
        country: 'USA',
      },
    },
    'payment-events-response',
    30000 // Longer timeout for payment
  );
}

// Setup response consumer
async function setupResponseConsumer() {
  await consumer.connect();
  
  const responseTopics = [
    'user-events-response',
    'search-events-response',
    'booking-events-response',
    'checkout-events-response',
    'payment-events-response',
  ];

  for (const topic of responseTopics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const response = JSON.parse(message.value.toString());
        const requestId = response.requestId;

        if (responseHandlers.has(requestId)) {
          responseHandlers.get(requestId)(response);
        } else {
          console.log(`\n📥 Received response for ${requestId} (no handler):`);
          console.log(JSON.stringify(response, null, 2));
        }
      } catch (error) {
        console.error('Error processing response:', error);
      }
    },
  });

  console.log('✅ Response consumer ready');
}

// Main test function
async function runTests() {
  try {
    console.log('🚀 Starting Kafka Event Tests');
    console.log(`📡 Connecting to Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);

    await producer.connect();
    console.log('✅ Producer connected');

    await setupResponseConsumer();

    // Test user signup
    const signupResponse = await testUserSignup();
    if (!signupResponse || !signupResponse.success) {
      console.error('❌ User signup failed');
      return;
    }

    const userEmail = signupResponse.data?.user?.email;
    const userId = signupResponse.data?.user?.userId;
    const token = signupResponse.data?.token;

    console.log(`\n✅ User created: ${userId}, Email: ${userEmail}`);

    // Test user login
    await testUserLogin(userEmail);

    // Test searches
    const flightSearchResponse = await testFlightSearch();
    const hotelSearchResponse = await testHotelSearch();
    const carSearchResponse = await testCarSearch();

    // If we have flight results, test booking
    if (flightSearchResponse?.success && flightSearchResponse.data?.flights?.length > 0) {
      const flightId = flightSearchResponse.data.flights[0].flightId;
      const bookingResponse = await testBookingCreate(userId, flightId, 'flight');
      
      if (bookingResponse?.success && bookingResponse.data?.booking?.bookingId) {
        const bookingId = bookingResponse.data.booking.bookingId;
        
        // Test checkout with the booking
        await testCheckoutInitiate(userId, [
          {
            listingType: 'flight',
            listingId: flightId,
            bookingId: bookingId,
            price: 299.99,
          },
        ]);

        // Test payment
        await testPaymentComplete(userId, [bookingId], 299.99);
      }
    }

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await producer.disconnect();
    await consumer.disconnect();
    console.log('\n👋 Disconnected from Kafka');
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testUserSignup,
  testUserLogin,
  testFlightSearch,
  testHotelSearch,
  testCarSearch,
  testBookingCreate,
  testCheckoutInitiate,
  testPaymentComplete,
};

