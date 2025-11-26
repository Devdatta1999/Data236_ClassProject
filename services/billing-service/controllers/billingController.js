/**
 * Billing Controller
 * Note: Payment processing and checkout are now handled via HTTP
 * Kafka is still used for login, signup, and search
 */

const { getPostgresPool, mongoose, waitForMongoDBReady } = require('../../../shared/config/database');
const { NotFoundError, ValidationError, TransactionError, asyncHandler } = require('../../../shared/utils/errors');
const { validateZipCode } = require('../../../shared/utils/validators');
const { decrypt } = require('../../../shared/utils/encryption');
const { deleteCache } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';

// Define Booking schema inline for direct MongoDB queries
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
  roomType: { type: String, enum: ['Standard', 'Suite', 'Deluxe', 'Single', 'Double', 'Presidential'], default: null },
  totalAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Confirmed', 'Pending', 'Cancelled', 'Failed'], default: 'Pending', index: true },
  billingId: { type: String, default: null, index: true },
  checkoutId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema, 'bookings');

// Define User schema inline
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  savedCreditCards: [{
    cardId: { type: String, required: true },
    cardNumber: { type: String, required: true },
    cardHolderName: { type: String, required: true },
    expiryDate: { type: String, required: true },
    last4Digits: { type: String, required: true },
    zipCode: { type: String, required: true },
    addedAt: { type: Date, default: Date.now }
  }]
}, {
  collection: 'users',
  strict: false
});

const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

/**
 * Get billing details
 */
const getBilling = asyncHandler(async (req, res) => {
  const { billingId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE billing_id = $1',
    [billingId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Billing record');
  }

  res.json({
    success: true,
    data: { bill: result.rows[0] }
  });
});

/**
 * Get user billing history
 */
const getUserBillingHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE user_id = $1 ORDER BY transaction_date DESC',
    [userId]
  );

  res.json({
    success: true,
    count: result.rows.length,
    data: { bills: result.rows }
  });
});

/**
 * Search bills (Admin only)
 */
