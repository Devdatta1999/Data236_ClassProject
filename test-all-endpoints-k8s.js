#!/usr/bin/env node

/**
 * Comprehensive Test Script for Aerive Backend
 * Tests both Kafka events and HTTP endpoints in Kubernetes
 * 
 * Usage: 
 *   node test-all-endpoints-k8s.js
 * 
 * Environment Variables:
 *   KAFKA_BROKERS - Kafka broker URL (default: aerive-kafka-service:9092)
 *   API_GATEWAY_URL - API Gateway URL (default: http://localhost:80)
 *   NAMESPACE - Kubernetes namespace (default: aerive)
 */

const { Kafka } = require('kafkajs');
const axios = require('axios');
const { execSync } = require('child_process');

// Configuration
// Detect if running inside Kubernetes
const isInsideK8s = require('fs').existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

const KAFKA_BROKERS = process.env.KAFKA_BROKERS ? 
  process.env.KAFKA_BROKERS.split(',') : 
  (isInsideK8s ? ['aerive-kafka-service:9092'] : ['localhost:9092']);

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 
  (isInsideK8s ? 'http://aerive-api-gateway:80' : 'http://localhost:8080');
const NAMESPACE = process.env.NAMESPACE || 'aerive';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logTest(name) {
  log(`\n▶ ${name}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Kafka setup
const kafka = new Kafka({
  clientId: 'aerive-test-client',
  brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `test-consumer-${Date.now()}` });

// Store responses by requestId
const responseHandlers = new Map();

// Generate unique request ID
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Wait for response
function waitForResponse(requestId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responseHandlers.delete(requestId);
      reject(new Error(`Timeout waiting for response (${timeout}ms)`));
    }, timeout);

    responseHandlers.set(requestId, (response) => {
      clearTimeout(timer);
      responseHandlers.delete(requestId);
      resolve(response);
    });
  });
}

// Send Kafka event and wait for response
async function sendKafkaEvent(topic, event, responseTopic, timeout = 15000) {
  const requestId = event.requestId || generateRequestId();
  event.requestId = requestId;

  try {
    await producer.send({
      topic,
      messages: [{
        key: requestId,
        value: JSON.stringify(event),
      }],
    });

    const response = await waitForResponse(requestId, timeout);
    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// HTTP request helper
async function httpRequest(method, path, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${API_GATEWAY_URL}${path}`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status,
    };
  }
}

// Setup Kafka response consumer
async function setupKafkaConsumer() {
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
        }
      } catch (error) {
        // Ignore parsing errors
      }
    },
  });

  logSuccess('Kafka consumer ready');
}

// Test results storage
const testResults = {
  kafka: { passed: 0, failed: 0, tests: [] },
  http: { passed: 0, failed: 0, tests: [] },
};

function recordTest(type, name, success, error = null) {
  testResults[type].tests.push({ name, success, error });
  if (success) {
    testResults[type].passed++;
  } else {
    testResults[type].failed++;
  }
}

// ==================== KAFKA TESTS ====================

async function testKafkaUserSignup() {
  logTest('Kafka: User Signup');
  const result = await sendKafkaEvent(
    'user-events',
    {
      eventType: 'user.signup',
      userId: `123-45-${Math.floor(Math.random() * 10000)}`,
      firstName: 'Test',
      lastName: 'User',
      address: '123 Test St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      phoneNumber: '1234567890',
      email: `test${Date.now()}@example.com`,
      password: 'Test123!@#',
    },
    'user-events-response',
    20000
  );

  if (result.success && result.data.success) {
    logSuccess('User signup successful');
    recordTest('kafka', 'User Signup', true);
    return result.data.data;
  } else {
    logError(`User signup failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'User Signup', false, result.error || result.data?.error?.message);
    return null;
  }
}

async function testKafkaUserLogin(email, password) {
  logTest('Kafka: User Login');
  const result = await sendKafkaEvent(
    'user-events',
    {
      eventType: 'user.login',
      email: email,
      password: password,
    },
    'user-events-response',
    15000
  );

  if (result.success && result.data.success) {
    logSuccess('User login successful');
    recordTest('kafka', 'User Login', true);
    return result.data.data;
  } else {
    logError(`User login failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'User Login', false, result.error || result.data?.error?.message);
    return null;
  }
}

