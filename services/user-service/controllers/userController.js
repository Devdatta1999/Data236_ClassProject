/**
 * User Controller
 */

const User = require('../models/User');
const { 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  asyncHandler 
} = require('../../../shared/utils/errors');
const {
  validateSSN,
  validateState,
  validateZipCode,
  validateEmail,
  validatePhoneNumber
} = require('../../../shared/utils/validators');
const { generateToken } = require('../../../shared/middleware/auth');
const { getCache, setCache, deleteCache } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * User Controller
 * Note: User registration and login are handled via Kafka (user-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

/**
 * Get user details
 */
const getUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check cache
  const cacheKey = `user:${userId}`;
  let user = await getCache(cacheKey);

  if (!user) {
    user = await User.findOne({ userId });
    if (!user) {
      throw new NotFoundError('User');
    }
    // Cache user data
    await setCache(cacheKey, user.toSafeObject(), 3600); // 1 hour
  }

  res.json({
    success: true,
    data: { user }
  });
});

/**
 * Update user information
 */
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Validate state if provided
  if (updates.state) {
    validateState(updates.state);
    updates.state = updates.state.toUpperCase();
  }

  // Validate zip code if provided
  if (updates.zipCode) {
    validateZipCode(updates.zipCode);
  }

  // Validate email if provided
  if (updates.email) {
    validateEmail(updates.email);
    updates.email = updates.email.toLowerCase();
    
    // Check if email is already taken
    const existingUser = await User.findOne({ 
      email: updates.email,
      userId: { $ne: userId }
    });
    if (existingUser) {
      throw new ConflictError('Email already in use');
    }
  }

  // Validate phone if provided
  if (updates.phoneNumber) {
    validatePhoneNumber(updates.phoneNumber);
  }

  // Update user
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      user[key] = updates[key];
    }
  });

  user.updatedAt = new Date();
  await user.save();

  // Invalidate cache
  await deleteCache(`user:${userId}`);
  await deleteCache(`user:email:${user.email}`);

  logger.info(`User updated: ${userId}`);

  res.json({
    success: true,
    message: 'User updated successfully',
    data: { user: user.toSafeObject() }
  });
});

/**
 * Delete user
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  await User.deleteOne({ userId });

  // Invalidate cache
  await deleteCache(`user:${userId}`);
  await deleteCache(`user:email:${user.email}`);

  logger.info(`User deleted: ${userId}`);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

/**
 * Get user booking history
 */
const getBookingHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.query; // Past, Current, Future

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  let bookings = user.bookingHistory;
  if (status) {
    bookings = bookings.filter(b => b.status === status);
  }

  res.json({
    success: true,
    data: { bookings }
  });
});

/**
 * Get user reviews
 */
const getUserReviews = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({
    success: true,
    data: { reviews: user.reviews }
  });
});

module.exports = {
  getUser,
  updateUser,
  deleteUser,
  getBookingHistory,
  getUserReviews
};