const searchBills = asyncHandler(async (req, res) => {
  const { startDate, endDate, month, year, userId, status } = req.query;

  let query = 'SELECT * FROM bills WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (startDate && endDate) {
    paramCount++;
    query += ` AND transaction_date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
    query += ` AND transaction_date <= $${paramCount}`;
    params.push(endDate);
  } else if (month && year) {
    paramCount++;
    query += ` AND EXTRACT(MONTH FROM transaction_date) = $${paramCount}`;
    params.push(parseInt(month));
    paramCount++;
    query += ` AND EXTRACT(YEAR FROM transaction_date) = $${paramCount}`;
    params.push(parseInt(year));
  }

  if (userId) {
    paramCount++;
    query += ` AND user_id = $${paramCount}`;
    params.push(userId);
  }

  if (status) {
    paramCount++;
    query += ` AND transaction_status = $${paramCount}`;
    params.push(status);
  }

  query += ' ORDER BY transaction_date DESC';

  const pool = getPostgresPool();
  const result = await pool.query(query, params);

  res.json({
    success: true,
    count: result.rows.length,
    data: { bills: result.rows }
  });
});

/**
 * Get invoice
 */
const getInvoice = asyncHandler(async (req, res) => {
  const { billingId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE billing_id = $1',
    [billingId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Billing record');
  }

  const bill = result.rows[0];

  // Format invoice
  const invoice = {
    billingId: bill.billing_id,
    invoiceNumber: `INV-${bill.billing_id}`,
    transactionDate: bill.transaction_date,
    user: {
      userId: bill.user_id
    },
    booking: {
      bookingId: bill.booking_id,
      type: bill.booking_type
    },
    payment: {
      method: bill.payment_method,
      amount: bill.total_amount,
      status: bill.transaction_status
    },
    details: bill.invoice_details
  };

  res.json({
    success: true,
    data: { invoice }
  });
});

/**
 * Helper function to mark bookings as Failed
 */
async function markBookingsAsFailed(bookingIds) {
  try {
    const response = await axios.post(
      `${BOOKING_SERVICE_URL}/api/bookings/fail`,
      { bookingIds },
      { timeout: 10000 }
    );
    return response.data.data || { modifiedCount: 0, matchedCount: 0 };
  } catch (error) {
    logger.error(`Failed to mark bookings as Failed: ${error.message}`);
    return { modifiedCount: 0, matchedCount: 0 };
  }
}

/**
 * Checkout endpoint (HTTP)
 * Creates bookings for all cart items
 */
const checkout = asyncHandler(async (req, res) => {
  logger.info(`[checkout] Received checkout request`, {
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'Bearer ***' : 'none',
      'user-agent': req.headers['user-agent']
    },
    body: req.body,
    userId: req.body?.userId,
    cartItemsCount: req.body?.cartItems?.length || 0,
    cartItems: req.body?.cartItems
  });

  const { userId, cartItems } = req.body;

  if (!userId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    throw new ValidationError('userId and cartItems array are required');
  }

  // Ensure MongoDB is ready
  await waitForMongoDBReady(5000);

  // Generate checkout ID
  const checkoutId = `CHECKOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Clean up old pending bookings
  try {
    const expiryTime = new Date(Date.now() - 15 * 60 * 1000);
    for (const item of cartItems) {
      const existingPendingBookings = await Booking.find({
        userId,
        listingId: item.listingId,
        listingType: item.listingType,
        status: 'Pending',
        createdAt: { $lt: expiryTime }
      });

      if (existingPendingBookings.length > 0) {
        const bookingIds = existingPendingBookings.map(b => b.bookingId);
        await markBookingsAsFailed(bookingIds);
      }
    }
  } catch (cleanupError) {
    logger.warn(`Failed to clean up old pending bookings: ${cleanupError.message}`);
  }

  // Create bookings for each cart item
  const bookings = [];
  const errors = [];

  logger.info(`[checkout] Creating bookings for ${cartItems.length} cart items`, {
    userId,
    checkoutId,
    cartItems: cartItems.map(item => ({
      listingId: item.listingId,
      listingType: item.listingType,
      quantity: item.quantity,
      roomType: item.roomType
    }))
  });

  for (let i = 0; i < cartItems.length; i++) {
    const item = cartItems[i];
    
    try {
      // Map date fields
      let checkInDate = item.checkInDate;
      let checkOutDate = item.checkOutDate;
      
      if (item.listingType === 'Car') {
        checkInDate = item.pickupDate || item.checkInDate;
        checkOutDate = item.returnDate || item.checkOutDate;
      }

      logger.info(`[checkout] Calling booking service to create booking`, {
        listingId: item.listingId,
        listingType: item.listingType,
        quantity: item.quantity,
        checkInDate,
        checkOutDate,
        roomType: item.roomType,
        bookingServiceUrl: BOOKING_SERVICE_URL
      });

      // Call booking service to create booking
      const bookingResponse = await axios.post(
        `${BOOKING_SERVICE_URL}/api/bookings/create`,
        {
          userId,
          listingId: item.listingId,
          listingType: item.listingType,
          quantity: item.quantity,
          checkInDate,
          checkOutDate,
          travelDate: item.travelDate,
          roomType: item.roomType || null,
          checkoutId,
          parentRequestId: checkoutId
        },
        { timeout: 30000 }
      );

      logger.info(`[checkout] Booking service response`, {
        listingId: item.listingId,
        success: bookingResponse.data.success,
        hasBooking: !!bookingResponse.data.data?.booking
      });

      if (bookingResponse.data.success) {
        bookings.push(bookingResponse.data.data.booking);
        logger.info(`[checkout] Booking created successfully`, {
          bookingId: bookingResponse.data.data.booking?.bookingId,
          listingId: item.listingId
        });
      } else {
        logger.error(`[checkout] Booking creation failed`, {
          listingId: item.listingId,
          error: bookingResponse.data.message
        });
        errors.push({
          listingId: item.listingId,
          error: bookingResponse.data.message || 'Unknown error'
        });
      }
    } catch (error) {
      logger.error(`[checkout] Failed to create booking for item ${item.listingId}`, {
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        listingId: item.listingId
      });
      errors.push({
        listingId: item.listingId,
        error: error.response?.data?.message || error.message
      });
    }
  }

  // If any bookings failed, mark successful ones as Failed and return error
  if (errors.length > 0) {
    if (bookings.length > 0) {
      const bookingIds = bookings.map(b => b.bookingId);
      await markBookingsAsFailed(bookingIds);
    }
    
    const errorMessages = errors.map(e => e.error).join('; ');
    throw new ValidationError(`Some bookings failed: ${errorMessages}`);
  }

  // Calculate total amount
  const totalAmount = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);

  logger.info(`Checkout completed: ${checkoutId}`, {
    userId,
    bookingCount: bookings.length,
    totalAmount
  });

  res.json({
    success: true,
    message: 'Checkout completed successfully',
    data: {
      checkoutId,
      bookings,
      totalAmount,
      userId
    }
  });
});

