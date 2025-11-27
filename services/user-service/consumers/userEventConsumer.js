/**
 * User Event Consumer - Handles frontend user events via Kafka
 */

const User = require('../models/User');
const { 
  ValidationError, 
  ConflictError 
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
const { sendMessage } = require('../../../shared/config/kafka');
const logger = require('../../../shared/utils/logger');

/**
 * Handle user signup event
 */
async function handleUserSignup(event) {
  const {
    requestId,
    userId,
    firstName,
    lastName,
    address,
    city,
    state,
    zipCode,
    phoneNumber,
    email,
    password,
    profileImage
  } = event;

  try {
    // Validate inputs
    validateSSN(userId);
    validateState(state);
    validateZipCode(zipCode);
    validateEmail(email);
    validatePhoneNumber(phoneNumber);

    // Quick check: only wait if connection is explicitly disconnected
    const { mongoose } = require('../../../shared/config/database');
    if (mongoose.connection.readyState === 0) {
      const { waitForMongoDBReady } = require('../../../shared/config/database');
      await waitForMongoDBReady(2000); // Reduced timeout
    }
    
    // Check if user already exists (excluding soft-deleted users)
    const existingUser = await User.findOne({ 
      $or: [
        { userId, isDeleted: { $ne: true } },
        { email: email.toLowerCase(), isDeleted: { $ne: true } }
      ]
    }).maxTimeMS(2000);
    if (existingUser) {
      throw new ConflictError('User with this ID or email already exists');
    }

    // Create new user
    const user = new User({
      userId,
      firstName,
      lastName,
      address,
      city,
      state: state.toUpperCase(),
      zipCode,
      phoneNumber,
      email: email.toLowerCase(),
      password,
      profileImage: profileImage || null
    });

    await user.save();

    // Invalidate cache
    await deleteCache(`user:${userId}`);
    await deleteCache(`user:email:${email}`);

    const token = generateToken({
      userId: user.userId,
      email: user.email,
      role: 'user'
    });

    logger.info(`User registered via Kafka: ${userId}`);

    // Send response to response topic
    await sendMessage('user-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'user.signup',
        data: {
          user: user.toSafeObject(),
          token
        }
      }
    });

  } catch (error) {
    logger.error(`Error handling user signup: ${error.message}`);
    
    // Send error response
    await sendMessage('user-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'user.signup',
        error: error.message || 'Internal error' // Send error message as string for easier frontend handling
      }
    });
  }
}

/**
 * Handle user login event
 */
async function handleUserLogin(event) {
  const { requestId, email, password } = event;

  try {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Always fetch from database for login to get password hash
    // Cache is not used for login since we need the password field
    // Quick check: only wait if connection is explicitly disconnected
    const { mongoose } = require('../../../shared/config/database');
    if (mongoose.connection.readyState === 0) {
      // Only wait if explicitly disconnected, otherwise proceed (connection might be connecting/connected)
      const { waitForMongoDBReady } = require('../../../shared/config/database');
      await waitForMongoDBReady(2000); // Reduced timeout to 2s
    }
    
    // Fetch user with password field included (select('+password'))
    // Reduced timeout from 15s to 2s for faster failure detection
    // Exclude soft-deleted users
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      isDeleted: { $ne: true }
    }).select('+password').maxTimeMS(2000);
    if (!user) {
      throw new ValidationError('Invalid credentials');
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new ValidationError('Invalid credentials');
    }

    const token = generateToken({
      userId: user.userId,
      email: user.email,
      role: 'user'
    });

    // Update cache asynchronously (fire-and-forget) to not block response
    const cacheKey = `user:email:${email.toLowerCase()}`;
    setCache(cacheKey, user.toSafeObject(), 900).catch(err => {
      logger.warn('Cache update failed (non-critical):', err.message);
    });

    logger.info(`User logged in via Kafka: ${user.userId}`);

    // Send response immediately (don't wait for cache)
    await sendMessage('user-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'user.login',
        data: {
          user: user.toSafeObject(),
          token
        }
      }
    });

  } catch (error) {
    logger.error(`Error handling user login: ${error.message}`);
    
    // Send error as a simple string message for easier frontend handling
    const errorMessage = error.message || 'Internal error';
    await sendMessage('user-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'user.login',
        error: errorMessage
      }
    });
  }
}

/**
 * Kafka message handler
 */
async function handleUserEvent(topic, message, metadata) {
  try {
    const event = typeof message === 'string' ? JSON.parse(message) : message;
    const { eventType } = event;

    logger.info(`Received user event: ${eventType}`, { requestId: event.requestId });

    switch (eventType) {
      case 'user.signup':
        await handleUserSignup(event);
        break;
      case 'user.login':
        await handleUserLogin(event);
        break;
      default:
        logger.warn(`Unknown user event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`Error processing user event: ${error.message}`, error);
  }
}

module.exports = {
  handleUserEvent
};

