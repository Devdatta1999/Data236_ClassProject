/**
 * Booking Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
// Note: Kafka consumers removed - booking creation now uses HTTP endpoint
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// Routes will be loaded AFTER MongoDB connection to ensure models use connected instance

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'booking-service' });
});

app.get('/readyz', (req, res) => {
  const { mongoose } = require('../../shared/config/database');
  if (mongoose.connection.readyState === 1) {
    res.json({ status: 'ready', service: 'booking-service' });
  } else {
    res.status(503).json({ status: 'not ready', service: 'booking-service', readyState: mongoose.connection.readyState });
  }
});

// Routes will be loaded in startServer() after MongoDB connection
// Note: errorHandler must be after routes, so we'll add it in startServer()

async function startServer() {
  try {
    // CRITICAL: Ensure MongoDB is fully connected BEFORE loading routes/consumers
    // This prevents Mongoose models from being registered while disconnected
    await connectMongoDB();
    
    // Verify MongoDB connection is truly ready
    const { mongoose } = require('../../shared/config/database');
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection not ready after connectMongoDB()');
    }
    
    // CRITICAL: Load routes AFTER MongoDB is connected (routes load Booking model)
    // This ensures the Booking model is registered with the connected Mongoose instance
    const bookingRoutes = require('./routes/bookingRoutes');
    app.use('/api/bookings', bookingRoutes);
    
    // Add error handler AFTER routes
    app.use(errorHandler);
    
    // Verify Booking model is using the connected Mongoose instance
    const Booking = require('./models/Booking');
    logger.info('Booking model loaded, MongoDB readyState:', mongoose.connection.readyState);
    
    await getRedisClient();
    
    // Note: Booking creation is now handled via HTTP endpoint (POST /api/bookings/create)
    // Kafka is still used for login, signup, and search (handled by other services)
    // No Kafka consumers needed in booking service anymore
    
    app.listen(PORT, () => {
      logger.info(`Booking service running on port ${PORT}`);
      logger.info('Booking creation endpoint available at POST /api/bookings/create');
      logger.info('MongoDB readyState:', mongoose.connection.readyState);
    });
  } catch (error) {
    logger.error('Failed to start booking service:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