/**
 * Payment endpoint (HTTP)
 * Processes payment and confirms bookings
 */
const processPayment = asyncHandler(async (req, res) => {
  const {
    checkoutId,
    userId,
    bookingIds,
    paymentMethod,
    cardData
  } = req.body;

  if (!checkoutId || !userId || !bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    throw new ValidationError('checkoutId, userId, and bookingIds array are required');
  }

  if (!cardData) {
    throw new ValidationError('Card data is required');
  }

  // Ensure MongoDB is ready
  await waitForMongoDBReady(5000);

  let pool;
  let client;
  const confirmedBookings = [];
  let bookings = [];

  try {
    pool = getPostgresPool();
    client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PostgreSQL connection timeout')), 10000)
      )
    ]);
  } catch (connectionError) {
    throw new Error(`Database connection failed: ${connectionError.message}`);
  }

  try {
    await client.query('BEGIN');

    // Fetch bookings from MongoDB
    for (const bookingId of bookingIds) {
      const booking = await Booking.findOne({ bookingId });
      if (!booking) {
        throw new NotFoundError(`Booking ${bookingId} not found`);
      }
      if (booking.status !== 'Pending') {
        await markBookingsAsFailed(bookingIds);
        throw new ValidationError(`Booking ${bookingId} is not in pending status`);
      }
      bookings.push(booking);
    }

    // Validate payment (same logic as Kafka handler)
    let paymentValidated = false;
    let decryptedCardNumber = '';
    let cardHolderName = '';
    let expiryDate = '';
    let zipCode = '';

    try {
      if (cardData.cardId) {
        // Saved card
        await waitForMongoDBReady(5000);
        const user = await User.findOne({ userId }).select('savedCreditCards');
        if (!user) {
          throw new NotFoundError('User not found');
        }

        const savedCard = user.savedCreditCards.find(card => card.cardId === cardData.cardId);
        if (!savedCard) {
          throw new ValidationError('Saved card not found');
        }

        decryptedCardNumber = decrypt(savedCard.cardNumber);
        cardHolderName = savedCard.cardHolderName;
        expiryDate = savedCard.expiryDate;
        zipCode = savedCard.zipCode;

        if (!cardData.cvv || !/^\d{3,4}$/.test(cardData.cvv)) {
          throw new ValidationError('CVV is required and must be 3-4 digits');
        }

        if (!zipCode) {
          throw new ValidationError('This saved card does not have a ZIP code');
        }

        if (!cardData.zipCode) {
          throw new ValidationError('ZIP code is required for saved card payment');
        }

        validateZipCode(cardData.zipCode);
        const normalizedInputZip = (cardData.zipCode || '').replace(/[^0-9]/g, '').substring(0, 5);
        const normalizedSavedZip = (zipCode || '').replace(/[^0-9]/g, '').substring(0, 5);
        
        if (normalizedInputZip !== normalizedSavedZip) {
          throw new ValidationError(`ZIP code does not match the saved card ZIP code`);
        }

        const [month, year] = expiryDate.split('/');
        const expiryYear = 2000 + parseInt(year);
        const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
        if (expiryDateObj < new Date()) {
          throw new ValidationError('Saved card has expired');
        }

        paymentValidated = true;
      } else if (cardData.cardNumber && cardData.cardHolderName && cardData.expiryDate) {
        // New card
        decryptedCardNumber = cardData.cardNumber.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        cardHolderName = cardData.cardHolderName.trim();
        expiryDate = cardData.expiryDate;

        if (decryptedCardNumber.length < 13 || decryptedCardNumber.length > 19) {
          throw new ValidationError('Invalid card number length');
        }

        const testCardNumbers = [
          '1111111111111111', '4111111111111111', '5555555555554444',
          '4242424242424242', '4000000000000002', '4000000000009995'
        ];
        const isTestCard = testCardNumbers.includes(decryptedCardNumber);

        if (!isTestCard) {
          let sum = 0;
          let isEven = false;
          for (let i = decryptedCardNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(decryptedCardNumber[i]);
            if (isEven) {
              digit *= 2;
              if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
          }
          if (sum % 10 !== 0) {
            throw new ValidationError('Invalid card number (checksum failed)');
          }
        }

        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate)) {
          throw new ValidationError('Expiry date must be in MM/YY format');
        }

        const [month, year] = expiryDate.split('/');
        const expiryYear = 2000 + parseInt(year);
        const expiryDateObj = new Date(expiryYear, parseInt(month) - 1);
        if (expiryDateObj < new Date()) {
          throw new ValidationError('Card has expired');
        }

        if (cardHolderName.length < 2 || cardHolderName.length > 100) {
          throw new ValidationError('Card holder name must be between 2 and 100 characters');
        }

        if (!cardData.cvv || !/^\d{3,4}$/.test(cardData.cvv)) {
          throw new ValidationError('CVV is required and must be 3-4 digits');
        }

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
      await markBookingsAsFailed(bookingIds);
      throw validationError;
    }

    // Group bookings by listing (hotels grouped, others separate)
    const groupedBookings = new Map();
    for (const booking of bookings) {
      if (booking.listingType === 'Hotel') {
        const key = booking.listingId;
        if (!groupedBookings.has(key)) {
          groupedBookings.set(key, []);
        }
        groupedBookings.get(key).push(booking);
      } else {
        groupedBookings.set(booking.bookingId, [booking]);
      }
    }

    // Create billing records
    const bills = [];
    const finalBillingId = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    for (const [groupKey, groupBookings] of groupedBookings.entries()) {
      const groupTotalAmount = groupBookings.reduce((sum, b) => sum + b.totalAmount, 0);
      const primaryBooking = groupBookings[0];

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
        ...(primaryBooking.listingType === 'Hotel' && {
          roomTypes: groupBookings.map(b => ({
            type: b.roomType,
            quantity: b.quantity,
            pricePerNight: b.totalAmount / (b.quantity * Math.ceil((new Date(b.checkOutDate) - new Date(b.checkInDate)) / (1000 * 60 * 60 * 24)))
          }))
        })
      };

      const billingIdForGroup = primaryBooking.listingType === 'Hotel' 
        ? `${finalBillingId}-${primaryBooking.listingId}`
        : `${finalBillingId}-${primaryBooking.bookingId}`;

      const bookingIdsForBill = groupBookings.map(b => b.bookingId).join(',');

      const result = await client.query(
        `INSERT INTO bills (
          billing_id, user_id, booking_type, booking_id, checkout_id,
          transaction_date, total_amount, payment_method, 
          transaction_status, invoice_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          billingIdForGroup,
          userId,
          primaryBooking.listingType,
          bookingIdsForBill,
          checkoutId,
          new Date(),
          groupTotalAmount,
          paymentMethod || 'Credit Card',
          'Completed',
          JSON.stringify(invoiceDetails)
        ]
      );

      bills.push(result.rows[0]);

      for (const booking of groupBookings) {
        booking.billingId = billingIdForGroup;
      }
    }

    await client.query('COMMIT');

    // Update booking statuses to Confirmed
    try {
      for (const booking of bookings) {
        booking.status = 'Confirmed';
        booking.updatedAt = new Date();
        await booking.save();
        confirmedBookings.push(booking.bookingId);
        await deleteCache(`booking:${booking.bookingId}`);
      }

      // Invalidate user bookings cache
      await deleteCache(`user:${userId}:bookings:Confirmed`);
      await deleteCache(`user:${userId}:bookings:all`);
      await deleteCache(`user:${userId}:bookings:Pending`);
      await deleteCache(`user:${userId}:bookings`);
    } catch (bookingUpdateError) {
      // Rollback: mark bookings as Failed
      await markBookingsAsFailed(bookings.map(b => b.bookingId));
      
      // Mark bills as Failed
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
      } catch (rollbackError) {
        logger.error(`Failed to rollback billing records: ${rollbackError.message}`);
      }
      
      throw new TransactionError(`Failed to update booking statuses: ${bookingUpdateError.message}`);
    }

    logger.info(`Payment completed: ${finalBillingId}`, { userId, bookingCount: bookings.length });

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        billingId: finalBillingId,
        bills,
        checkoutId,
        userId,
        bookings: bookings.map(b => ({
          bookingId: b.bookingId,
          status: b.status,
          billingId: b.billingId
        }))
      }
    });

  } catch (error) {
    try {
      if (client) {
        await client.query('ROLLBACK');
      }
    } catch (rollbackError) {
      logger.warn('Failed to rollback transaction', rollbackError.message);
    }

    // Mark bookings as Failed
    if (bookingIds && bookingIds.length > 0) {
      await markBookingsAsFailed(bookingIds);
    }

    throw error; // Let asyncHandler handle it
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = {
  getBilling,
  getUserBillingHistory,
  searchBills,
  getInvoice,
  checkout,
  processPayment
};

