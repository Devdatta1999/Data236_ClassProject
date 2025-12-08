/**
 * User Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { createConsumer } = require('../../shared/config/kafka');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// NOTE: Routes and consumers (and thus User model) will be loaded AFTER MongoDB connection
// to ensure models are registered when mongoose is already connected

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
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

// Ensure uploads directory structure exists (important for persistent volumes)
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads');
const profilePicturesDir = path.join(__dirname, '../uploads/profile-pictures');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(profilePicturesDir)) {
  fs.mkdirSync(profilePicturesDir, { recursive: true });
}
logger.info('Uploads directory structure initialized', { uploadsDir, profilePicturesDir });

// Serve uploaded profile pictures statically
app.use('/api/users/profile-pictures', express.static(profilePicturesDir, {
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Routes will be registered after MongoDB connection in startServer()
// Error handler will be added after routes are loaded

// Start server
async function startServer() {
  try {
    // Connect to MongoDB FIRST, before loading any models
    // This ensures mongoose is connected before models are registered
    logger.info('Connecting to MongoDB...');
    await connectMongoDB();
    logger.info('MongoDB connected and ready for queries');
    
    // Verify MongoDB connection is truly ready
    const { mongoose } = require('../../shared/config/database');
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error(`Cannot load routes - MongoDB not connected (readyState: ${mongoose.connection.readyState})`);
    }
    logger.info('MongoDB connection verified before loading routes', {
      readyState: mongoose.connection.readyState,
      dbName: mongoose.connection.db.databaseName
    });
    
    // NOW load routes (which loads User model via controller) AFTER mongoose is connected
    // This ensures User model is registered when mongoose.connection.readyState === 1
    logger.info('Loading user routes...');
    const userRoutes = require('./routes/userRoutes');
    
    // Verify User model is using the connected mongoose instance
    const User = require('./models/User');
    if (User.db?.base !== mongoose.connection.base) {
      throw new Error('CRITICAL: User model is using a different mongoose instance!');
    }
    logger.info('User model verified to use connected mongoose instance');
    
    // Add request logging middleware BEFORE routes
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { 
        body: req.method === 'POST' ? req.body : undefined,
        query: req.query 
      });
      next();
    });
    
    app.use('/api/users', userRoutes);
    logger.info('User routes registered successfully');
    
    // NOW load the consumer (which also uses User model) AFTER mongoose is connected
    logger.info('Loading user event consumer...');
    const { handleUserEvent } = require('./consumers/userEventConsumer');
    logger.info('User consumer loaded after MongoDB connection');
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await getRedisClient();
    logger.info('Redis connected successfully');
    
    // Setup Kafka consumer for user events (automatic reconnection is built-in)
    logger.info('Setting up Kafka consumer...');
    await createConsumer(
      'user-service-group',
      ['user-events'],
      handleUserEvent
    );
    logger.info('Kafka consumer subscribed to: user-events (with automatic reconnection enabled)');
    
    // Add readiness probe endpoint AFTER MongoDB is connected
    app.get('/readyz', (req, res) => {
      const { mongoose } = require('../../shared/config/database');
      const { getConsumerStatus, getProducerStatus } = require('../../shared/config/kafka');
      const readyState = mongoose.connection.readyState;
      const kafkaConsumerStatus = getConsumerStatus('user-service-group');
      const kafkaProducerStatus = getProducerStatus();
      
      // Only return 200 if explicitly connected (1)
      // Return 503 for disconnected (0), connecting (2), or disconnecting (3)
      if (readyState !== 1) {
        return res.status(503).json({ 
          status: 'not ready', 
          service: 'user-service',
          mongoDB: {
            readyState: readyState,
            state: readyState === 0 ? 'disconnected' : readyState === 2 ? 'connecting' : 'disconnecting',
            hasDb: !!mongoose.connection.db
          },
          kafka: {
            consumer: kafkaConsumerStatus,
            producer: kafkaProducerStatus
          }
        });
      }
      
      // Verify db object exists
      if (!mongoose.connection.db) {
        return res.status(503).json({ 
          status: 'not ready', 
          service: 'user-service',
          mongoDB: {
            readyState: readyState,
            state: 'connected but db object missing',
            hasDb: false
          },
          kafka: {
            consumer: kafkaConsumerStatus,
            producer: kafkaProducerStatus
          }
        });
      }
      
      // Check Kafka consumer connection
      if (!kafkaConsumerStatus.connected) {
        return res.status(503).json({ 
          status: 'not ready', 
          service: 'user-service',
          mongoDB: {
            readyState: readyState,
            state: 'connected',
            dbName: mongoose.connection.db.databaseName
          },
          kafka: {
            consumer: kafkaConsumerStatus,
            producer: kafkaProducerStatus
          }
        });
      }
      
      res.json({ 
        status: 'ready', 
        service: 'user-service',
        mongoDB: {
          readyState: readyState,
          state: 'connected',
          dbName: mongoose.connection.db.databaseName
        },
        kafka: {
          consumer: kafkaConsumerStatus,
          producer: kafkaProducerStatus
        }
      });
    });
    
    // Add error handler AFTER routes
    app.use(errorHandler);
    
    // Start server only after all connections and routes are ready
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`User service running on port ${PORT}`);
      logger.info('Ready to accept requests');
    });
  } catch (error) {
    logger.error('Failed to start user service:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

