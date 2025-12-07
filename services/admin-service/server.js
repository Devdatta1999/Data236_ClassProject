/**
 * Admin Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB, mongoose } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// NOTE: Routes will be loaded AFTER MongoDB connection
// to ensure models are registered when mongoose is already connected

const app = express();
const PORT = process.env.PORT || 3006;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admin-service' });
});

// Readiness check - returns 503 until MongoDB is connected
app.get('/readyz', (req, res) => {
  const { mongoose } = require('../../shared/config/database');
  const readyState = mongoose.connection.readyState;
  
  if (readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({ 
      status: 'not ready', 
      service: 'admin-service',
      mongoDB: {
        readyState: readyState,
        state: readyState === 0 ? 'disconnected' : readyState === 2 ? 'connecting' : 'disconnecting',
        hasDb: !!mongoose.connection.db
      }
    });
  }
  
  res.json({ 
    status: 'ready', 
    service: 'admin-service',
    mongoDB: {
      readyState: readyState,
      state: 'connected',
      dbName: mongoose.connection.db.databaseName
    }
  });
});

// Routes will be registered after MongoDB connection in startServer()
// Error handler will be added after routes are loaded

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
    
    // NOW load routes (which loads Admin model) AFTER mongoose is connected
    logger.info('Loading admin routes...');
    const adminRoutes = require('./routes/adminRoutes');
    app.use('/api/admin', adminRoutes);
    logger.info('Admin routes registered successfully');
    
    // Load analytics routes
    logger.info('Loading analytics routes...');
    const analyticsRoutes = require('./routes/analyticsRoutes');
    app.use('/api/analytics', analyticsRoutes);
    logger.info('Analytics routes registered successfully');
    
    // Add error handler AFTER routes
    app.use(errorHandler);
    
    // Connect to Redis (non-blocking - optional caching)
    try {
      await getRedisClient();
      logger.info('Redis connected successfully');
    } catch (redisError) {
      logger.warn('Redis connection failed - caching disabled:', redisError.message);
      // Continue without Redis - caching will be disabled but analytics will work
    }
    
    app.listen(PORT, () => {
      logger.info(`Admin service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start admin service:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

