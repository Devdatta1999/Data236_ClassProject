/**
 * Billing Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testPostgresConnection, connectMongoDB } = require('../../shared/config/database');
const { createConsumer } = require('../../shared/config/kafka');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
const billingRoutes = require('./routes/billingRoutes');
const { handleBillingEvent, handleBookingResponseForCheckout } = require('./consumers/billingEventConsumer');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'billing-service' });
});

app.use('/api/billing', billingRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    // Connect to MongoDB first (needed for Booking queries)
    try {
      await connectMongoDB();
      logger.info('MongoDB connection successful');
    } catch (mongoError) {
      logger.warn(`MongoDB connection failed (service will continue): ${mongoError.message}`);
      // Don't exit - allow service to start even if DB connection fails initially
    }
    
    // Test PostgreSQL connection with timeout and better error handling
    try {
      await Promise.race([
        testPostgresConnection(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PostgreSQL connection timeout')), 10000))
      ]);
      logger.info('PostgreSQL connection successful');
    } catch (dbError) {
      logger.warn(`PostgreSQL connection failed (service will continue): ${dbError.message}`);
      // Don't exit - allow service to start even if DB connection fails initially
    }
    
    // Setup Kafka consumers for checkout and payment events
    try {
      await createConsumer(
        'billing-service-group',
        ['checkout-events', 'payment-events'],
        handleBillingEvent
      );
      logger.info('Kafka consumer created for checkout-events and payment-events');
    } catch (kafkaError) {
      logger.error(`Failed to create Kafka consumer: ${kafkaError.message}`);
      // Continue anyway - Kafka might be starting up
    }

    // Also consume booking responses to handle checkout aggregation
    try {
      await createConsumer(
        'billing-service-booking-response-group',
        ['booking-events-response'],
        async (topic, message, metadata) => {
          try {
            const response = typeof message === 'string' ? JSON.parse(message) : message;
            await handleBookingResponseForCheckout(response);
          } catch (error) {
            logger.error(`Error handling booking response for checkout: ${error.message}`);
          }
        }
      );
      logger.info('Kafka consumer created for booking-events-response');
    } catch (kafkaError) {
      logger.error(`Failed to create booking response consumer: ${kafkaError.message}`);
    }
    
    app.listen(PORT, () => {
      logger.info(`Billing service running on port ${PORT}`);
      logger.info('Kafka consumers subscribed to: checkout-events, payment-events, booking-events-response');
    });
  } catch (error) {
    logger.error('Failed to start billing service:', error);
    logger.error('Error stack:', error.stack);
    // Don't exit immediately - give it a chance to retry
    setTimeout(() => process.exit(1), 5000);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

