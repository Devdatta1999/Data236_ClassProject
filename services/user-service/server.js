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
const userRoutes = require('./routes/userRoutes');
const { handleUserEvent } = require('./consumers/userEventConsumer');

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

// Routes
app.use('/api/users', userRoutes);

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    
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

