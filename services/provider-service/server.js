/**
 * Provider Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// NOTE: providerRoutes will be loaded AFTER MongoDB connection is established
// to ensure models are registered when mongoose is already connected

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());

// Body parsing middleware - skip for multipart/form-data (let multer handle it)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    // Skip body parsing for multipart requests - multer will handle it
    return next();
  }
  // For non-multipart requests, apply JSON and URL-encoded parsers
  express.json()(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true })(req, res, next);
  });
});

// Serve uploaded profile pictures statically
const path = require('path');
app.use('/api/providers/profile-pictures', express.static(path.join(__dirname, '../uploads/profile-pictures'), {
  setHeaders: (res, filePath) => {
    // Set proper content type for images
    if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    }
  }
}));

// Health check - basic service health
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'provider-service'
  });
});

// Readiness check - returns 503 until MongoDB is connected
// Fix #1: Make readiness depend on DB connection
app.get('/readyz', (req, res) => {
  // Fix #3: Use mongoose from shared/config/database.js to ensure same instance
  const { mongoose } = require('../../shared/config/database');
  const readyState = mongoose.connection.readyState;
  
  // Only return 200 if explicitly connected (1)
  // Return 503 for disconnected (0), connecting (2), or disconnecting (3)
  if (readyState !== 1) {
    return res.status(503).json({ 
      status: 'not ready', 
      service: 'provider-service',
      mongoDB: {
        readyState: readyState,
        state: readyState === 0 ? 'disconnected' : readyState === 2 ? 'connecting' : 'disconnecting',
        hasDb: !!mongoose.connection.db
      }
    });
  }
  
  // Verify db object exists
  if (!mongoose.connection.db) {
    return res.status(503).json({ 
      status: 'not ready', 
      service: 'provider-service',
      mongoDB: {
        readyState: readyState,
        state: 'connected but db object missing',
        hasDb: false
      }
    });
  }
  
  res.json({ 
    status: 'ready', 
    service: 'provider-service',
    mongoDB: {
      readyState: readyState,
      state: 'connected',
      dbName: mongoose.connection.db.databaseName
    }
  });
});

// Routes will be registered after MongoDB connection in startServer()
// Request logging middleware will be added after routes are loaded
// Error handler will be added after routes are loaded

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

async function startServer() {
  try {
    // Fix #2: Verify MONGODB_URI is set before attempting connection
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      logger.error('MONGODB_URI environment variable is not set!');
      throw new Error('MONGODB_URI environment variable is required');
    }
    logger.info('MONGODB_URI is set', { 
      uri: MONGODB_URI.replace(/mongodb\+srv:\/\/(.*?):.*?@/, 'mongodb+srv://$1:***@') // Mask password
    });
    
    // Connect to MongoDB FIRST, before loading any models
    // This ensures mongoose is connected before models are registered
    logger.info('Connecting to MongoDB...');
    await connectMongoDB();
    logger.info('MongoDB connected and ready for queries');

    // Connect to Redis (can happen in parallel or before routes)
    logger.info('Connecting to Redis...');
    await getRedisClient();
    logger.info('Redis connected successfully');

    // NOW load routes (which loads models) AFTER mongoose is connected
    // This ensures Provider model is registered when mongoose.connection.readyState === 1
    // Fix #3: Verify mongoose is actually connected before loading models
    const { mongoose } = require('../../shared/config/database');
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error(`Cannot load routes - MongoDB not connected (readyState: ${mongoose.connection.readyState})`);
    }
    logger.info('MongoDB connection verified before loading routes', {
      readyState: mongoose.connection.readyState,
      dbName: mongoose.connection.db.databaseName
    });
    
    logger.info('Loading provider routes...');
    const providerRoutes = require('./routes/providerRoutes');
    
    // Verify Provider model is using the connected mongoose instance
    const Provider = require('./models/Provider');
    if (Provider.db?.base !== mongoose.connection.base) {
      throw new Error('CRITICAL: Provider model is using a different mongoose instance!');
    }
    logger.info('Provider model verified to use connected mongoose instance');
    
    // Add request logging middleware BEFORE routes (but after connection is ready)
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { 
        body: req.method === 'POST' ? req.body : undefined,
        query: req.query 
      });
      next();
    });
    
    // Register routes
    app.use('/api/providers', providerRoutes);
    logger.info('Provider routes registered successfully');
    
    // Add error handler AFTER routes
    app.use(errorHandler);
    
    // Verify routes are registered
    logger.info('Registered routes:', {
      routes: app._router?.stack?.filter(layer => layer.route || layer.regexp).map(layer => ({
        path: layer.route?.path || layer.regexp?.toString(),
        methods: layer.route?.methods
      }))
    });
    
    // Start server only after all connections and routes are ready
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Provider service running on port ${PORT}`);
      logger.info('Ready to accept requests');
    });
  } catch (error) {
    logger.error('Failed to start provider service:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

