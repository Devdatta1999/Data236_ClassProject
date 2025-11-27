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
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * User Controller
 * Note: User registration and login can be handled via Kafka (user-events topic) or HTTP
 * HTTP endpoints are provided as a fallback and for reliability
 */

/**
 * User login (HTTP endpoint)
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Always fetch from database for login to get password hash
  const { waitForMongoDBReady } = require('../../../shared/config/database');
  await waitForMongoDBReady(2000);

  // Fetch user with password field included, excluding soft-deleted users
  const user = await User.findOne({ 
    email: email.toLowerCase(),
    isDeleted: { $ne: true }
  }).select('+password').maxTimeMS(5000);
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

  // Update cache asynchronously (fire-and-forget)
  const cacheKey = `user:email:${email.toLowerCase()}`;
  setCache(cacheKey, user.toSafeObject(), 900).catch(err => {
    logger.warn('Cache update failed (non-critical):', err.message);
  });

  logger.info(`User logged in via HTTP: ${user.userId}`);

  res.json({
    success: true,
    data: {
      user: user.toSafeObject(),
      token
    }
  });
});

/**
 * User signup (HTTP endpoint)
 */
const signup = asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, userId, phoneNumber, address, city, state, zipCode, ssn, profileImage } = req.body;

  // Validation
  if (!email || !password || !firstName || !lastName || !userId || !phoneNumber || !address || !city || !state || !zipCode || !ssn) {
    throw new ValidationError('All fields are required');
  }

  validateEmail(email);
  validatePhoneNumber(phoneNumber);
  validateState(state);
  validateZipCode(zipCode);
  validateSSN(ssn);

  // Check if user already exists (excluding soft-deleted users)
  const existingUser = await User.findOne({
    $or: [
      { email: email.toLowerCase(), isDeleted: { $ne: true } },
      { userId, isDeleted: { $ne: true } }
    ]
  });

  if (existingUser) {
    if (existingUser.email === email.toLowerCase()) {
      throw new ConflictError('User with this email already exists');
    }
    if (existingUser.userId === userId) {
      throw new ConflictError('User with this SSN already exists');
    }
  }

  // Create new user
  const user = new User({
    email: email.toLowerCase(),
    password,
    firstName,
    lastName,
    userId,
    phoneNumber,
    address,
    city,
    state,
    zipCode,
    ssn,
    profileImage: profileImage || null
  });

  await user.save();

  const token = generateToken({
    userId: user.userId,
    email: user.email,
    role: 'user'
  });

  logger.info(`User registered via HTTP: ${user.userId}`);

  res.status(201).json({
    success: true,
    data: {
      user: user.toSafeObject(),
      token
    }
  });
});

/**
 * Get user details
 */
const getUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check cache
  const cacheKey = `user:${userId}`;
  let user = await getCache(cacheKey);

  if (!user) {
    const userDoc = await User.findOne({ 
      userId,
      isDeleted: { $ne: true }
    });
    if (!userDoc) {
      throw new NotFoundError('User');
    }
    // Always use toSafeObject() to mask encrypted card numbers
    user = userDoc.toSafeObject();
    // Cache the safe version (already masked)
    await setCache(cacheKey, user, 3600); // 1 hour
  }

  res.json({
    success: true,
    data: { user } // Always safe - cards are masked
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

  const oldUserId = user.userId;
  const oldEmail = user.email;

  // Validate userId if provided (SSN format)
  if (updates.userId && updates.userId !== userId) {
    validateSSN(updates.userId);
    
    // Check if new userId is already taken
    const existingUser = await User.findOne({ userId: updates.userId });
    if (existingUser) {
      throw new ConflictError('User ID already in use');
    }
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
  if (updates.email && updates.email !== oldEmail) {
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
    if (updates[key] !== undefined && key !== 'password') { // Don't allow password update via this endpoint
      user[key] = updates[key];
    }
  });

  user.updatedAt = new Date();
  await user.save();

  // Invalidate cache for both old and new userId/email
  await deleteCache(`user:${oldUserId}`);
  if (updates.userId && updates.userId !== oldUserId) {
    await deleteCache(`user:${updates.userId}`);
  }
  await deleteCache(`user:email:${oldEmail}`);
  if (updates.email && updates.email !== oldEmail) {
    await deleteCache(`user:email:${updates.email}`);
  }

  logger.info(`User updated: ${oldUserId}${updates.userId && updates.userId !== oldUserId ? ` -> ${updates.userId}` : ''}`);

  res.json({
    success: true,
    message: 'User updated successfully',
    data: { user: user.toSafeObject() }
  });
});

