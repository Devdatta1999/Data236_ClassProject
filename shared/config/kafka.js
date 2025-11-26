/**
 * Kafka producer and consumer configuration
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
    retries: 3, // Reduced retries for faster failure
    maxRetryTime: 1000 // Max 1 second retry delay
  },
  // Optimize for low latency
  requestTimeout: 5000, // 5 second request timeout
  connectionTimeout: 3000 // 3 second connection timeout
});

let producer = null;
let consumers = {};

/**
 * Get or create Kafka producer
 */
async function getProducer() {
  if (producer) {
    return producer;
  }

  try {
    producer = kafka.producer({
      // Optimize for low latency
      maxInFlightRequests: 1, // Process one request at a time for ordering
      idempotent: false, // Disable idempotence for lower latency
      transactionTimeout: 30000
    });
    await producer.connect();
    logger.info('Kafka producer connected');
    return producer;
  } catch (error) {
    logger.error('Kafka producer connection error:', error);
    throw error;
  }
}

/**
 * Send message to Kafka topic
 */
async function sendMessage(topic, message) {
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
    logger.info(`Message sent to topic ${topic}`);
  } catch (error) {
    logger.error(`Error sending message to topic ${topic}:`, error);
    throw error;
  }
}

/**
 * Create Kafka consumer
 */
async function createConsumer(groupId, topics, messageHandler) {
  try {
    const consumer = kafka.consumer({ 
      groupId,
      sessionTimeout: 10000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576,
      minBytes: 1,
      maxBytes: 10485760,
      maxWaitTimeInMs: 50 // Poll every 50ms for faster response
    });
    await consumer.connect();
    
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    
    await consumer.run({
      autoCommit: true,
      autoCommitInterval: 100,
      autoCommitThreshold: 1,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          await messageHandler(topic, value, { partition, offset: message.offset });
        } catch (error) {
          logger.error(`Error processing message from topic ${topic}:`, error);
        }
      }
    });
    
    consumers[groupId] = consumer;
    logger.info(`Kafka consumer ${groupId} created and subscribed to topics: ${topics.join(', ')}`);
    return consumer;
  } catch (error) {
    logger.error(`Error creating Kafka consumer ${groupId}:`, error);
    throw error;
  }
}

/**
 * Disconnect all consumers and producer
 */
async function disconnect() {
  try {
    if (producer) {
      await producer.disconnect();
      producer = null;
    }
    
    for (const [groupId, consumer] of Object.entries(consumers)) {
      await consumer.disconnect();
      logger.info(`Kafka consumer ${groupId} disconnected`);
    }
    consumers = {};
  } catch (error) {
    logger.error('Error disconnecting Kafka clients:', error);
  }
}

module.exports = {
  getProducer,
  sendMessage,
  createConsumer,
  disconnect,
  kafka
};

