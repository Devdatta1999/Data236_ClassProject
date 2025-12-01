/**
 * Billing Event Consumer - Handles frontend checkout and payment events via Kafka
 */

const { getPostgresPool, mongoose } = require('../../../shared/config/database');
const { NotFoundError, ValidationError, TransactionError } = require('../../../shared/utils/errors');
const { sendMessage } = require('../../../shared/config/kafka');
const { validateZipCode } = require('../../../shared/utils/validators');
const { decrypt } = require('../../../shared/utils/encryption');
const { deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';

// Define Booking schema inline for direct MongoDB queries (service-to-service)
// This avoids needing to import from booking-service
const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  listingId: { type: String, required: true, index: true },
  listingType: { type: String, enum: ['Flight', 'Hotel', 'Car'], required: true, index: true },
  bookingDate: { type: Date, required: true, default: Date.now },
  checkInDate: { type: Date, default: null },
  checkOutDate: { type: Date, default: null },
  travelDate: { type: Date, default: null },
  quantity: { type: Number, required: true, min: 1 },
  roomType: { type: String, default: null }, // For hotels: room types; For flights: seat types
  totalAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Confirmed', 'Pending', 'Cancelled', 'Failed'], default: 'Pending', index: true },
  billingId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Get or create Booking model (will use existing if already registered)
// IMPORTANT: Use the same collection name as booking-service ('bookings')
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema, 'bookings');

// Define User schema inline for direct MongoDB queries (service-to-service)
// This avoids authentication issues with HTTP endpoints
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  savedCreditCards: [{
    cardId: { type: String, required: true },
    cardNumber: { type: String, required: true }, // Encrypted
    cardHolderName: { type: String, required: true },
    expiryDate: { type: String, required: true },
    last4Digits: { type: String, required: true },
    zipCode: { type: String, required: true }, // ZIP code for validation
    addedAt: { type: Date, default: Date.now }
  }]
}, {
  collection: 'users', // Use the same collection name as user-service
  strict: false // Allow additional fields that may be in the collection
});

// Get or create User model (will use existing if already registered)
const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

// Store pending checkout requests to match with booking responses
const pendingCheckouts = new Map();

/**
 * Handle checkout initiation event (cart checkout)
 * Publishes booking.create events for each cart item
 */