async function testKafkaFlightSearch() {
  logTest('Kafka: Flight Search');
  const result = await sendKafkaEvent(
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
    'search-events-response',
    15000
  );

  if (result.success && result.data.success) {
    logSuccess(`Flight search successful (found ${result.data.data?.count || 0} flights)`);
    recordTest('kafka', 'Flight Search', true);
    return result.data.data;
  } else {
    logError(`Flight search failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'Flight Search', false, result.error || result.data?.error?.message);
    return null;
  }
}

async function testKafkaHotelSearch() {
  logTest('Kafka: Hotel Search');
  const result = await sendKafkaEvent(
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
    'search-events-response',
    15000
  );

  if (result.success && result.data.success) {
    logSuccess(`Hotel search successful (found ${result.data.data?.count || 0} hotels)`);
    recordTest('kafka', 'Hotel Search', true);
    return result.data.data;
  } else {
    logError(`Hotel search failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'Hotel Search', false, result.error || result.data?.error?.message);
    return null;
  }
}

async function testKafkaCarSearch() {
  logTest('Kafka: Car Search');
  const result = await sendKafkaEvent(
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
    'search-events-response',
    15000
  );

  if (result.success && result.data.success) {
    logSuccess(`Car search successful (found ${result.data.data?.count || 0} cars)`);
    recordTest('kafka', 'Car Search', true);
    return result.data.data;
  } else {
    logError(`Car search failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'Car Search', false, result.error || result.data?.error?.message);
    return null;
  }
}

async function testKafkaBookingCreate(userId, listingId, listingType) {
  logTest('Kafka: Booking Create');
  const result = await sendKafkaEvent(
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
    'booking-events-response',
    20000
  );

  if (result.success && result.data.success) {
    logSuccess('Booking creation successful');
    recordTest('kafka', 'Booking Create', true);
    return result.data.data;
  } else {
    logError(`Booking creation failed: ${result.error || result.data?.error?.message}`);
    recordTest('kafka', 'Booking Create', false, result.error || result.data?.error?.message);
    return null;
  }
}

// ==================== HTTP TESTS ====================

async function testHttpHealthCheck() {
  logTest('HTTP: Health Check');
  const result = await httpRequest('GET', '/health');
  if (result.success) {
    logSuccess('Health check passed');
    recordTest('http', 'Health Check', true);
    return true;
  } else {
    logError(`Health check failed: ${result.error}`);
    recordTest('http', 'Health Check', false, result.error);
    return false;
  }
}

async function testHttpGetUser(userId, token) {
  logTest('HTTP: Get User');
  const result = await httpRequest('GET', `/api/users/${userId}`, null, token);
  if (result.success) {
    logSuccess('Get user successful');
    recordTest('http', 'Get User', true);
    return result.data;
  } else {
    logError(`Get user failed: ${result.error}`);
    recordTest('http', 'Get User', false, result.error);
    return null;
  }
}

async function testHttpUpdateUser(userId, token) {
  logTest('HTTP: Update User');
  const result = await httpRequest('PUT', `/api/users/${userId}`, {
    firstName: 'Updated',
    phone: '9876543210',
  }, token);
  if (result.success) {
    logSuccess('Update user successful');
    recordTest('http', 'Update User', true);
    return result.data;
  } else {
    logError(`Update user failed: ${result.error}`);
    recordTest('http', 'Update User', false, result.error);
    return null;
  }
}

async function testHttpGetFlight(flightId) {
  logTest('HTTP: Get Flight');
  const result = await httpRequest('GET', `/api/listings/flights/${flightId}`);
  if (result.success) {
    logSuccess('Get flight successful');
    recordTest('http', 'Get Flight', true);
    return result.data;
  } else {
    logWarning(`Get flight failed (may not exist): ${result.error}`);
    recordTest('http', 'Get Flight', false, result.error);
    return null;
  }
}

async function testHttpProviderRegister() {
  logTest('HTTP: Provider Register');
  const result = await httpRequest('POST', '/api/providers/register', {
    email: `provider${Date.now()}@example.com`,
    password: 'Provider123!@#',
    companyName: 'Test Airlines',
    contactName: 'Jane Provider',
    phone: '5551234567',
    address: {
      street: '456 Provider St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
    },
  });
  if (result.success) {
    logSuccess('Provider registration successful');
    recordTest('http', 'Provider Register', true);
    return result.data;
  } else {
    logError(`Provider registration failed: ${result.error}`);
    recordTest('http', 'Provider Register', false, result.error);
    return null;
  }
}

async function testHttpAdminLogin() {
  logTest('HTTP: Admin Login');
  const result = await httpRequest('POST', '/api/admin/login', {
    email: 'admin@aerive.com',
    password: 'Admin123!@#',
  });
  if (result.success && result.data.token) {
    logSuccess('Admin login successful');
    recordTest('http', 'Admin Login', true);
    return result.data;
  } else {
    logWarning(`Admin login failed (may need to create admin first): ${result.error}`);
    recordTest('http', 'Admin Login', false, result.error);
    return null;
  }
}

async function testHttpGetUserBookings(userId, token) {
  logTest('HTTP: Get User Bookings');
  const result = await httpRequest('GET', `/api/users/${userId}/bookings`, null, token);
  if (result.success) {
    logSuccess('Get user bookings successful');
    recordTest('http', 'Get User Bookings', true);
    return result.data;
  } else {
    logError(`Get user bookings failed: ${result.error}`);
    recordTest('http', 'Get User Bookings', false, result.error);
    return null;
  }
}

// ==================== MAIN TEST RUNNER ====================

async function runAllTests() {
  logSection('Aerive Backend Comprehensive Test Suite');
  log(`Environment: ${isInsideK8s ? 'Kubernetes Cluster' : 'Local Machine'}`, 'blue');
  log(`Kafka Brokers: ${KAFKA_BROKERS.join(', ')}`, 'blue');
  log(`API Gateway: ${API_GATEWAY_URL}`, 'blue');
  log(`Namespace: ${NAMESPACE}`, 'blue');
  if (!isInsideK8s) {
    log(`\nNote: Ensure port-forwards are running:`, 'yellow');
    log(`  kubectl port-forward -n ${NAMESPACE} service/aerive-api-gateway 8080:80`, 'yellow');
    log(`  kubectl port-forward -n ${NAMESPACE} service/aerive-kafka-service 9092:9092`, 'yellow');
  }

  try {
    // Setup Kafka
    logSection('Setting up Kafka connection');
    await producer.connect();
    logSuccess('Kafka producer connected');
    await setupKafkaConsumer();

    // Test Kafka Events
    logSection('Testing Kafka Events');
    
    const signupData = await testKafkaUserSignup();
    if (!signupData) {
      logError('Cannot continue without user signup');
      return;
    }

    const userEmail = signupData.user?.email;
    const userId = signupData.user?.userId;
    const userToken = signupData.token;

    await testKafkaUserLogin(userEmail, 'Test123!@#');
    
    const flightSearchData = await testKafkaFlightSearch();
    const hotelSearchData = await testKafkaHotelSearch();
    const carSearchData = await testKafkaCarSearch();

    // Test booking if we have flight data
    if (flightSearchData?.flights?.length > 0) {
      const flightId = flightSearchData.flights[0].flightId;
      await testKafkaBookingCreate(userId, flightId, 'flight');
    }

    // Test HTTP Endpoints
    logSection('Testing HTTP Endpoints');
    
    await testHttpHealthCheck();
    await testHttpGetUser(userId, userToken);
    await testHttpUpdateUser(userId, userToken);
    await testHttpGetUserBookings(userId, userToken);
    
    if (flightSearchData?.flights?.length > 0) {
      await testHttpGetFlight(flightSearchData.flights[0].flightId);
    }
    
    await testHttpProviderRegister();
    await testHttpAdminLogin();

    // Print Summary
    logSection('Test Summary');
    
    log('\nKafka Tests:', 'bright');
    log(`  Passed: ${testResults.kafka.passed}`, 'green');
    log(`  Failed: ${testResults.kafka.failed}`, 'red');
    
    log('\nHTTP Tests:', 'bright');
    log(`  Passed: ${testResults.http.passed}`, 'green');
    log(`  Failed: ${testResults.http.failed}`, 'red');
    
    const totalPassed = testResults.kafka.passed + testResults.http.passed;
    const totalFailed = testResults.kafka.failed + testResults.http.failed;
    const total = totalPassed + totalFailed;
    
    log(`\nTotal: ${totalPassed}/${total} passed`, totalFailed === 0 ? 'green' : 'yellow');
    
    if (totalFailed > 0) {
      log('\nFailed Tests:', 'red');
      [...testResults.kafka.tests, ...testResults.http.tests]
        .filter(t => !t.success)
        .forEach(t => {
          log(`  - ${t.name}: ${t.error}`, 'red');
        });
    }

  } catch (error) {
    logError(`Test suite error: ${error.message}`);
    console.error(error);
  } finally {
    // Cleanup
    try {
      await producer.disconnect();
      await consumer.disconnect();
      logSuccess('Disconnected from Kafka');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Check dependencies
function checkDependencies() {
  try {
    require('kafkajs');
    require('axios');
    return true;
  } catch (error) {
    logError('Missing dependencies. Installing...');
    try {
      execSync('npm install kafkajs axios', { stdio: 'inherit' });
      logSuccess('Dependencies installed');
      return true;
    } catch (installError) {
      logError('Failed to install dependencies');
      return false;
    }
  }
}

// Main execution
if (require.main === module) {
  if (checkDependencies()) {
    runAllTests().catch(console.error);
  } else {
    process.exit(1);
  }
}

module.exports = { runAllTests };

