/**
 * Listing Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { createConsumer } = require('../../shared/config/kafka');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
const listingRoutes = require('./routes/listingRoutes');
const { handleSearchEvent } = require('./consumers/searchEventConsumer');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'listing-service' });
});

// Routes
app.use('/api/listings', listingRoutes);

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await connectMongoDB();
    await getRedisClient();
    
    // Setup Kafka consumer for search events
    await createConsumer(
      'listing-service-group',
      ['search-events'],
      handleSearchEvent
    );
    
    app.listen(PORT, () => {
      logger.info(`Listing service running on port ${PORT}`);
      logger.info('Kafka consumer subscribed to: search-events');
    });
  } catch (error) {
    logger.error('Failed to start listing service:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

