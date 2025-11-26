/**
 * Kafka Proxy Service
 * 
 * Acts as a bridge between frontend (HTTP) and Kafka
 * Frontend sends HTTP requests, this service publishes to Kafka
 * This service subscribes to response topics and returns responses to frontend
 * 
 * Uses a single long-lived consumer to avoid race conditions
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Kafka } = require('kafkajs');

const app = express();
const PORT = process.env.PORT || 3007;

// Kafka configuration
const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];

const kafka = new Kafka({
  clientId: 'kafka-proxy',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 3,
    maxRetryTime: 1000
  },
  requestTimeout: 5000,
  connectionTimeout: 3000
});

const producer = kafka.producer({
  // Optimize for low latency
  maxInFlightRequests: 1,
  idempotent: false,
  transactionTimeout: 30000
});

// In-memory map of pending requests: requestId -> { resolve, reject, timeoutId, timestamp }
const pendingRequests = new Map();

// Single long-lived consumer for all response topics
let responseConsumer = null;
let consumerReady = false;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'kafka-proxy',
    timestamp: new Date().toISOString(),
    consumerReady: consumerReady
  });
});

// Initialize producer
let producerReady = false;

async function initProducer() {
  if (!producerReady) {
    try {
      await producer.connect();
      producerReady = true;
      console.log('Kafka producer connected');
    } catch (error) {
      console.error('Failed to connect Kafka producer:', error);
      throw error;
    }
  }
  return producer;
}

// Initialize the long-lived consumer for response topics
async function initResponseConsumer() {
  if (responseConsumer && consumerReady) {
    return;
  }

  try {
    // Use unique consumer group per pod so each pod consumes all messages
    // This ensures the pod that receives the HTTP request can also receive the response
    const podName = process.env.HOSTNAME || `kafka-proxy-${Date.now()}`;
    const uniqueGroupId = `kafka-proxy-response-${podName}`;
    console.log(`Creating consumer with unique groupId: ${uniqueGroupId}`);
    responseConsumer = kafka.consumer({ 
      groupId: uniqueGroupId,
      sessionTimeout: 10000, // 10 seconds
      heartbeatInterval: 3000, // 3 seconds
      maxBytesPerPartition: 1048576, // 1MB
      minBytes: 1, // Get messages immediately
      maxBytes: 10485760, // 10MB max
      maxWaitTimeInMs: 50 // Poll every 50ms for faster response (default is 5000ms)
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

    // Start consuming messages
    await responseConsumer.run({
      // Optimize for low latency
      autoCommit: true,
      autoCommitInterval: 100, // Commit every 100ms
      autoCommitThreshold: 1, // Commit after 1 message
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
            // Handle error response - could be response.error (string) or response.error.message
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
        }
      },
    });

    consumerReady = true;
    console.log('Response consumer ready and consuming messages');

  } catch (error) {
    console.error('Failed to initialize response consumer:', error);
    consumerReady = false;
    throw error;
  }
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

    // Ensure producer is connected
    await initProducer();

    // If responseTopic is provided, ensure consumer is ready
    if (responseTopic) {
      await initResponseConsumer();
      if (!consumerReady) {
        throw new Error('Response consumer is not ready');
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
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Response timeout after ${timeout}ms`));
        }, timeout);

        pendingRequests.set(requestId, {
          resolve,
          reject,
          timeoutId,
          timestamp: Date.now()
        });
      });
    }

    // Publish to Kafka
    await producer.send({
      topic,
      messages: [{
        key: requestId,
        value: JSON.stringify(message),
      }],
    });

    console.log(`Published event to ${topic} with requestId: ${requestId}`);

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
  if (producerReady) {
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
  
  // Initialize producer on startup
  try {
    await initProducer();
  } catch (error) {
    console.error('Failed to initialize producer on startup:', error);
    console.log('Producer will be initialized on first request');
  }

  // Initialize response consumer on startup
  try {
    await initResponseConsumer();
  } catch (error) {
    console.error('Failed to initialize response consumer on startup:', error);
    console.log('Consumer will be initialized on first request requiring a response');
  }
});

module.exports = app;
