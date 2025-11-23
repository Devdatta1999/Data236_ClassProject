/**
 * Flight Controller
 * Note: Flight search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Flight = require('../models/Flight');
const { NotFoundError, ValidationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * Get flight by ID
 */
const getFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;

  const cacheKey = `flight:${flightId}`;
  let flight = await getCache(cacheKey);

  if (!flight) {
    flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
    if (!flight) {
      throw new NotFoundError('Flight');
    }
    await setCache(cacheKey, flight, 3600);
  }

  res.json({
    success: true,
    data: { flight }
  });
});

/**
 * Create flight (Admin/Provider only)
 */
const createFlight = asyncHandler(async (req, res) => {
  const flightData = req.body;

  // Check if flight already exists
  const existing = await Flight.findOne({ flightId: flightData.flightId.toUpperCase() });
  if (existing) {
    throw new ValidationError('Flight with this ID already exists');
  }

  const flight = new Flight({
    ...flightData,
    flightId: flightData.flightId.toUpperCase(),
    status: 'Pending' // Requires admin approval
  });

  await flight.save();

  // Invalidate search cache
  await deleteCachePattern('search:flight:*');

  logger.info(`Flight created: ${flight.flightId}`);

  res.status(201).json({
    success: true,
    message: 'Flight created successfully',
    data: { flight }
  });
});

/**
 * Update flight
 */
const updateFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;
  const updates = req.body;

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'flightId') {
      flight[key] = updates[key];
    }
  });

  flight.updatedAt = new Date();
  await flight.save();

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  res.json({
    success: true,
    message: 'Flight updated successfully',
    data: { flight }
  });
});

/**
 * Delete flight
 */
const deleteFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  await Flight.deleteOne({ flightId: flightId.toUpperCase() });

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  logger.info(`Flight deleted: ${flightId}`);

  res.json({
    success: true,
    message: 'Flight deleted successfully'
  });
});

/**
 * Add review to flight
 */
const addReview = asyncHandler(async (req, res) => {
  const { flightId } = req.params;
  const { userId, rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  flight.reviews.push({
    reviewId,
    userId,
    rating,
    comment: comment || '',
    date: new Date()
  });

  flight.updateRating();
  await flight.save();

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: { review: flight.reviews[flight.reviews.length - 1] }
  });
});

/**
 * Get flight reviews
 */
const getReviews = asyncHandler(async (req, res) => {
  const { flightId } = req.params;

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  res.json({
    success: true,
    count: flight.reviews.length,
    data: { reviews: flight.reviews }
  });
});

module.exports = {
  getFlight,
  createFlight,
  updateFlight,
  deleteFlight,
  addReview,
  getReviews
};

