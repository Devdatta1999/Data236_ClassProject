/**
 * Kafka Proxy Service
 * 
 * Acts as a bridge between frontend (HTTP) and Kafka
 * Frontend sends HTTP requests, this service publishes to Kafka
 * This service subscribes to response topics and returns responses to frontend
 * 
 * Enhanced with automatic reconnection, retry logic, and robust error handling
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Kafka } = require('kafkajs');

const app = express();
const PORT = process.env.PORT || 3007;

// Kafka configuration - enhanced for reliability
const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];

const kafka = new Kafka({
  clientId: 'kafka-proxy',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 8, // Increased retries for better reliability
    maxRetryTime: 30000, // Max 30 second retry delay
    multiplier: 2,
    restartOnFailure: async () => true
  },
  requestTimeout: 30000, // 30 second request timeout (increased from 5s)
  connectionTimeout: 10000 // 10 second connection timeout (increased from 3s)
});

let producer = null;
let isProducerConnected = false;
let producerReconnectAttempts = 0;
const MAX_PRODUCER_RECONNECT_ATTEMPTS = 10;

// In-memory map of pending requests: requestId -> { resolve, reject, timeoutId, timestamp }
const pendingRequests = new Map();

// Single long-lived consumer for all response topics
let responseConsumer = null;
let consumerReady = false;
let consumerReconnectAttempts = 0;
const MAX_CONSUMER_RECONNECT_ATTEMPTS = 10;
let consumerReconnectTimeout = null;
let consumerHealthCheckInterval = null;
let isInitializingConsumer = false; // Guard to prevent multiple simultaneous initializations
let consumerRunCalled = false; // Track if run() has been called to prevent multiple calls

// Middleware
app.use(cors());
app.use(express.json());

// Health check with connection status
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    service: 'kafka-proxy',
    timestamp: new Date().toISOString(),
    producer: {
      connected: isProducerConnected,
      status: isProducerConnected ? 'connected' : 'disconnected'
    },
    consumer: {
      connected: consumerReady,
      status: consumerReady ? 'connected' : 'disconnected'
    },
    pendingRequests: pendingRequests.size
  };
  
  // Return 503 if critical connections are down
  if (!isProducerConnected || !consumerReady) {
    return res.status(503).json({ ...health, status: 'degraded' });
  }
  
  res.json(health);
});

/**
 * Initialize or reconnect producer with automatic retry
 */
