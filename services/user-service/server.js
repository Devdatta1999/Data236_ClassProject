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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Routes will be registered after MongoDB connection in startServer()

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to MongoDB FIRST, before loading any models
    // This ensures mongoose is connected before models are registered
    await connectMongoDB();
    logger.info('MongoDB connected and ready for queries');
    
    // NOW load routes (which loads User model via controller) AFTER mongoose is connected
    // This ensures User model is registered when mongoose.connection.readyState === 1
    const userRoutes = require('./routes/userRoutes');
    app.use('/api/users', userRoutes);
    logger.info('User routes loaded after MongoDB connection');
    
    // NOW load the consumer (which also uses User model) AFTER mongoose is connected
    const { handleUserEvent } = require('./consumers/userEventConsumer');
    logger.info('User consumer loaded after MongoDB connection');
    
    // Connect to Redis
    await getRedisClient();
    
    // Setup Kafka consumer for user events
    await createConsumer(
      'user-service-group',
      ['user-events'],
      handleUserEvent
    );
    
    app.listen(PORT, () => {
      logger.info(`User service running on port ${PORT}`);
      logger.info('Kafka consumer subscribed to: user-events');
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

