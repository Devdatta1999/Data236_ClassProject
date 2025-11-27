/**
 * Car Controller
 * Note: Car search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Car = require('../models/Car');
const { NotFoundError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://aerive-user-service:3001';
const PROVIDER_SERVICE_URL = process.env.PROVIDER_SERVICE_URL || 'http://aerive-provider-service:3005';

/**
 * Get car by ID
 */
const getCar = asyncHandler(async (req, res) => {
  const { carId } = req.params;

  const cacheKey = `car:${carId}`;
  let car = await getCache(cacheKey);

  if (!car) {
    car = await Car.findOne({ carId });
    if (!car) {
      throw new NotFoundError('Car');
    }
    await setCache(cacheKey, car, 3600);
  }

  res.json({
    success: true,
    data: { car }
  });
});

/**
 * Create car
 */
const createCar = asyncHandler(async (req, res) => {
  const carData = req.body;

  const existing = await Car.findOne({ carId: carData.carId });
  if (existing) {
    throw new ValidationError('Car with this ID already exists');
  }

  // Allow admin to set status to 'Active', otherwise default to 'Pending'
  const status = (req.user?.role === 'admin' && carData.status === 'Active') 
    ? 'Active' 
    : 'Pending';
  
  // Fetch provider's profile image if not provided and providerId exists
  let image = carData.image;
  if (!image && carData.providerId) {
    try {
      const providerResponse = await axios.get(`${PROVIDER_SERVICE_URL}/api/providers/${carData.providerId}`, {
        headers: {
          'Authorization': req.headers.authorization || req.headers.Authorization || ''
        },
        timeout: 5000
      });
      image = providerResponse.data.data?.provider?.profileImage || null;
      logger.info(`Fetched provider profile image for car ${carData.carId}: ${image ? 'found' : 'not found'}`, {
        providerId: carData.providerId,
        imageUrl: image
      });
    } catch (err) {
      logger.warn(`Failed to fetch provider profile image for car ${carData.carId}: ${err.message}`, {
        providerId: carData.providerId,
        error: err.message
      });
      // Continue without image if fetch fails
      image = null;
    }
  }
  
  logger.info(`Creating car ${carData.carId} with image: ${image || 'none'}`, {
    carId: carData.carId,
    providerId: carData.providerId,
    imageFromRequest: carData.image,
    finalImage: image
  });
  
  // Build car object, ensuring image is set correctly
  const carObj = {
    ...carData,
    availableFrom: carData.availableFrom ? new Date(carData.availableFrom) : undefined,
    availableTo: carData.availableTo ? new Date(carData.availableTo) : undefined,
    status
  };
  
  // Explicitly set image field (after spread to ensure it's not overwritten)
  if (image) {
    carObj.image = image;
  } else {
    carObj.image = null;
  }
  
  const car = new Car(carObj);
  
  // Validate date range
  if (car.availableFrom && car.availableTo && car.availableFrom >= car.availableTo) {
    throw new ValidationError('Available To date must be after Available From date');
  }

  await car.save();

  await deleteCachePattern('search:car:*');

  logger.info(`Car created: ${car.carId}`);

  res.status(201).json({
    success: true,
    message: 'Car created successfully',
    data: { car }
  });
});

/**
 * Update car
 */
const updateCar = asyncHandler(async (req, res) => {
  const { carId } = req.params;
  const updates = req.body;

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'carId') {
      car[key] = updates[key];
    }
  });

  car.updatedAt = new Date();
  await car.save();

  await deleteCache(`car:${carId}`);
  await deleteCachePattern('search:car:*');

  res.json({
    success: true,
    message: 'Car updated successfully',
    data: { car }
  });
});

/**
 * Delete car
 * Allows admin or the owner (provider) to delete
 */
const deleteCar = asyncHandler(async (req, res) => {
  const { carId } = req.params;
  const user = req.user; // From auth middleware

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  // Check if user is admin OR the owner of the listing
  const isAdmin = user.role === 'admin';
  const isOwner = user.role === 'provider' && user.providerId === car.providerId;

  if (!isAdmin && !isOwner) {
    throw new AuthenticationError('You do not have permission to delete this listing');
  }

  await Car.deleteOne({ carId });

  await deleteCache(`car:${carId}`);
  await deleteCachePattern('search:car:*');

  logger.info(`Car deleted: ${carId} by ${isAdmin ? 'admin' : 'provider'}`);

  res.json({
    success: true,
    message: 'Car deleted successfully'
  });
});

/**
 * Add review to car
 */
const addReview = asyncHandler(async (req, res) => {
  const { carId } = req.params;
  const { userId, bookingId, rating, comment } = req.body;

  if (!bookingId) {
    throw new ValidationError('bookingId is required to submit a review');
  }

  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const reviewData = {
    reviewId,
    userId,
    rating,
    comment: comment || '',
    date: new Date()
  };
  
  // Add review to car
  car.reviews.push(reviewData);
  car.updateRating();
  await car.save();

  // Also save review to user document via HTTP call to user service
  try {
    const userReviewResponse = await axios.post(`${USER_SERVICE_URL}/api/users/${userId}/reviews`, {
      reviewId,
      bookingId,
      listingId: carId,
      listingType: 'Car',
      rating,
      comment: comment || ''
    }, {
      timeout: 5000 // 5 second timeout
    });
    logger.info(`Review saved to user document: ${userId}, booking: ${bookingId || 'N/A'}, reviewId: ${reviewId}`);
  } catch (userError) {
    logger.error(`Error saving review to user document: ${userError.message}`, {
      userId,
      bookingId,
      listingId: carId,
      reviewId,
      status: userError.response?.status,
      data: userError.response?.data
    });
    // Don't fail the request if user save fails - listing review is already saved
    // But log detailed error for debugging
  }

  await deleteCache(`car:${carId}`);
  await deleteCachePattern('search:car:*');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: { review: car.reviews[car.reviews.length - 1] }
  });
});

/**
 * Get cars by providerId
 */
const getCarsByProvider = asyncHandler(async (req, res) => {
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

  const cars = await Car.find({ providerId }).lean();

  res.json({
    success: true,
    data: { cars }
  });
});

/**
 * Get car reviews
 */
const getReviews = asyncHandler(async (req, res) => {
  const { carId } = req.params;

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  res.json({
    success: true,
    count: car.reviews.length,
    data: { reviews: car.reviews }
  });
});

module.exports = {
  getCar,
  getCarsByProvider,
  createCar,
  updateCar,
  deleteCar,
  addReview,
  getReviews
};

