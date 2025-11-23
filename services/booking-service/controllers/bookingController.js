/**
 * Booking Controller
 * Note: Booking creation and cancellation are handled via Kafka (booking-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Booking = require('../models/Booking');
const { NotFoundError, asyncHandler } = require('../../../shared/utils/errors');
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

module.exports = {
  getBooking,
  updateBooking,
  getUserBookings
};
