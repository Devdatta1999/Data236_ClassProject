/**
 * Hotel Controller
 * Note: Hotel search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Hotel = require('../models/Hotel');
const { NotFoundError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * Get hotel by ID
 */
const getHotel = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;

  const cacheKey = `hotel:${hotelId}`;
  let hotel = await getCache(cacheKey);

  if (!hotel) {
    hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      throw new NotFoundError('Hotel');
    }
    await setCache(cacheKey, hotel, 3600);
  }

  res.json({
    success: true,
    data: { hotel }
  });
});

/**
 * Create hotel
 */
const createHotel = asyncHandler(async (req, res) => {
  const hotelData = req.body;

  const existing = await Hotel.findOne({ hotelId: hotelData.hotelId });
  if (existing) {
    throw new ValidationError('Hotel with this ID already exists');
  }

  // Allow admin to set status to 'Active', otherwise default to 'Pending'
  const status = (req.user?.role === 'admin' && hotelData.status === 'Active') 
    ? 'Active' 
    : 'Pending';
  
  const hotel = new Hotel({
    ...hotelData,
    state: hotelData.state.toUpperCase(),
    status
  });

  await hotel.save();

  await deleteCachePattern('search:hotel:*');

  logger.info(`Hotel created: ${hotel.hotelId}`);

  res.status(201).json({
    success: true,
    message: 'Hotel created successfully',
    data: { hotel }
  });
});

/**
 * Update hotel
 */
const updateHotel = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const updates = req.body;

  const hotel = await Hotel.findOne({ hotelId });
  if (!hotel) {
    throw new NotFoundError('Hotel');
  }

  if (updates.state) updates.state = updates.state.toUpperCase();

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'hotelId') {
      hotel[key] = updates[key];
    }
  });

  hotel.updatedAt = new Date();
  await hotel.save();

  await deleteCache(`hotel:${hotelId}`);
  await deleteCachePattern('search:hotel:*');

  res.json({
    success: true,
    message: 'Hotel updated successfully',
    data: { hotel }
  });
});

/**
 * Delete hotel
 * Allows admin or the owner (provider) to delete
 */
const deleteHotel = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const user = req.user; // From auth middleware

  const hotel = await Hotel.findOne({ hotelId });
  if (!hotel) {
    throw new NotFoundError('Hotel');
  }

  // Check if user is admin OR the owner of the listing
  const isAdmin = user.role === 'admin';
  const isOwner = user.role === 'provider' && user.providerId === hotel.providerId;

  if (!isAdmin && !isOwner) {
    throw new AuthenticationError('You do not have permission to delete this listing');
  }

  await Hotel.deleteOne({ hotelId });

  await deleteCache(`hotel:${hotelId}`);
  await deleteCachePattern('search:hotel:*');

  logger.info(`Hotel deleted: ${hotelId} by ${isAdmin ? 'admin' : 'provider'}`);

  res.json({
    success: true,
    message: 'Hotel deleted successfully'
  });
});

/**
 * Add review to hotel
 */
const addReview = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { userId, rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const hotel = await Hotel.findOne({ hotelId });
  if (!hotel) {
    throw new NotFoundError('Hotel');
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  hotel.reviews.push({
    reviewId,
    userId,
    rating,
    comment: comment || '',
    date: new Date()
  });

  hotel.updateRating();
  await hotel.save();

  await deleteCache(`hotel:${hotelId}`);
  await deleteCachePattern('search:hotel:*');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: { review: hotel.reviews[hotel.reviews.length - 1] }
  });
});

/**
 * Get hotels by providerId
 */
const getHotelsByProvider = asyncHandler(async (req, res) => {
  const { providerId } = req.query;
  const user = req.user; // From auth middleware

  if (!providerId) {
    throw new ValidationError('Provider ID is required');
  }

  // Check if user is admin OR the owner of the listings
  const isAdmin = user?.role === 'admin';
  const isOwner = user?.role === 'provider' && user.providerId === providerId;

  if (!isAdmin && !isOwner) {
    throw new AuthenticationError('You do not have permission to view these listings');
  }

  const hotels = await Hotel.find({ providerId }).lean();

  res.json({
    success: true,
    data: { hotels }
  });
});

/**
 * Get hotel reviews
 */
const getReviews = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;

  const hotel = await Hotel.findOne({ hotelId });
  if (!hotel) {
    throw new NotFoundError('Hotel');
  }

  res.json({
    success: true,
    count: hotel.reviews.length,
    data: { reviews: hotel.reviews }
  });
});

module.exports = {
  getHotel,
  getHotelsByProvider,
  createHotel,
  updateHotel,
  deleteHotel,
  addReview,
  getReviews
};

