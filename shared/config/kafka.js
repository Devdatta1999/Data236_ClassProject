/**
 * Kafka producer and consumer configuration
 * Enhanced with automatic reconnection and error handling
 */

const { Kafka } = require('kafkajs');
const logger = require('../utils/logger');

const KAFKA_BROKERS = process.env.KAFKA_BROKERS ? 
  process.env.KAFKA_BROKERS.split(',') : 
  ['localhost:9092'];

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'aerive-backend',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 8, // Increased retries for better reliability
    maxRetryTime: 30000, // Max 30 second retry delay
    multiplier: 2,
    restartOnFailure: async () => true
  },
  // Optimize for reliability and connection stability
  requestTimeout: 30000, // 30 second request timeout
  connectionTimeout: 10000 // 10 second connection timeout
});

let producer = null;
let consumers = {};
let consumerConfigs = {}; // Store consumer config for reconnection
let isProducerConnected = false;

/**
 * Get or create Kafka producer with automatic reconnection
 */
async function getProducer() {
  // Return existing producer if it's marked as connected
  if (producer && isProducerConnected) {
    return producer;
  }

  // Create new producer
  try {
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
    logger.info('Kafka producer connected successfully');
    
    // Mark as disconnected if connection fails later
    // We'll detect this on send failures and reconnect
    return producer;
  } catch (error) {
    logger.error('Kafka producer connection error:', error);
    isProducerConnected = false;
    producer = null;
    throw error;
  }
}

/**
 * Send message to Kafka topic with automatic retry and reconnection
 */
async function sendMessage(topic, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const producerInstance = await getProducer();
      await producerInstance.send({
        topic,
        messages: [{
          key: message.key || null,
          value: JSON.stringify(message.value),
          headers: message.headers || {}
        }]
      });
      logger.debug(`Message sent to topic ${topic}`);
      return; // Success, exit
    } catch (error) {
      logger.error(`Error sending message to topic ${topic} (attempt ${attempt}/${retries}):`, error.message);
      
      // Reset producer connection on error
      if (producer) {
        try {
          await producer.disconnect().catch(() => {});
        } catch (e) {
          // Ignore disconnect errors
        }
        producer = null;
        isProducerConnected = false;
      }

      if (attempt === retries) {
        throw error; // Last attempt failed, throw error
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
    }
  }
}

/**
 * Create Kafka consumer with automatic reconnection and error handling
 */
async function createConsumer(groupId, topics, messageHandler) {
  // Store config for reconnection
  consumerConfigs[groupId] = { topics, messageHandler };
  
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let reconnectTimeout = null;

  const setupConsumer = async () => {
    try {
      // Clean up existing consumer if any
      if (consumers[groupId]) {
        try {
          await consumers[groupId].disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      const consumer = kafka.consumer({ 
        groupId,
        sessionTimeout: 60000, // Increased to 60s for EKS network latency
        heartbeatInterval: 3000, // Must be < sessionTimeout/3 (3s < 20s) - critical for stability
        maxBytesPerPartition: 1048576,
        minBytes: 1,
        maxBytes: 10485760,
        maxWaitTimeInMs: 500, // Poll every 500ms (less aggressive)
        retry: {
          retries: 8,
          initialRetryTime: 100,
          maxRetryTime: 30000
        },
        allowAutoTopicCreation: true
      });

      await consumer.connect();
      logger.info(`Kafka consumer ${groupId} connected`);
      
      // Subscribe to topics
      for (const topic of topics) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }
      
      // Start consuming messages
      // Note: consumer.run() starts async processing but returns immediately
      // We monitor connection health separately
      await consumer.run({
        autoCommit: true,
        autoCommitInterval: 5000,
        autoCommitThreshold: 1,
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const value = JSON.parse(message.value.toString());
            await messageHandler(topic, value, { partition, offset: message.offset });
          } catch (error) {
            logger.error(`Error processing message from topic ${topic}:`, error);
            // Don't crash - continue processing other messages
          }
        }
      });
      
      consumers[groupId] = consumer;
      reconnectAttempts = 0; // Reset on successful setup
      logger.info(`Kafka consumer ${groupId} created and subscribed to topics: ${topics.join(', ')}`);
      
      // DISABLED: Aggressive health check that causes unnecessary reconnects
      // KafkaJS handles reconnection automatically on actual connection errors
      // The isRunning() check is unreliable and causes false positives
      // Only reconnect on actual errors, not based on isRunning() status
      // Health check disabled - KafkaJS will automatically reconnect on connection errors
      
      return consumer;
    } catch (error) {
      logger.error(`Error creating Kafka consumer ${groupId}:`, error);
      scheduleReconnect();
      throw error;
    }
  };

  // Automatic reconnection with exponential backoff
  const scheduleReconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      logger.error(`Kafka consumer ${groupId} exceeded max reconnection attempts (${maxReconnectAttempts}). Stopping reconnection.`);
      return;
    }

    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
    
    logger.warn(`Scheduling reconnect for Kafka consumer ${groupId} in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
    
    reconnectTimeout = setTimeout(async () => {
      try {
        logger.info(`Attempting to reconnect Kafka consumer ${groupId}...`);
        await setupConsumer();
      } catch (error) {
        logger.error(`Reconnection attempt failed for Kafka consumer ${groupId}:`, error.message);
        scheduleReconnect(); // Try again
      }
    }, delay);
  };

  // Initial setup
  return await setupConsumer();
}

/**
 * Check if consumer is connected and healthy
 */
function isConsumerConnected(groupId) {
  const consumer = consumers[groupId];
  return consumer && consumer.isRunning && consumer.isRunning();
}

/**
 * Get consumer connection status
 */
function getConsumerStatus(groupId) {
  const consumer = consumers[groupId];
  if (!consumer) {
    return { connected: false, status: 'not_initialized' };
  }
  
  try {
    const running = consumer.isRunning ? consumer.isRunning() : false;
    return { 
      connected: running, 
      status: running ? 'connected' : 'disconnected',
      groupId 
    };
  } catch (error) {
    return { connected: false, status: 'error', error: error.message };
  }
}

/**
 * Get producer connection status
 */
function getProducerStatus() {
  return {
    connected: isProducerConnected,
    status: isProducerConnected ? 'connected' : 'disconnected'
  };
}

/**
 * Disconnect all consumers and producer
 */
async function disconnect() {
  try {
    if (producer) {
      await producer.disconnect();
      producer = null;
      isProducerConnected = false;
    }
    
    for (const [groupId, consumer] of Object.entries(consumers)) {
      try {
        await consumer.disconnect();
        logger.info(`Kafka consumer ${groupId} disconnected`);
      } catch (error) {
        logger.error(`Error disconnecting consumer ${groupId}:`, error.message);
      }
    }
    consumers = {};
    consumerConfigs = {};
  } catch (error) {
    logger.error('Error disconnecting Kafka clients:', error);
  }
}

module.exports = {
  getProducer,
  sendMessage,
  createConsumer,
  disconnect,
  isConsumerConnected,
  getConsumerStatus,
  getProducerStatus,
  kafka
};