/**
 * Delete user (soft delete)
 * Marks user as deleted but preserves all related data (bookings, reviews, etc.)
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUserId = req.user?.userId; // From authentication middleware

  // Verify user can only delete their own profile
  if (requestingUserId !== userId) {
    throw new ValidationError('You can only delete your own profile');
  }

  const user = await User.findOne({ userId, isDeleted: { $ne: true } });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Soft delete: Mark as deleted instead of removing from database
  user.isDeleted = true;
  user.deletedAt = new Date();
  // Anonymize sensitive data while keeping referential integrity
  user.email = `deleted_${Date.now()}_${user.userId}@deleted.local`;
  user.password = `deleted_${Date.now()}`; // Invalidate password
  user.savedCreditCards = []; // Clear credit cards for security
  await user.save();

  // Invalidate cache
  await deleteCache(`user:${userId}`);
  await deleteCachePattern(`user:${userId}:*`);
  await deleteCache(`user:email:${user.email}`);

  logger.info(`User soft-deleted: ${userId}`);

  res.json({
    success: true,
    message: 'Your profile has been deleted successfully'
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

/**
 * Add review to user document (called by listing service)
 */
const addUserReview = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reviewId, bookingId, listingId, listingType, rating, comment } = req.body;

  if (!reviewId || !listingId || !listingType || !rating || rating < 1 || rating > 5) {
    throw new ValidationError('reviewId, listingId, listingType, and valid rating (1-5) are required');
  }

  // bookingId is optional for backward compatibility with old reviews

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Check if review already exists (prevent duplicates)
  const existingReview = user.reviews.find(r => r.reviewId === reviewId);
  if (existingReview) {
    logger.warn(`Review ${reviewId} already exists for user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Review already exists',
      data: { review: existingReview }
    });
  }

  user.reviews.push({
    reviewId,
    bookingId: bookingId || null, // Allow null for backward compatibility
    listingId,
    listingType,
    rating,
    comment: comment || '',
    date: new Date()
  });

  await user.save();

  // Invalidate cache
  await deleteCache(`user:${userId}`);

  logger.info(`Review added to user document: ${userId}, booking: ${bookingId}, listing: ${listingId}`);

  res.status(201).json({
    success: true,
    message: 'Review added to user document successfully',
    data: { review: user.reviews[user.reviews.length - 1] }
  });
});

/**
 * Add saved credit card
 */
const addSavedCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { cardNumber, cardHolderName, expiryDate, zipCode } = req.body;

  if (!cardNumber || !cardHolderName || !expiryDate || !zipCode) {
    throw new ValidationError('Card number, holder name, expiry date, and ZIP code are required');
  }

  // Validate ZIP code format
  validateZipCode(zipCode);

  // Validate expiry date format (MM/YY)
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate)) {
    throw new ValidationError('Expiry date must be in MM/YY format');
  }

  // Validate card number (remove spaces)
  const cleanCardNumber = cardNumber.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
    throw new ValidationError('Invalid card number');
  }

  // Common test card numbers that are allowed for development/testing
  const testCardNumbers = [
    '1111111111111111', // Common test number
    '4111111111111111', // Visa test card
    '5555555555554444', // Mastercard test card
    '4242424242424242', // Visa test card
    '4000000000000002', // Visa test card (declined)
    '4000000000009995', // Visa test card (insufficient funds)
  ];

  // Check if it's a test card number (allow in all environments for testing)
  const isTestCard = testCardNumbers.includes(cleanCardNumber);

  // Luhn algorithm validation for card number (skip for test cards)
  if (!isTestCard) {
    let sum = 0;
    let isEven = false;
    for (let i = cleanCardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanCardNumber[i]);
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    if (sum % 10 !== 0) {
      throw new ValidationError('Invalid card number (checksum failed). For testing, you can use: 4111 1111 1111 1111 or 5555 5555 5555 4444');
    }
  }

  // Check if expiry date is in the past
  const [month, year] = expiryDate.split('/');
  const expiryYear = 2000 + parseInt(year);
  const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
  const now = new Date();
  if (expiryDateObj < now) {
    throw new ValidationError('Card has expired');
  }

  // Validate card holder name (should not be empty, reasonable length)
  const trimmedName = cardHolderName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw new ValidationError('Card holder name must be between 2 and 100 characters');
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Check if card already exists (by last 4 digits and expiry)
  const last4Digits = cleanCardNumber.slice(-4);
  const existingCard = user.savedCreditCards.find(
    (c) => c.last4Digits === last4Digits && c.expiryDate === expiryDate
  );
  if (existingCard) {
    throw new ConflictError('This card is already saved');
  }

  // Generate unique card ID
  const cardId = `CARD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Add card to saved cards array (will be encrypted by pre-save hook)
  // Mark as new so pre-save hook knows to encrypt it
  const newCard = {
    cardId,
    cardNumber: cleanCardNumber,
    cardHolderName: trimmedName,
    expiryDate,
    last4Digits,
    zipCode: zipCode.trim(), // Ensure ZIP code is trimmed and saved
    isNew: true
  };

  logger.info(`Adding new card for user ${userId}`, { 
    cardId, 
    zipCode: newCard.zipCode,
    last4Digits: newCard.last4Digits 
  });

  user.savedCreditCards.push(newCard);

  await user.save();

  // Verify ZIP code was saved
  const savedUser = await User.findOne({ userId });
  const savedCard = savedUser.savedCreditCards.find(c => c.cardId === cardId);
  if (!savedCard || !savedCard.zipCode) {
    logger.error(`ZIP code was not saved for card ${cardId}`);
    throw new Error('Failed to save ZIP code. Please try again.');
  }
  logger.info(`Card saved successfully with ZIP code: ${savedCard.zipCode}`);

  // Invalidate cache
  await deleteCache(`user:${userId}`);

  logger.info(`Credit card added for user: ${userId}`, { cardId });

  res.json({
    success: true,
    message: 'Credit card saved successfully',
    data: {
      card: {
        cardId,
        cardHolderName,
        expiryDate,
        last4Digits,
        zipCode,
        cardNumber: `****-****-****-${last4Digits}`
      }
    }
  });
});

