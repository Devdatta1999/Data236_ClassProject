/**
 * Booking Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { createConsumer } = require('../../shared/config/kafka');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
// Routes and consumers will be loaded AFTER MongoDB connection to ensure models use connected instance

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

app.use(errorHandler);

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
    
    // Verify Booking model is using the connected Mongoose instance
    const Booking = require('./models/Booking');
    logger.info('Booking model loaded, MongoDB readyState:', mongoose.connection.readyState);
    
    await getRedisClient();
    
    // Setup Kafka consumer for booking events AFTER MongoDB is ready
    // Consumer also loads Booking model, so it must be after MongoDB connection
    const { handleBookingEvent } = require('./consumers/bookingEventConsumer');
    await createConsumer(
      'booking-service-group',
      ['booking-events'],
      handleBookingEvent
    );
    
    app.listen(PORT, () => {
      logger.info(`Booking service running on port ${PORT}`);
      logger.info('Kafka consumer subscribed to: booking-events');
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