async function initProducer(retryAttempt = 0) {
  // If producer is already connected, return it
  if (producer && isProducerConnected) {
    return producer;
  }

  try {
    // Disconnect existing producer if any
    if (producer) {
      try {
        await producer.disconnect().catch(() => {});
      } catch (e) {
        // Ignore disconnect errors
      }
      producer = null;
      isProducerConnected = false;
    }

    // Create new producer
    producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: false,
      transactionTimeout: 30000,
      retry: {
        retries: 5,
        initialRetryTime: 100,
        maxRetryTime: 30000
      }
    });

    await producer.connect();
    isProducerConnected = true;
    producerReconnectAttempts = 0; // Reset on successful connection
    console.log('Kafka producer connected successfully');
    return producer;
  } catch (error) {
    console.error(`Failed to connect Kafka producer (attempt ${retryAttempt + 1}):`, error.message);
    isProducerConnected = false;
    producer = null;
    
    // Retry with exponential backoff
    if (retryAttempt < MAX_PRODUCER_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, retryAttempt), 30000);
      console.log(`Retrying producer connection in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return initProducer(retryAttempt + 1);
    }
    
    throw new Error(`Failed to connect producer after ${MAX_PRODUCER_RECONNECT_ATTEMPTS} attempts: ${error.message}`);
  }
}

/**
 * Send message with retry logic and automatic reconnection
 */
async function sendMessageWithRetry(topic, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const producerInstance = await initProducer();
      await producerInstance.send({
        topic,
        messages: [{
          key: message.key || null,
          value: JSON.stringify(message.value || message),
        }],
      });
      return; // Success
    } catch (error) {
      console.error(`Error sending message to ${topic} (attempt ${attempt}/${retries}):`, error.message);
      
      // Mark producer as disconnected
      isProducerConnected = false;
      
      if (attempt === retries) {
        throw error; // Last attempt failed
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
    }
  }
}

/**
 * Initialize or reconnect consumer with automatic retry
 */
async function initResponseConsumer(retryAttempt = 0) {
  // If consumer is already connected and ready, return
  if (responseConsumer && consumerReady) {
    // Verify it's still running
    try {
      if (responseConsumer.isRunning && responseConsumer.isRunning()) {
        return responseConsumer;
      }
    } catch (e) {
      // Consumer is not running, reconnect
      consumerReady = false;
      responseConsumer = null;
    }
  }
  
  // Prevent multiple simultaneous initialization attempts
  if (isInitializingConsumer) {
    // Wait for existing initialization to complete
    let waitCount = 0;
    while (isInitializingConsumer && waitCount < 30) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitCount++;
      if (consumerReady && responseConsumer) {
        return responseConsumer;
      }
    }
  }
  
  if (isInitializingConsumer) {
    throw new Error('Consumer initialization timeout');
  }
  
  isInitializingConsumer = true;

  try {
    // Clean up existing consumer if any
    if (responseConsumer) {
      try {
        await responseConsumer.disconnect().catch(() => {});
      } catch (e) {
        // Ignore disconnect errors
      }
      responseConsumer = null;
      consumerReady = false;
      consumerRunCalled = false; // Reset flag when disconnecting
    }

    // Use unique consumer group per pod so each pod consumes all messages
    // For single replica, use a fixed group ID to avoid rebalancing issues
    const podName = process.env.HOSTNAME || `kafka-proxy-${Date.now()}`;
    const uniqueGroupId = `kafka-proxy-response-${podName}`;
    
    responseConsumer = kafka.consumer({ 
      groupId: uniqueGroupId,
      sessionTimeout: 60000, // Increased to 60s for better stability
      heartbeatInterval: 3000, // Heartbeat every 3s (must be < sessionTimeout/3)
      maxBytesPerPartition: 1048576,
      minBytes: 1,
      maxBytes: 10485760,
      maxWaitTimeInMs: 500, // Poll every 500ms
      retry: {
        retries: 8,
        initialRetryTime: 100,
        maxRetryTime: 30000
      },
      allowAutoTopicCreation: true
    });

    await responseConsumer.connect();
    console.log('Response consumer connected');

    // Subscribe to all response topics we might need
    const responseTopics = [
      'user-events-response',
      'search-events-response',
      'booking-events-response',
      'checkout-events-response',
      'payment-events-response'
    ];

    await responseConsumer.subscribe({ 
      topics: responseTopics,
      fromBeginning: false 
    });

    console.log(`Subscribed to response topics: ${responseTopics.join(', ')}`);

    // CRITICAL: Prevent multiple run() calls - this causes rebalancing loops
    if (consumerRunCalled) {
      console.log('Consumer run() already called, skipping to prevent rebalancing');
      consumerReady = true;
      return responseConsumer;
    }

    // CRITICAL: Check if consumer is already running
    try {
      if (responseConsumer.isRunning && responseConsumer.isRunning()) {
        console.log('Consumer is already running, skipping run() to prevent rebalancing');
        consumerRunCalled = true; // Mark as called
        consumerReady = true;
        return responseConsumer;
      }
    } catch (e) {
      // isRunning() might throw, ignore and continue
    }

    // Mark that we're about to call run() to prevent duplicate calls
    consumerRunCalled = true;

    // Start consuming messages (only once)
    await responseConsumer.run({
      autoCommit: true,
      autoCommitInterval: 5000, // Commit every 5 seconds
      autoCommitThreshold: 1,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const response = JSON.parse(message.value.toString());
          const requestId = response.requestId;

          if (!requestId) {
            console.warn(`Received message without requestId on topic ${topic}`);
            return;
          }

          // Look up the pending request
          const pending = pendingRequests.get(requestId);

          if (pending) {
            console.log(`Found pending request for requestId: ${requestId}`);
            
            // Clear the timeout
            clearTimeout(pending.timeoutId);
            
            // Remove from pending map
            pendingRequests.delete(requestId);

            // Resolve or reject the promise
            if (response.success) {
              // Return the data object which contains { user, token } etc.
              const responseData = response.data || response;
              console.log(`Resolving request ${requestId} with data:`, JSON.stringify(responseData).substring(0, 200));
              pending.resolve(responseData);
            } else {
              // Handle error response
              let errorMsg = 'Request failed';
              if (response.error) {
                if (typeof response.error === 'string') {
                  errorMsg = response.error;
                } else if (response.error.message) {
                  errorMsg = response.error.message;
                } else if (response.error.code) {
                  errorMsg = `${response.error.code}: ${response.error.message || 'Unknown error'}`;
                }
              }
              console.log(`Rejecting request ${requestId} with error:`, errorMsg);
              pending.reject(new Error(errorMsg));
            }
          } else {
            console.warn(`Received response for unknown requestId: ${requestId} on topic ${topic}`);
          }
        } catch (error) {
          console.error('Error processing response message:', error);
          // Don't crash - continue processing other messages
        }
      },
    });

    consumerReady = true;
    consumerReconnectAttempts = 0; // Reset on successful connection
    isInitializingConsumer = false; // Clear initialization flag
    console.log('Response consumer ready and consuming messages (run() called once)');
    
    // Start health check interval
    startConsumerHealthCheck();
    
    return responseConsumer;
  } catch (error) {
    console.error(`Failed to initialize response consumer (attempt ${retryAttempt + 1}):`, error.message);
    consumerReady = false;
    responseConsumer = null;
    isInitializingConsumer = false; // Clear flag on error
    
    // Retry with exponential backoff
    if (retryAttempt < MAX_CONSUMER_RECONNECT_ATTEMPTS) {
      scheduleConsumerReconnect();
    }
    
    throw error;
  }
}

/**
 * Schedule consumer reconnection
 */
function scheduleConsumerReconnect() {
  if (consumerReconnectTimeout) {
    clearTimeout(consumerReconnectTimeout);
  }

  if (consumerReconnectAttempts >= MAX_CONSUMER_RECONNECT_ATTEMPTS) {
    console.error(`Kafka consumer exceeded max reconnection attempts (${MAX_CONSUMER_RECONNECT_ATTEMPTS}). Stopping reconnection.`);
    return;
  }

  consumerReconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, consumerReconnectAttempts - 1), 30000);
  
  console.warn(`Scheduling consumer reconnect in ${delay}ms (attempt ${consumerReconnectAttempts}/${MAX_CONSUMER_RECONNECT_ATTEMPTS})`);
  
  consumerReconnectTimeout = setTimeout(async () => {
    try {
      console.log('Attempting to reconnect Kafka consumer...');
      await initResponseConsumer();
    } catch (error) {
      console.error(`Consumer reconnection attempt failed:`, error.message);
      scheduleConsumerReconnect(); // Try again
    }
  }, delay);
}

/**
 * Start periodic health check for consumer
 * DISABLED: The isRunning() check is unreliable and causes unnecessary reconnects
 * KafkaJS handles reconnection automatically on errors
 */
function startConsumerHealthCheck() {
  // Health check disabled - KafkaJS handles reconnection automatically
  // Only reconnect on actual errors, not based on isRunning() status
  if (consumerHealthCheckInterval) {
    clearInterval(consumerHealthCheckInterval);
  }

  // Minimal health check - only verify consumer exists, don't check isRunning()
  consumerHealthCheckInterval = setInterval(() => {
    try {
      // Only check if consumer is null, not if it's "running"
      // KafkaJS will automatically reconnect on connection errors
      if (!responseConsumer && !consumerReady && consumerReconnectAttempts < MAX_CONSUMER_RECONNECT_ATTEMPTS) {
        console.warn('Consumer is null, scheduling reconnect...');
        scheduleConsumerReconnect();
      }
      // Don't check isRunning() - it's unreliable and causes false positives
    } catch (error) {
      console.error('Consumer health check failed:', error.message);
      // Only reconnect on actual errors, not on isRunning() false positives
    }
  }, 30000); // Check every 30 seconds (less aggressive)
}

// Cleanup pending requests that have timed out
function cleanupPendingRequests() {
  const now = Date.now();
  const maxAge = 60000; // 60 seconds

  for (const [requestId, pending] of pendingRequests.entries()) {
    if (now - pending.timestamp > maxAge) {
      console.warn(`Cleaning up stale pending request: ${requestId}`);
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(requestId);
      pending.reject(new Error('Request cleanup: timeout'));
    }
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupPendingRequests, 30000);

// Send event to Kafka and wait for response
app.post('/api/kafka/send', async (req, res) => {
  try {
    const { topic, event, responseTopic, timeout = 30000 } = req.body;

    if (!topic || !event) {
      return res.status(400).json({ 
        error: 'Missing required fields: topic and event' 
      });
    }

    // Ensure producer is connected (with automatic retry)
    try {
      await initProducer();
    } catch (error) {
      console.error('Failed to initialize producer:', error);
      return res.status(503).json({ 
        error: `Kafka producer unavailable: ${error.message}` 
      });
    }

    // If responseTopic is provided, ensure consumer is ready (with automatic retry)
    if (responseTopic) {
      try {
        // Only initialize if not already ready to prevent multiple initializations
        if (!consumerReady || !responseConsumer) {
        await initResponseConsumer();
        }
        if (!consumerReady) {
          throw new Error('Response consumer is not ready');
        }
      } catch (error) {
        console.error('Failed to initialize consumer:', error);
        return res.status(503).json({ 
          error: `Kafka consumer unavailable: ${error.message}` 
        });
      }
    }

    // Generate requestId if not provided
    const requestId = event.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      ...event,
      requestId,
    };

    // If responseTopic is provided, set up promise to wait for response
    let responsePromise;
    if (responseTopic) {
      responsePromise = new Promise((resolve, reject) => {
        // Add buffer for network latency in EKS
        const timeoutWithBuffer = timeout + 10000; // Add 10s buffer
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Response timeout after ${timeoutWithBuffer}ms`));
        }, timeoutWithBuffer);

        pendingRequests.set(requestId, {
          resolve,
          reject,
          timeoutId,
          timestamp: Date.now()
        });
      });
    }

    // Publish to Kafka with retry logic
    try {
      await sendMessageWithRetry(topic, {
        key: requestId,
        value: message
      });
      console.log(`Published event to ${topic} with requestId: ${requestId}`);
    } catch (error) {
      // Clean up pending request if we failed to send
      if (responseTopic) {
        pendingRequests.delete(requestId);
      }
      throw new Error(`Failed to send message to Kafka: ${error.message}`);
    }

    // If responseTopic is provided, wait for response
    if (responseTopic) {
      try {
        const response = await responsePromise;
        return res.json(response);
      } catch (error) {
        // Make sure to clean up on error
        pendingRequests.delete(requestId);
        throw error;
      }
    } else {
      // No response expected, return success
      return res.json({ 
        success: true, 
        requestId,
        message: 'Event published successfully' 
      });
    }
  } catch (error) {
    console.error('Error in /api/kafka/send:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to send Kafka event' 
    });
  }
});