/**
 * Get saved credit cards
 */
const getSavedCards = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Explicitly select savedCreditCards field (since cardNumber has select: false)
  const user = await User.findOne({ userId }).select('+savedCreditCards');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Return safe object (masked cards) - never expose encrypted card numbers
  const safeCards = (user.savedCreditCards || []).map((card) => ({
             cardId: card.cardId,
             cardHolderName: card.cardHolderName,
             expiryDate: card.expiryDate,
             last4Digits: card.last4Digits,
             zipCode: card.zipCode, // Include ZIP for payment validation
             cardNumber: `****-****-****-${card.last4Digits}`,
             addedAt: card.addedAt
           }));

  res.json({
    success: true,
    data: { cards: safeCards }
  });
});

/**
 * Get decrypted card for payment (requires authentication)
 * NOTE: For security, we don't return full decrypted card to frontend
 * Frontend should send cardId and CVV for payment validation
 */
const getDecryptedCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { cardId } = req.query;

  if (!cardId) {
    throw new ValidationError('Card ID is required');
  }

  const user = await User.findOne({ userId }).select('+savedCreditCards');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify user owns this card
  const card = user.savedCreditCards.find((c) => c.cardId === cardId);
  if (!card) {
    throw new NotFoundError('Credit card');
  }

  // Return card info (masked) - actual decryption happens server-side during payment processing
  // For security, we don't send full card number to frontend
  res.json({
    success: true,
    data: {
      card: {
        cardId: card.cardId,
        cardHolderName: card.cardHolderName,
        expiryDate: card.expiryDate,
        last4Digits: card.last4Digits,
        cardNumber: `****-****-****-${card.last4Digits}`
      }
    }
  });
});

/**
 * Update saved credit card
 */
const updateSavedCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { cardId, cardNumber, cardHolderName, expiryDate, zipCode } = req.body;

  if (!cardId) {
    throw new ValidationError('Card ID is required');
  }

  if (!cardNumber || !cardHolderName || !expiryDate || !zipCode) {
    throw new ValidationError('Card number, holder name, expiry date, and ZIP code are required');
  }

  // Validate ZIP code format
  validateZipCode(zipCode);

  // Validate expiry date format (MM/YY)
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate)) {
    throw new ValidationError('Expiry date must be in MM/YY format');
  }

  // Validate card number (remove spaces)
  const cleanCardNumber = cardNumber.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
    throw new ValidationError('Invalid card number');
  }

  // Luhn algorithm validation for card number (allow test cards)
  const testCardNumbers = [
    '1111111111111111',
    '4111111111111111',
    '5555555555554444',
    '4242424242424242',
    '4000000000000002',
    '4000000000009995',
  ];
  const isTestCard = testCardNumbers.includes(cleanCardNumber);

  if (!isTestCard) {
    let sum = 0;
    let isEven = false;
    for (let i = cleanCardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanCardNumber[i]);
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    if (sum % 10 !== 0) {
      throw new ValidationError('Invalid card number (checksum failed). For testing, you can use: 4111 1111 1111 1111 or 5555 5555 5555 4444');
    }
  }

  // Check if expiry date is in the past
  const [month, year] = expiryDate.split('/');
  const expiryYear = 2000 + parseInt(year);
  const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
  const now = new Date();
  if (expiryDateObj < now) {
    throw new ValidationError('Card has expired');
  }

  // Validate card holder name (should not be empty, reasonable length)
  const trimmedName = cardHolderName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw new ValidationError('Card holder name must be between 2 and 100 characters');
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Find the card to update
  const cardIndex = user.savedCreditCards.findIndex((c) => c.cardId === cardId);
  if (cardIndex === -1) {
    throw new NotFoundError('Credit card');
  }

  const card = user.savedCreditCards[cardIndex];
  const last4Digits = cleanCardNumber.slice(-4);

  // Update card details
  user.savedCreditCards[cardIndex].cardNumber = cleanCardNumber; // Will be encrypted by pre-save hook
  user.savedCreditCards[cardIndex].cardHolderName = trimmedName;
  user.savedCreditCards[cardIndex].expiryDate = expiryDate;
  user.savedCreditCards[cardIndex].zipCode = zipCode.trim();
  user.savedCreditCards[cardIndex].last4Digits = last4Digits;
  user.savedCreditCards[cardIndex].isNew = true; // Mark as new so pre-save hook encrypts it

  await user.save();

  // Verify card was updated
  const savedUser = await User.findOne({ userId });
  const savedCard = savedUser.savedCreditCards.find(c => c.cardId === cardId);
  if (!savedCard || !savedCard.zipCode) {
    logger.error(`ZIP code was not saved for card ${cardId}`);
    throw new Error('Failed to save ZIP code. Please try again.');
  }

  // Invalidate cache
  await deleteCache(`user:${userId}`);

  logger.info(`Credit card updated for user: ${userId}`, { cardId });

  res.json({
    success: true,
    message: 'Credit card updated successfully',
    data: {
      card: {
        cardId: savedCard.cardId,
        cardHolderName: savedCard.cardHolderName,
        expiryDate: savedCard.expiryDate,
        last4Digits: savedCard.last4Digits,
        zipCode: savedCard.zipCode,
        cardNumber: `****-****-****-${savedCard.last4Digits}`
      }
    }
  });
});

/**
 * Delete saved credit card
 */
const deleteSavedCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { cardId } = req.body;

  if (!cardId) {
    throw new ValidationError('Card ID is required');
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new NotFoundError('User');
  }

  const cardIndex = user.savedCreditCards.findIndex((c) => c.cardId === cardId);
  if (cardIndex === -1) {
    throw new NotFoundError('Credit card');
  }

  // Remove the card from the array
  user.savedCreditCards.splice(cardIndex, 1);
  
  // Use direct MongoDB update to avoid validation issues with old cards missing zipCode
  // This prevents validation errors when deleting cards if remaining cards don't have zipCode
  await User.updateOne(
    { userId },
    { 
      $pull: { savedCreditCards: { cardId } },
      $set: { updatedAt: new Date() }
    }
  );

  // Invalidate cache
  await deleteCache(`user:${userId}`);

  logger.info(`Credit card deleted for user: ${userId}`, { cardId });

  res.json({
    success: true,
    message: 'Credit card deleted successfully'
  });
});

module.exports = {
  login,
  signup,
  getUser,
  updateUser,
  deleteUser,
  getBookingHistory,
  getUserReviews,
  addUserReview,
  addSavedCard,
  getSavedCards,
  getDecryptedCard,
  updateSavedCard,
  deleteSavedCard
};

