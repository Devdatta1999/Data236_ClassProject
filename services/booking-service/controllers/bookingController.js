/**
 * Booking Controller
 * Note: Booking creation and cancellation are handled via Kafka (booking-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Booking = require('../models/Booking');
const { NotFoundError, ValidationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * Get booking by ID
 */
const getBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const cacheKey = `booking:${bookingId}`;
  let booking = await getCache(cacheKey);

  if (!booking) {
    booking = await Booking.findOne({ bookingId });
    if (!booking) {
      throw new NotFoundError('Booking');
    }
    await setCache(cacheKey, booking, 3600);
  }

  res.json({
    success: true,
    data: { booking }
  });
});

/**
 * Update booking
 */
const updateBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const updates = req.body;

  const booking = await Booking.findOne({ bookingId });
  if (!booking) {
    throw new NotFoundError('Booking');
  }

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'bookingId') {
      booking[key] = updates[key];
    }
  });

  booking.updatedAt = new Date();
  await booking.save();

  await deleteCache(`booking:${bookingId}`);
  await deleteCache(`user:${booking.userId}:bookings`);

  res.json({
    success: true,
    message: 'Booking updated successfully',
    data: { booking }
  });
});

/**
 * Get user bookings
 */
const getUserBookings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.query;

  const cacheKey = `user:${userId}:bookings:${status || 'all'}`;
  let bookings = await getCache(cacheKey);

  if (!bookings) {
    const query = { userId };
    if (status) {
      query.status = status;
    }
    bookings = await Booking.find(query).sort({ bookingDate: -1 });
    await setCache(cacheKey, bookings, 900);
  }

  res.json({
    success: true,
    count: bookings.length,
    data: { bookings }
  });
});

/**
 * Mark bookings as Failed (for abandoned checkouts)
 * Accepts array of bookingIds or single bookingId
 */
const markBookingsAsFailed = asyncHandler(async (req, res) => {
  const { bookingIds } = req.body;
  const { userId } = req.params || req.query; // Can be from params or query

  if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    throw new ValidationError('bookingIds array is required');
  }

  const failedBookings = [];
  const errors = [];

  for (const bookingId of bookingIds) {
    try {
      const booking = await Booking.findOne({ bookingId });
      if (!booking) {
        errors.push({ bookingId, error: 'Booking not found' });
        continue;
      }

      // Only mark as Failed if it's in Pending status
      // Optionally verify userId matches if provided
      if (userId && booking.userId !== userId) {
        errors.push({ bookingId, error: 'Unauthorized' });
        continue;
      }

      // Mark as Failed if it's in Pending or Confirmed status
      // This releases inventory for both abandoned checkouts and payment failures
      if (booking.status === 'Pending' || booking.status === 'Confirmed') {
        const oldStatus = booking.status;
        booking.status = 'Failed';
        booking.updatedAt = new Date();
        await booking.save();
        failedBookings.push(bookingId);
        
        // Invalidate cache
        await deleteCache(`booking:${bookingId}`);
        await deleteCache(`user:${booking.userId}:bookings`);
        
        logger.info(`Marked booking as Failed: ${bookingId} (was: ${oldStatus})`);
      } else {
        logger.warn(`Booking ${bookingId} is not in Pending/Confirmed status (${booking.status}), skipping`);
      }
    } catch (error) {
      errors.push({ bookingId, error: error.message });
      logger.error(`Failed to mark booking ${bookingId} as Failed: ${error.message}`);
    }
  }

  res.json({
    success: true,
    message: `Marked ${failedBookings.length} booking(s) as Failed`,
    data: {
      failedBookings,
      errors: errors.length > 0 ? errors : undefined
    }
  });
});

/**
 * Expire old Pending bookings (older than 15 minutes)
 * This can be called periodically or during booking creation
 */
const expirePendingBookings = asyncHandler(async (req, res) => {
  const expiryMinutes = parseInt(req.query.minutes || '15');
  const expiryTime = new Date(Date.now() - expiryMinutes * 60 * 1000);

  const pendingBookings = await Booking.find({
    status: 'Pending',
    createdAt: { $lt: expiryTime }
  });

  const expiredBookings = [];
  for (const booking of pendingBookings) {
    booking.status = 'Failed';
    booking.updatedAt = new Date();
    await booking.save();
    
    await deleteCache(`booking:${booking.bookingId}`);
    await deleteCache(`user:${booking.userId}:bookings`);
    
    expiredBookings.push(booking.bookingId);
    logger.info(`Expired booking: ${booking.bookingId}`);
  }

  res.json({
    success: true,
    message: `Expired ${expiredBookings.length} booking(s)`,
    data: { expiredBookings }
  });
});

module.exports = {
  getBooking,
  updateBooking,
  getUserBookings,
  markBookingsAsFailed,
  expirePendingBookings
};