async function handleCheckoutInitiate(event) {
  logger.info(`[handleCheckoutInitiate] Starting checkout initiation`, {
    requestId: event.requestId,
    userId: event.userId,
    cartItemsCount: event.cartItems ? event.cartItems.length : 0
  });

  const {
    requestId,
    userId,
    cartItems // Array of { listingId, listingType, quantity, dates, etc. }
  } = event;

  try {
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new ValidationError('Cart items are required');
    }

    // Generate checkout ID
    const checkoutId = `CHECKOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Before creating new bookings, mark any existing Pending bookings for these items as Failed
    // This prevents abandoned checkouts from blocking new bookings
    try {
      const expiryTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      
      for (const item of cartItems) {
        const existingPendingBookings = await Booking.find({
          userId,
          listingId: item.listingId,
          listingType: item.listingType,
          status: 'Pending',
          createdAt: { $lt: expiryTime }
        });

        if (existingPendingBookings.length > 0) {
          logger.info(`Marking ${existingPendingBookings.length} old Pending booking(s) as Failed for listing ${item.listingId}`);
          for (const oldBooking of existingPendingBookings) {
            oldBooking.status = 'Failed';
            oldBooking.updatedAt = new Date();
            await oldBooking.save();
            logger.info(`Marked old booking as Failed: ${oldBooking.bookingId}`);
          }
        }
      }
    } catch (cleanupError) {
      logger.warn(`Failed to clean up old pending bookings: ${cleanupError.message}`);
      // Continue with checkout even if cleanup fails
    }

    // Store pending checkout info
    pendingCheckouts.set(requestId, {
      checkoutId,
      userId,
      cartItems,
      bookings: [],
      completed: 0,
      totalItems: cartItems.length
    });

    // Publish booking creation events for each cart item via Kafka
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      // Make bookingRequestId unique for each item (including same hotel with different room types)
      // Use index to ensure uniqueness even if listingId, roomType, and dates are the same
      const uniqueSuffix = item.roomType ? `${item.roomType}-${i}` : item.pickupDate ? `${item.pickupDate}-${i}` : i;
      const bookingRequestId = `${requestId}-${item.listingId}-${uniqueSuffix}`;
      
      // Map date fields: for cars, pickupDate/returnDate map to checkInDate/checkOutDate
      // For hotels, checkInDate/checkOutDate are already correct
      // For flights, travelDate is already correct
      let checkInDate = item.checkInDate;
      let checkOutDate = item.checkOutDate;
      
      if (item.listingType === 'Car') {
        // Cars use pickupDate/returnDate in cart, but booking service expects checkInDate/checkOutDate
        checkInDate = item.pickupDate || item.checkInDate;
        checkOutDate = item.returnDate || item.checkOutDate;
      }
      
      const bookingEvent = {
        requestId: bookingRequestId,
        eventType: 'booking.create',
        userId,
        listingId: item.listingId,
        listingType: item.listingType,
        quantity: item.quantity,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        travelDate: item.travelDate,
        roomType: item.roomType || null, // For hotels - this is critical for multiple room types
        checkoutId, // Include checkout ID for correlation
        parentRequestId: requestId // Link back to checkout request
      };

      logger.info(`[handleCheckoutInitiate] Publishing booking.create event`, {
        bookingRequestId,
        listingId: item.listingId,
        listingType: item.listingType,
        roomType: item.roomType,
        checkInDate,
        checkOutDate,
        quantity: item.quantity
      });

      await sendMessage('booking-events', {
        key: bookingRequestId,
        value: bookingEvent
      });
    }

    logger.info(`Checkout initiated via Kafka: ${checkoutId}`, { 
      userId, 
      itemCount: cartItems.length,
      requestId 
    });

    // Note: Response will be sent after all bookings are created
    // This is handled in the booking response handler

  } catch (error) {
    logger.error(`Error handling checkout initiate: ${error.message}`);
    
    // Clean up pending checkout
    pendingCheckouts.delete(requestId);
    
    await sendMessage('checkout-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'checkout.initiate',
        error: {
          code: error.code || 'CHECKOUT_ERROR',
          message: error.message
        }
      }
    });
  }
}

/**
 * Handle booking response for checkout (called when booking is created)
 * This aggregates booking responses and sends checkout response when all complete
 */
async function handleBookingResponseForCheckout(bookingResponse) {
  const { parentRequestId, checkoutId } = bookingResponse;
  
  if (!parentRequestId || !checkoutId) {
    return; // Not part of a checkout
  }

  const checkout = pendingCheckouts.get(parentRequestId);
  if (!checkout) {
    return; // Checkout not found or already completed
  }

  // Track both successful and failed bookings
  if (bookingResponse.success) {
    checkout.bookings.push(bookingResponse.data.booking);
  } else {
    // Track failed bookings
    if (!checkout.failedBookings) {
      checkout.failedBookings = [];
    }
    checkout.failedBookings.push({
      listingId: bookingResponse.data?.listingId || 'unknown',
      error: bookingResponse.error
    });
  }

  checkout.completed++;

  // If all bookings are complete, send checkout response
  if (checkout.completed === checkout.totalItems) {
    // If any booking failed, fail the entire checkout
    if (checkout.failedBookings && checkout.failedBookings.length > 0) {
      const errorMessages = checkout.failedBookings.map(fb => fb.error?.message || 'Unknown error').join('; ');
      
      await sendMessage('checkout-events-response', {
        key: parentRequestId,
        value: {
          requestId: parentRequestId,
          success: false,
          eventType: 'checkout.initiate',
          error: {
            code: 'CHECKOUT_PARTIAL_FAILURE',
            message: `Some bookings failed: ${errorMessages}`
          }
        }
      });

      // Clean up
      pendingCheckouts.delete(parentRequestId);
      
      logger.error(`Checkout failed: ${checkout.checkoutId}`, {
        userId: checkout.userId,
        failedCount: checkout.failedBookings.length,
        successCount: checkout.bookings.length
      });
      return;
    }

    // All bookings succeeded
    const totalAmount = checkout.bookings.reduce((sum, b) => sum + b.totalAmount, 0);
    
    await sendMessage('checkout-events-response', {
      key: parentRequestId,
      value: {
        requestId: parentRequestId,
        success: true,
        eventType: 'checkout.initiate',
        data: {
          checkoutId: checkout.checkoutId,
          bookings: checkout.bookings,
          totalAmount,
          userId: checkout.userId
        }
      }
    });

    // Clean up
    pendingCheckouts.delete(parentRequestId);
    
    logger.info(`Checkout completed: ${checkout.checkoutId}`, {
      userId: checkout.userId,
      bookingCount: checkout.bookings.length
    });
  }
}

/**
 * Marks bookings as 'Failed' in MongoDB to release inventory
 * This can be called with booking IDs (array of strings) or booking objects
 * Uses HTTP API as primary method, with MongoDB direct update as fallback
 */
async function markBookingsAsFailed(bookingIdsOrBookings) {
  try {
    // Normalize input: if it's booking objects, extract bookingIds
    const bookingIds = Array.isArray(bookingIdsOrBookings) 
      ? bookingIdsOrBookings.map(item => typeof item === 'string' ? item : item.bookingId || item)
      : [bookingIdsOrBookings];

    if (!bookingIds || bookingIds.length === 0) {
      logger.warn('markBookingsAsFailed: No booking IDs provided');
      return { modifiedCount: 0, matchedCount: 0 };
    }

    // Filter out any null/undefined values
    const validBookingIds = bookingIds.filter(id => id != null && id !== '');
    if (validBookingIds.length === 0) {
      logger.warn('markBookingsAsFailed: No valid booking IDs after filtering');
      return { modifiedCount: 0, matchedCount: 0 };
    }

    logger.info(`[markBookingsAsFailed] Attempting to mark ${validBookingIds.length} bookings as Failed: ${validBookingIds.join(', ')}`);

    // METHOD 1: Try HTTP API to booking service first (more reliable)
    try {
      logger.info(`[markBookingsAsFailed] Trying HTTP API call to booking service`);
      const response = await axios.post(
        `${BOOKING_SERVICE_URL}/api/bookings/fail`,
        { bookingIds: validBookingIds },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success) {
        const modifiedCount = response.data.data?.modifiedCount || validBookingIds.length;
        logger.info(`[markBookingsAsFailed] Successfully marked bookings as Failed via HTTP API. Modified: ${modifiedCount}`);
        return { modifiedCount, matchedCount: validBookingIds.length };
      }
    } catch (apiError) {
      logger.warn(`[markBookingsAsFailed] HTTP API call failed: ${apiError.message}. Falling back to direct MongoDB update.`);
    }

    // METHOD 2: Fallback to direct MongoDB update
    logger.info(`[markBookingsAsFailed] Using direct MongoDB update as fallback`);
    
    // Ensure MongoDB connection is ready
    const { waitForMongoDBReady } = require('../../../shared/config/database');
    await waitForMongoDBReady(5000);

    // Verify mongoose connection
    if (mongoose.connection.readyState !== 1) {
      logger.error(`[markBookingsAsFailed] MongoDB not connected! readyState: ${mongoose.connection.readyState}`);
      throw new Error(`MongoDB not connected - readyState: ${mongoose.connection.readyState}`);
    }

    // Verify Booking model exists
    if (!Booking) {
      logger.error(`[markBookingsAsFailed] Booking model not found!`);
      throw new Error('Booking model not found');
    }

    let modifiedCount = 0;
    let matchedCount = 0;

    // Update each booking individually for better reliability
    for (const bookingId of validBookingIds) {
      try {
        // First, check if booking exists and get its current status
        const existingBooking = await Booking.findOne({ bookingId: bookingId });
        
        if (!existingBooking) {
          logger.warn(`[markBookingsAsFailed] Booking ${bookingId} not found in MongoDB`);
          continue;
        }

        if (existingBooking.status === 'Failed') {
          logger.info(`[markBookingsAsFailed] Booking ${bookingId} is already Failed`);
          matchedCount++;
          continue;
        }

        if (existingBooking.status !== 'Pending' && existingBooking.status !== 'Confirmed') {
          logger.warn(`[markBookingsAsFailed] Booking ${bookingId} has status '${existingBooking.status}' (not Pending/Confirmed), skipping`);
          matchedCount++;
          continue;
        }

        // Update the booking
        const result = await Booking.findOneAndUpdate(
          { 
            bookingId: bookingId,
            status: { $in: ['Pending', 'Confirmed'] }
          },
          { 
            $set: { 
              status: 'Failed',
              updatedAt: new Date()
            }
          },
          { new: true, runValidators: false }
        );

        if (result) {
          modifiedCount++;
          logger.info(`[markBookingsAsFailed] ✓ Successfully marked booking ${bookingId} as Failed (was: ${existingBooking.status})`);
        } else {
          // Race condition - booking status changed between findOne and update
          const recheck = await Booking.findOne({ bookingId });
          if (recheck) {
            logger.warn(`[markBookingsAsFailed] Booking ${bookingId} status changed to '${recheck.status}' during update`);
          }
          matchedCount++;
        }
      } catch (bookingError) {
        logger.error(`[markBookingsAsFailed] Failed to mark booking ${bookingId} as Failed: ${bookingError.message}`, bookingError);
        // Continue with other bookings even if one fails
      }
    }

    logger.info(`[markBookingsAsFailed] Summary: Marked ${modifiedCount} booking(s) as Failed, ${matchedCount} matched but not modified, out of ${validBookingIds.length} requested`);

    if (modifiedCount === 0 && matchedCount === 0) {
      logger.error(`[markBookingsAsFailed] CRITICAL: No bookings were marked as Failed! All ${validBookingIds.length} bookings may still be blocking inventory.`);
    }

    return { modifiedCount, matchedCount };
  } catch (error) {
    logger.error(`[markBookingsAsFailed] CRITICAL ERROR: ${error.message}`, error);
    logger.error(`[markBookingsAsFailed] Stack: ${error.stack}`);
    // Don't throw - we want to continue even if marking fails, but log it as critical
    return { modifiedCount: 0, matchedCount: 0, error: error.message };
  }
}

/**
 * Rollback booking status updates (compensation transaction)
 * Marks bookings as 'Failed' instead of 'Pending' to release inventory
 * This is called when payment fails after bookings were confirmed
 */
async function rollbackBookingStatuses(confirmedBookings) {
  return await markBookingsAsFailed(confirmedBookings);
}

/**
 * Handle payment completion event
 */
async function handlePaymentComplete(event) {
  const {
    requestId,
    checkoutId,
    userId,
    bookingIds, // Array of booking IDs from checkout
    paymentMethod,
    billingId
  } = event;

  let pool;
  let client;
  
  try {
    pool = getPostgresPool();
    // Add timeout for connection
    client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PostgreSQL connection timeout after 10s')), 10000)
      )
    ]);
  } catch (connectionError) {
    logger.error(`Failed to connect to PostgreSQL: ${connectionError.message}`);
    throw new Error(`Database connection failed: ${connectionError.message}. Please check Supabase configuration.`);
  }
  
  // Track bookings that have been confirmed (for rollback if needed)
  const confirmedBookings = [];
  let bookings = []; // Initialize outside try block for error handler access

  try {
    await client.query('BEGIN');

    // Get booking details directly from MongoDB (service-to-service call)
    // This avoids authentication issues with HTTP endpoints
    for (const bookingId of bookingIds) {
      try {
        const booking = await Booking.findOne({ bookingId });
        if (!booking) {
          throw new NotFoundError(`Booking ${bookingId}`);
        }
        bookings.push(booking);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        logger.error(`Error fetching booking ${bookingId}: ${error.message}`);
        throw new NotFoundError(`Booking ${bookingId}`);
      }
    }

    // Validate all bookings are in Pending status
    for (const booking of bookings) {
      if (booking.status !== 'Pending') {
        // Mark bookings as Failed before throwing error
        if (bookingIds && bookingIds.length > 0) {
          logger.warn(`Booking ${booking.bookingId} not in Pending status - marking all bookings as Failed`);
          await markBookingsAsFailed(bookingIds).catch(err => {
            logger.error(`Failed to mark bookings as Failed: ${err.message}`);
          });
        }
        throw new ValidationError(`Booking ${booking.bookingId} is not in pending status`);
      }
    }

    // Payment validation
    const { cardData } = event;
    if (!cardData) {
      // Mark bookings as Failed before throwing
      if (bookingIds && bookingIds.length > 0) {
        logger.warn('Card data missing - marking bookings as Failed');
        await markBookingsAsFailed(bookingIds).catch(err => logger.error(`Failed to mark bookings: ${err.message}`));
      }
      throw new ValidationError('Card data is required for payment');
    }

    let paymentValidated = false;
    let decryptedCardNumber = '';
    let cardHolderName = '';
    let expiryDate = '';
    let zipCode = '';

    // Wrap payment validation in try-catch to mark bookings as Failed on any validation error
    try {
      // Validate payment details
      if (cardData.cardId) {
        // Saved card: fetch directly from MongoDB (avoids authentication issues)
        try {
          // Ensure MongoDB connection is ready
          const { waitForMongoDBReady } = require('../../../shared/config/database');
          await waitForMongoDBReady(5000);

          // Fetch user and find the saved card
          const user = await User.findOne({ userId }).select('savedCreditCards');
          if (!user) {
            throw new NotFoundError('User not found');
          }

          // Find the specific card
          const savedCard = user.savedCreditCards.find(card => card.cardId === cardData.cardId);
          if (!savedCard) {
            throw new ValidationError('Saved card not found');
          }

          // Decrypt card number
          let decryptedCardNumberValue;
          try {
            decryptedCardNumberValue = decrypt(savedCard.cardNumber);
          } catch (decryptError) {
            logger.error(`Failed to decrypt card number: ${decryptError.message}`);
            throw new ValidationError('Failed to decrypt saved card. Please use a different payment method.');
          }

          // Extract card details
          decryptedCardNumber = decryptedCardNumberValue;
          cardHolderName = savedCard.cardHolderName;
          expiryDate = savedCard.expiryDate;
          zipCode = savedCard.zipCode; // Get ZIP code from saved card

          logger.info(`Retrieved saved card for user ${userId}, cardId: ${cardData.cardId}, zipCode: ${zipCode}`);

          // Validate CVV is provided
          if (!cardData.cvv) {
            throw new ValidationError('CVV is required for saved card');
          }

          // Validate CVV format
          if (!/^\d{3,4}$/.test(cardData.cvv)) {
            throw new ValidationError('CVV must be 3-4 digits');
          }

          // ZIP code validation - check if saved card has ZIP code
          if (!zipCode) {
            logger.error(`Saved card ${cardData.cardId} does not have ZIP code stored`);
            throw new ValidationError('This saved card does not have a ZIP code. Please delete and re-add the card with ZIP code.');
          }

          // ZIP code is REQUIRED for saved card payment
          if (!cardData.zipCode) {
            throw new ValidationError('ZIP code is required for saved card payment');
          }

          // Validate ZIP code format
          validateZipCode(cardData.zipCode);

          // ZIP must match saved card's ZIP (normalize both for comparison - handle 5-digit vs 9-digit formats)
          const normalizedInputZip = (cardData.zipCode || '').replace(/[^0-9]/g, '').substring(0, 5);
          const normalizedSavedZip = (zipCode || '').replace(/[^0-9]/g, '').substring(0, 5);
          
          if (!normalizedSavedZip || normalizedSavedZip.length < 5) {
            logger.error(`Invalid saved ZIP code format: "${zipCode}"`);
            throw new ValidationError('Saved card has invalid ZIP code. Please delete and re-add the card.');
          }
          
          if (normalizedInputZip !== normalizedSavedZip) {
            logger.warn(`ZIP code mismatch: input="${cardData.zipCode}" (normalized: ${normalizedInputZip}) vs saved="${zipCode}" (normalized: ${normalizedSavedZip})`);
            throw new ValidationError(`ZIP code "${cardData.zipCode}" does not match the saved card ZIP code`);
          }

          // Validate expiry date is not in the past
          const [month, year] = expiryDate.split('/');
          const expiryYear = 2000 + parseInt(year);
          const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
          const now = new Date();
          if (expiryDateObj < now) {
            throw new ValidationError('Saved card has expired');
          }

          paymentValidated = true;
          logger.info(`Payment validation successful for saved card: ${cardData.cardId}`);
        } catch (error) {
          if (error instanceof NotFoundError || error instanceof ValidationError) {
            throw error; // Re-throw validation errors as-is
          }
          logger.error(`Error fetching saved card: ${error.message}`, { stack: error.stack });
          throw new ValidationError(`Payment validation failed: ${error.message}`);
        }
    } else if (cardData.cardNumber && cardData.cardHolderName && cardData.expiryDate) {
      // New card: validate all fields
      decryptedCardNumber = cardData.cardNumber.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      cardHolderName = cardData.cardHolderName.trim();
      expiryDate = cardData.expiryDate;
      
      // Validate card number format and length
      if (decryptedCardNumber.length < 13 || decryptedCardNumber.length > 19) {
        throw new ValidationError('Invalid card number length');
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
      const isTestCard = testCardNumbers.includes(decryptedCardNumber);

      // Luhn algorithm validation (skip for test cards)
      if (!isTestCard) {
        let sum = 0;
        let isEven = false;
        for (let i = decryptedCardNumber.length - 1; i >= 0; i--) {
          let digit = parseInt(decryptedCardNumber[i]);
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

      // Validate expiry date format
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate)) {
        throw new ValidationError('Expiry date must be in MM/YY format');
      }

      // Validate expiry date is not in the past
      const [month, year] = expiryDate.split('/');
      const expiryYear = 2000 + parseInt(year);
      const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
      const now = new Date();
      if (expiryDateObj < now) {
        throw new ValidationError('Card has expired');
      }

      // Validate card holder name
      if (cardHolderName.length < 2 || cardHolderName.length > 100) {
        throw new ValidationError('Card holder name must be between 2 and 100 characters');
      }

      // Validate CVV
      if (!cardData.cvv) {
        throw new ValidationError('CVV is required');
      }
      if (!/^\d{3,4}$/.test(cardData.cvv)) {
        throw new ValidationError('CVV must be 3-4 digits');
      }

      // Validate ZIP code
      if (!cardData.zipCode) {
        throw new ValidationError('ZIP code is required');
      }
        validateZipCode(cardData.zipCode);
        zipCode = cardData.zipCode;

        paymentValidated = true;
      } else {
        throw new ValidationError('Invalid card data provided');
      }

      if (!paymentValidated) {
        throw new ValidationError('Payment validation failed');
      }
    } catch (validationError) {
      // Payment validation failed - mark bookings as Failed IMMEDIATELY
      if (bookingIds && bookingIds.length > 0) {
        logger.warn(`Payment validation failed: ${validationError.message} - marking bookings as Failed`);
        await markBookingsAsFailed(bookingIds).catch(err => {
          logger.error(`CRITICAL: Failed to mark bookings as Failed after validation error: ${err.message}`);
        });
      }
      // Re-throw the validation error to be caught by outer catch block
      throw validationError;
    }

    // Group bookings by listing (for hotels, group all room types from same hotel into one bill)
    // For flights and cars, keep separate bills
    const groupedBookings = new Map(); // key: listingId, value: array of bookings
    
    for (const booking of bookings) {
      if (booking.listingType === 'Hotel') {
        // Group hotel bookings by listingId (same hotel = one bill)
        const key = booking.listingId;
        if (!groupedBookings.has(key)) {
          groupedBookings.set(key, []);
        }
        groupedBookings.get(key).push(booking);
      } else {
        // Flights and cars: one bill per booking
        groupedBookings.set(booking.bookingId, [booking]);
      }
    }

    // Create billing records - one per group
    const bills = [];
    const finalBillingId = billingId || `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Step 1: Create all billing records in PostgreSQL transaction
    // Ensure checkoutId is available (required by database schema)
    if (!checkoutId) {
      logger.error(`[PAYMENT ERROR] checkoutId is missing from payment event`);
      throw new ValidationError('Checkout ID is required. Please start over from checkout.');
    }

    for (const [groupKey, groupBookings] of groupedBookings.entries()) {
      // Calculate total amount for the group
      const groupTotalAmount = groupBookings.reduce((sum, b) => sum + b.totalAmount, 0);
      
      // For hotels, use the first booking's details as primary, but include all room types
      // For flights/cars, use the single booking
      const primaryBooking = groupBookings[0];
      
      // Build invoice details with all bookings in the group
      const invoiceDetails = {
        bookings: groupBookings.map(b => ({
          bookingId: b.bookingId,
          listingId: b.listingId,
          listingType: b.listingType,
          quantity: b.quantity,
          roomType: b.roomType || null,
          checkInDate: b.checkInDate || null,
          checkOutDate: b.checkOutDate || null,
          travelDate: b.travelDate || null,
          totalAmount: b.totalAmount,
          bookingDate: b.bookingDate
        })),
        listingId: primaryBooking.listingId,
        listingType: primaryBooking.listingType,
        checkoutId,
        cardHolderName,
        last4Digits: decryptedCardNumber.slice(-4),
        expiryDate,
        zipCode,
        // For hotels, include room type summary
        ...(primaryBooking.listingType === 'Hotel' && {
          roomTypes: groupBookings.map(b => ({
            type: b.roomType,
            quantity: b.quantity,
            pricePerNight: b.totalAmount / (b.quantity * Math.ceil((new Date(b.checkOutDate) - new Date(b.checkInDate)) / (1000 * 60 * 60 * 24)))
          }))
        })
      };

      // Generate billing ID: for hotels, use listingId; for others, use bookingId
      const billingIdForGroup = primaryBooking.listingType === 'Hotel' 
        ? `${finalBillingId}-${primaryBooking.listingId}`
        : `${finalBillingId}-${primaryBooking.bookingId}`;

      // For hotels, use comma-separated booking IDs; for others, single booking ID
      const bookingIdsForBill = groupBookings.map(b => b.bookingId).join(',');

      const insertQuery = `
        INSERT INTO bills (
          billing_id, user_id, booking_type, booking_id, checkout_id,
          transaction_date, total_amount, payment_method, 
          transaction_status, invoice_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        billingIdForGroup,
        userId,
        primaryBooking.listingType,
        bookingIdsForBill, // Store all booking IDs (comma-separated for hotels)
        checkoutId,
        new Date(),
        groupTotalAmount,
        paymentMethod,
        'Completed',
        JSON.stringify(invoiceDetails)
      ]);

      bills.push(result.rows[0]);
      
      // Update all bookings in the group with the same billing ID
      for (const booking of groupBookings) {
        booking.billingId = billingIdForGroup;
      }
    }

    // Step 2: Commit PostgreSQL transaction first
    await client.query('COMMIT');
    logger.info(`Billing records created: ${finalBillingId}`, { bookingCount: bookings.length });

    // Step 3: Update booking statuses AFTER successful payment commit
    // If any booking update fails, we need to rollback the billing records
    // Update directly in MongoDB (service-to-service) to avoid authentication issues
    try {
      for (const booking of bookings) {
        try {
          booking.status = 'Confirmed';
          // billingId was already set during bill creation (grouped for hotels)
          booking.updatedAt = new Date();
          await booking.save();
          confirmedBookings.push(booking.bookingId);
          
          // Invalidate booking cache
          await deleteCache(`booking:${booking.bookingId}`);
          logger.info(`Booking confirmed: ${booking.bookingId}`);
        } catch (error) {
          // If booking update fails, we need to rollback everything
          logger.error(`Failed to update booking ${booking.bookingId} status: ${error.message}`);
          throw new TransactionError(`Failed to update booking ${booking.bookingId} status: ${error.message}`);
        }
      }
      
      // Invalidate user bookings cache for all status variations to ensure fresh data
      // Cache keys are: user:${userId}:bookings:${status}:${billingId}
      // Use pattern matching to catch all combinations (status + billingId variations)
      try {
        await deleteCachePattern(`user:${userId}:bookings:*`);
        logger.info(`Invalidated all booking cache patterns for user ${userId} after payment confirmation`);
      } catch (cacheError) {
        logger.warn(`Failed to invalidate booking cache: ${cacheError.message}`);
        // Non-critical - continue even if cache invalidation fails
      }
    } catch (bookingUpdateError) {
      // Mark ALL bookings as 'Failed' (not just confirmed ones)
      // This releases inventory back to available
      logger.warn(`Marking ${bookings.length} bookings as Failed due to payment failure`);
      await markBookingsAsFailed(bookings.map(b => b.bookingId));
      
      // Rollback billing records (compensation transaction)
      // Note: Since we already committed, we need to mark bills as failed
      try {
        const rollbackClient = await pool.connect();
        await rollbackClient.query('BEGIN');
        
        for (const bill of bills) {
          await rollbackClient.query(
            `UPDATE bills SET transaction_status = 'Failed' WHERE billing_id = $1`,
            [bill.billing_id]
          );
        }
        
        await rollbackClient.query('COMMIT');
        rollbackClient.release();
        logger.info(`Marked ${bills.length} billing records as Failed`);
      } catch (rollbackError) {
        logger.error(`Failed to rollback billing records: ${rollbackError.message}`);
        // Critical: This should trigger an alert for manual intervention
      }
      
      throw bookingUpdateError;
    }

    logger.info(`Payment completed via Kafka: ${finalBillingId}`, { userId, bookingCount: bookings.length });

    await sendMessage('payment-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'payment.complete',
        data: {
          billingId: finalBillingId,
          bills,
          checkoutId,
          userId
        }
      }
    });

  } catch (error) {
    // Rollback PostgreSQL transaction if it hasn't been committed yet
    try {
      if (client) {
        await client.query('ROLLBACK');
        logger.info('PostgreSQL transaction rolled back');
      }
    } catch (rollbackError) {
      logger.warn('PostgreSQL transaction might already be committed or failed to rollback', rollbackError.message);
    }

    // CRITICAL: Mark ALL bookings as 'Failed' to release inventory IMMEDIATELY
    // This ensures bookings don't stay 'Pending' forever if payment fails
    logger.error(`[PAYMENT ERROR] Payment failed with error: ${error.message}`);
    logger.error(`[PAYMENT ERROR] bookingIds from event: ${JSON.stringify(bookingIds)}`);
    logger.error(`[PAYMENT ERROR] bookings array length: ${bookings?.length || 0}`);
    
    // Get bookingIds from multiple sources
    let bookingIdsToFail = [];
    
    // First try: from event parameter (most reliable)
    if (bookingIds && Array.isArray(bookingIds) && bookingIds.length > 0) {
      bookingIdsToFail = bookingIds;
      logger.warn(`[PAYMENT ERROR] Using bookingIds from event: ${bookingIdsToFail.join(', ')}`);
    }
    // Second try: extract from bookings array if available
    else if (bookings && bookings.length > 0) {
      bookingIdsToFail = bookings.map(b => b.bookingId || b).filter(id => id);
      logger.warn(`[PAYMENT ERROR] Extracted bookingIds from bookings array: ${bookingIdsToFail.join(', ')}`);
    }
    // Third try: fetch from MongoDB using userId and status
    else if (userId) {
      logger.warn(`[PAYMENT ERROR] bookingIds not available, fetching pending bookings for user ${userId}...`);
      try {
        const pendingBookings = await Booking.find({ 
          userId: userId, 
          status: 'Pending',
          createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
        }).limit(10);
        bookingIdsToFail = pendingBookings.map(b => b.bookingId);
        logger.warn(`[PAYMENT ERROR] Found ${bookingIdsToFail.length} pending bookings for user: ${bookingIdsToFail.join(', ')}`);
      } catch (fetchError) {
        logger.error(`[PAYMENT ERROR] Failed to fetch pending bookings: ${fetchError.message}`);
      }
    }
    
    // Now mark bookings as Failed
    try {
      if (bookingIdsToFail.length > 0) {
        logger.warn(`[PAYMENT ERROR] Marking ${bookingIdsToFail.length} bookings as Failed to release inventory. Error: ${error.message}`);
        const result = await markBookingsAsFailed(bookingIdsToFail);
        logger.info(`[PAYMENT ERROR] Marked ${result.modifiedCount} booking(s) as Failed (matched: ${result.matchedCount}) out of ${bookingIdsToFail.length} requested`);
        
        if (result.modifiedCount === 0) {
          logger.error(`[PAYMENT ERROR] CRITICAL: No bookings were marked as Failed! All ${bookingIdsToFail.length} bookings may still be blocking inventory.`);
        }
      } else {
        logger.error(`[PAYMENT ERROR] CRITICAL: No bookingIds available to mark as Failed! Bookings may remain Pending.`);
        logger.error(`[PAYMENT ERROR] Event data: requestId=${requestId}, userId=${userId}, checkoutId=${checkoutId}`);
      }
      
      // Also handle confirmed bookings if any (shouldn't happen in normal flow, but safety measure)
      if (confirmedBookings && confirmedBookings.length > 0) {
        logger.warn(`[PAYMENT ERROR] Rolling back ${confirmedBookings.length} confirmed booking statuses`);
        await markBookingsAsFailed(confirmedBookings);
      }
    } catch (markFailedError) {
      logger.error(`[PAYMENT ERROR] CRITICAL: Failed to mark bookings as Failed: ${markFailedError.message}`, markFailedError);
      logger.error(`[PAYMENT ERROR] Stack: ${markFailedError.stack}`);
      logger.error(`[PAYMENT ERROR] This is a critical error - bookings may remain Pending and block inventory`);
      // This is critical - bookings might stay Pending
      // In production, this should trigger an alert for manual intervention
    }
    
    logger.error(`Error handling payment complete: ${error.message}`, {
      requestId,
      userId,
      bookingIds: bookingIds || [],
      bookingsMarkedAsFailed: bookings?.filter(b => b.status === 'Pending').length || 0
    });
    
    await sendMessage('payment-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'payment.complete',
        error: {
          code: error.code || 'PAYMENT_ERROR',
          message: error.message
        }
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Kafka message handler
 */
async function handleBillingEvent(topic, message, metadata) {
  try {
    logger.info(`[handleBillingEvent] Received message on topic: ${topic}`, {
      topic,
      messageType: typeof message,
      hasMetadata: !!metadata
    });

    const event = typeof message === 'string' ? JSON.parse(message) : message;
    const { eventType } = event;

    logger.info(`[handleBillingEvent] Parsed event: ${eventType}`, { 
      requestId: event.requestId,
      eventType,
      topic,
      userId: event.userId,
      hasCartItems: !!event.cartItems
    });

    switch (eventType) {
      case 'checkout.initiate':
        await handleCheckoutInitiate(event);
        break;
      case 'payment.complete':
        await handlePaymentComplete(event);
        break;
      default:
        logger.warn(`[handleBillingEvent] Unknown billing event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`[handleBillingEvent] Error processing billing event: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      topic,
      message: typeof message === 'string' ? message.substring(0, 200) : JSON.stringify(message).substring(0, 200)
    });
  }
}

module.exports = {
  handleBillingEvent,
  handleBookingResponseForCheckout,
  rollbackBookingStatuses,
  markBookingsAsFailed
};

