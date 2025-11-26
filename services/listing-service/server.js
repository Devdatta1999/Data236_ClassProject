/**
 * Listing Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB, mongoose } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { createConsumer } = require('../../shared/config/kafka');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// NOTE: Routes and consumers will be loaded AFTER MongoDB connection
// to ensure models are registered when mongoose is already connected

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
const path = require('path');
// Use express.static with options to handle URL-encoded filenames
app.use('/api/listings/images', express.static(path.join(__dirname, '../uploads/images'), {
  setHeaders: (res, filePath) => {
    // Set proper content type for images
    if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'listing-service' });
});

// Readiness check - returns 503 until MongoDB is connected
app.get('/readyz', (req, res) => {
  const { mongoose } = require('../../shared/config/database');
  const readyState = mongoose.connection.readyState;
  
  if (readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({ 
      status: 'not ready', 
      service: 'listing-service',
      mongoDB: {
        readyState: readyState,
        state: readyState === 0 ? 'disconnected' : readyState === 2 ? 'connecting' : 'disconnecting',
        hasDb: !!mongoose.connection.db
      }
    });
  }
  
  res.json({ 
    status: 'ready', 
    service: 'listing-service',
    mongoDB: {
      readyState: readyState,
      state: 'connected',
      dbName: mongoose.connection.db.databaseName
    }
  });
});

// Routes will be registered after MongoDB connection in startServer()
// Error handler will be added after routes are loaded

// Start server
async function startServer() {
  try {
    // Connect to MongoDB FIRST, before loading any models
    logger.info('Connecting to MongoDB...');
    await connectMongoDB();
    logger.info('MongoDB connected and ready for queries');
    
    // Verify connection is ready
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error(`Cannot load routes - MongoDB not connected (readyState: ${mongoose.connection.readyState})`);
    }
    logger.info('MongoDB connection verified before loading routes', {
      readyState: mongoose.connection.readyState,
      dbName: mongoose.connection.db.databaseName
    });
    
    // NOW load routes (which loads models) AFTER mongoose is connected
    logger.info('Loading listing routes...');
    const listingRoutes = require('./routes/listingRoutes');
    app.use('/api/listings', listingRoutes);
    logger.info('Listing routes registered successfully');
    
    // Add error handler AFTER routes
    app.use(errorHandler);
    
    // Connect to Redis
    await getRedisClient();
    
    // Setup Kafka consumer for search events (also loads models, so after connection)
    logger.info('Loading search event consumer...');
    const { handleSearchEvent } = require('./consumers/searchEventConsumer');
    await createConsumer(
      'listing-service-group',
      ['search-events'],
      handleSearchEvent
    );
    logger.info('Kafka consumer subscribed to: search-events');
    
    app.listen(PORT, () => {
      logger.info(`Listing service running on port ${PORT}`);
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

