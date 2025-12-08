/**
 * Billing Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testPostgresConnection, connectMongoDB } = require('../../shared/config/database');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
const billingRoutes = require('./routes/billingRoutes');
// Note: Kafka consumers removed - checkout and payment now use HTTP endpoints

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
    
    // Note: Checkout and payment are now handled via HTTP endpoints
    // Kafka is still used for login, signup, and search (handled by other services)
    // No Kafka consumers needed in billing service anymore
    
    app.listen(PORT, () => {
      logger.info(`Billing service running on port ${PORT}`);
      logger.info('Checkout and payment endpoints available at /api/billing/checkout and /api/billing/payment');
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

