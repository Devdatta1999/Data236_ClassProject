/**
 * Kafka Proxy Service
 * 
 * Acts as a bridge between frontend (HTTP) and Kafka
 * Frontend sends HTTP requests, this service publishes to Kafka
 * This service subscribes to response topics and returns responses to frontend
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
});

const producer = kafka.producer();
const consumers = {}; // Store active consumers for response topics

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'kafka-proxy',
    timestamp: new Date().toISOString()
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

    // Generate requestId if not provided
    const requestId = event.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      ...event,
      requestId,
    };

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
      const response = await waitForResponse(responseTopic, requestId, timeout);
      return res.json(response);
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

// Wait for response from Kafka
async function waitForResponse(responseTopic, requestId, timeout) {
  return new Promise((resolve, reject) => {
    const consumerId = `consumer-${requestId}-${Date.now()}`;
    const consumer = kafka.consumer({ 
      groupId: `kafka-proxy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` 
    });

    const timeoutId = setTimeout(async () => {
      try {
        await consumer.disconnect();
        delete consumers[consumerId];
      } catch (err) {
        console.error('Error disconnecting consumer on timeout:', err);
      }
      reject(new Error('Response timeout'));
    }, timeout);

    consumer.connect()
      .then(() => {
        console.log(`Consumer ${consumerId} connected for topic ${responseTopic}`);
        return consumer.subscribe({ 
          topic: responseTopic, 
          fromBeginning: false 
        });
      })
      .then(() => {
        consumers[consumerId] = consumer;
        
        consumer.run({
          eachMessage: async ({ message }) => {
            try {
              const response = JSON.parse(message.value.toString());
              
              // Check if this is the response we're waiting for
              if (response.requestId === requestId) {
                clearTimeout(timeoutId);
                
                try {
                  await consumer.disconnect();
                  delete consumers[consumerId];
                  console.log(`Consumer ${consumerId} disconnected after receiving response`);
                } catch (err) {
                  console.error('Error disconnecting consumer:', err);
                }
                
                if (response.success) {
                  resolve(response.data || response);
                } else {
                  reject(new Error(response.error?.message || 'Request failed'));
                }
              }
            } catch (error) {
              console.error('Error parsing response message:', error);
            }
          },
        });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        delete consumers[consumerId];
        console.error('Error setting up consumer:', error);
        reject(error);
      });
  });
}

// Cleanup function
async function cleanup() {
  console.log('Shutting down Kafka Proxy...');
  
  // Disconnect all consumers
  for (const [id, consumer] of Object.entries(consumers)) {
    try {
      await consumer.disconnect();
      console.log(`Disconnected consumer ${id}`);
    } catch (error) {
      console.error(`Error disconnecting consumer ${id}:`, error);
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
});

module.exports = app;

