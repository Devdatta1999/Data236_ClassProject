/**
 * Car Controller
 * Note: Car search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Car = require('../models/Car');
const { NotFoundError, ValidationError, asyncHandler } = require('../../../shared/utils/errors');
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

  const car = new Car({
    ...carData,
    status: 'Pending'
  });

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
 */
const deleteCar = asyncHandler(async (req, res) => {
  const { carId } = req.params;

  const car = await Car.findOne({ carId });
  if (!car) {
    throw new NotFoundError('Car');
  }

  await Car.deleteOne({ carId });

  await deleteCache(`car:${carId}`);
  await deleteCachePattern('search:car:*');

  logger.info(`Car deleted: ${carId}`);

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
  createCar,
  updateCar,
  deleteCar,
  addReview,
  getReviews
};

