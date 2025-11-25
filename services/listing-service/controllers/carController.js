/**
 * Car Controller
 * Note: Car search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Car = require('../models/Car');
const { NotFoundError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

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
  
  // Ensure dates are properly formatted
  const car = new Car({
    ...carData,
    availableFrom: carData.availableFrom ? new Date(carData.availableFrom) : undefined,
    availableTo: carData.availableTo ? new Date(carData.availableTo) : undefined,
    status
  });
  
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
  const { userId, rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  car.reviews.push({
    reviewId,
    userId,
    rating,
    comment: comment || '',
    date: new Date()
  });

  car.updateRating();
  await car.save();

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