// Cleanup function
async function cleanup() {
  console.log('Shutting down Kafka Proxy...');
  
  // Clear intervals
  if (consumerHealthCheckInterval) {
    clearInterval(consumerHealthCheckInterval);
  }
  if (consumerReconnectTimeout) {
    clearTimeout(consumerReconnectTimeout);
  }
  
  // Reject all pending requests
  for (const [requestId, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error('Service shutting down'));
  }
  pendingRequests.clear();
  
  // Disconnect consumer
  if (responseConsumer) {
    try {
      await responseConsumer.disconnect();
      console.log('Disconnected response consumer');
    } catch (error) {
      console.error('Error disconnecting response consumer:', error);
    }
  }
  
  // Disconnect producer
  if (producer && isProducerConnected) {
    try {
      await producer.disconnect();
      console.log('Disconnected producer');
    } catch (error) {
      console.error('Error disconnecting producer:', error);
    }
  }
  
  process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start server
app.listen(PORT, async () => {
  console.log(`Kafka Proxy Service running on port ${PORT}`);
  console.log(`Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);
  
  // Initialize producer on startup (with retry)
  try {
    await initProducer();
  } catch (error) {
    console.error('Failed to initialize producer on startup:', error.message);
    console.log('Producer will be initialized on first request with automatic retry');
  }

  // Initialize response consumer on startup - ONLY ONCE
  // Use a delay to ensure Kafka is fully ready
  setTimeout(async () => {
    if (!consumerReady && !isInitializingConsumer) {
  try {
        console.log('Initializing response consumer on startup...');
    await initResponseConsumer();
        console.log('Response consumer initialized successfully on startup');
  } catch (error) {
    console.error('Failed to initialize response consumer on startup:', error.message);
    console.log('Consumer will be initialized on first request with automatic retry');
        // Don't retry here - let the first request trigger initialization
      }
    } else {
      console.log('Consumer already initialized or initialization in progress, skipping startup init');
  }
  }, 5000); // Wait 5s for Kafka to be fully ready
});

module.exports = app;
