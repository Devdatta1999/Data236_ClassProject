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
const bookingRoutes = require('./routes/bookingRoutes');
const { handleBookingEvent } = require('./consumers/bookingEventConsumer');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'booking-service' });
});

app.use('/api/bookings', bookingRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    await connectMongoDB();
    await getRedisClient();
    
    // Setup Kafka consumer for booking events
    await createConsumer(
      'booking-service-group',
      ['booking-events'],
      handleBookingEvent
    );
    
    app.listen(PORT, () => {
      logger.info(`Booking service running on port ${PORT}`);
      logger.info('Kafka consumer subscribed to: booking-events');
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

