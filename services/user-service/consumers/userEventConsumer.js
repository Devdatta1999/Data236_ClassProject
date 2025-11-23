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

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ userId }, { email }] });
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
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message
        }
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

    // Check cache first
    const cacheKey = `user:email:${email.toLowerCase()}`;
    let user = await getCache(cacheKey);

    if (!user) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        throw new ValidationError('Invalid credentials');
      }
      // Cache user data (without password)
      await setCache(cacheKey, user.toSafeObject(), 900);
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

    logger.info(`User logged in via Kafka: ${user.userId}`);

    // Send response
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
    
    await sendMessage('user-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'user.login',
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message
        }
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

