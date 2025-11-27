/**
 * Booking Controller
 * Note: Booking creation is now handled via HTTP (POST /api/bookings/create)
 * Kafka is still used for login, signup, and search
 */

const Booking = require('../models/Booking');
const { NotFoundError, ValidationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const { mongoose, waitForMongoDBReady } = require('../../../shared/config/database');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';
const PROVIDER_SERVICE_URL = process.env.PROVIDER_SERVICE_URL || 'http://localhost:3005';

/**
 * Get booking by ID
 */
const getBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const cacheKey = `booking:${bookingId}`;
  let booking = await getCache(cacheKey);

  if (!booking) {
    booking = await Booking.findOne({ bookingId });
    if (!booking) {
      throw new NotFoundError('Booking');
    }
    await setCache(cacheKey, booking, 3600);
  }

  res.json({
    success: true,
    data: { booking }
  });
});

/**
 * Update booking
 */
const updateBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const updates = req.body;

  const booking = await Booking.findOne({ bookingId });
  if (!booking) {
    throw new NotFoundError('Booking');
  }

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'bookingId') {
      booking[key] = updates[key];
    }
  });

  booking.updatedAt = new Date();
  await booking.save();

  await deleteCache(`booking:${bookingId}`);
  await deleteCache(`user:${booking.userId}:bookings`);

  res.json({
    success: true,
    message: 'Booking updated successfully',
    data: { booking }
  });
});

/**
 * Get user bookings with listing and provider details
 */
const getUserBookings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status, billingId } = req.query;

  // Create cache key that includes all query params
  const cacheKey = `user:${userId}:bookings:${status || 'all'}:${billingId || 'all'}`;
  let bookingsWithDetails = await getCache(cacheKey);

  if (!bookingsWithDetails) {
    // Fetch bookings from database
    const query = { userId };
    if (status) {
      query.status = status;
    }
    if (billingId) {
      query.billingId = billingId;
    }
    const bookings = await Booking.find(query).sort({ bookingDate: -1 });
    
    // Fetch listing and provider details for all bookings in parallel
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();
        let listing = null;
        let provider = null;

        try {
          // Fetch listing details
          const listingTypeLower = booking.listingType.toLowerCase() + 's';
          const listingResponse = await axios.get(
            `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${booking.listingId}`,
            { timeout: 5000 }
          );
          listing = listingResponse.data.data?.[listingTypeLower.slice(0, -1)];

          // Fetch provider details if listing has providerId
          if (listing?.providerId) {
            try {
              const providerResponse = await axios.get(
                `${PROVIDER_SERVICE_URL}/api/providers/${listing.providerId}`,
                { timeout: 5000 }
              );
              provider = providerResponse.data.data?.provider;
            } catch (providerErr) {
              logger.warn(`Error fetching provider ${listing.providerId} for booking ${booking.bookingId}:`, providerErr.message);
              // Continue without provider details
            }
          }
        } catch (listingErr) {
          logger.warn(`Error fetching listing ${booking.listingId} for booking ${booking.bookingId}:`, listingErr.message);
          // Continue without listing details - booking will still be returned
        }

        return {
          ...bookingObj,
          listing,
          provider
        };
      })
    );

    bookingsWithDetails = enrichedBookings;
    
    // Cache the enriched bookings for 15 minutes (shorter than bookings cache since listings may change)
    await setCache(cacheKey, bookingsWithDetails, 900);
  }

  res.json({
    success: true,
    count: bookingsWithDetails.length,
    data: { bookings: bookingsWithDetails }
  });
});

/**
 * Mark bookings as Failed (for abandoned checkouts)
 * Accepts array of bookingIds or single bookingId
 */
const markBookingsAsFailed = asyncHandler(async (req, res) => {
  const { bookingIds } = req.body;
  const { userId } = req.params || req.query; // Can be from params or query

  if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    throw new ValidationError('bookingIds array is required');
  }

  const failedBookings = [];
  const errors = [];

  for (const bookingId of bookingIds) {
    try {
      const booking = await Booking.findOne({ bookingId });
      if (!booking) {
        errors.push({ bookingId, error: 'Booking not found' });
        continue;
      }

      // Only mark as Failed if it's in Pending status
      // Optionally verify userId matches if provided
      if (userId && booking.userId !== userId) {
        errors.push({ bookingId, error: 'Unauthorized' });
        continue;
      }

      // Mark as Failed if it's in Pending or Confirmed status
      // This releases inventory for both abandoned checkouts and payment failures
      if (booking.status === 'Pending' || booking.status === 'Confirmed') {
        const oldStatus = booking.status;
        booking.status = 'Failed';
        booking.updatedAt = new Date();
        await booking.save();
        failedBookings.push(bookingId);
        
        // Invalidate cache
        await deleteCache(`booking:${bookingId}`);
        await deleteCache(`user:${booking.userId}:bookings`);
        
        logger.info(`Marked booking as Failed: ${bookingId} (was: ${oldStatus})`);
      } else {
        logger.warn(`Booking ${bookingId} is not in Pending/Confirmed status (${booking.status}), skipping`);
      }
    } catch (error) {
      errors.push({ bookingId, error: error.message });
      logger.error(`Failed to mark booking ${bookingId} as Failed: ${error.message}`);
    }
  }

  res.json({
    success: true,
    message: `Marked ${failedBookings.length} booking(s) as Failed`,
    data: {
      failedBookings,
      errors: errors.length > 0 ? errors : undefined
    }
  });
});

/**
 * Expire old Pending bookings (older than 15 minutes)
 * This can be called periodically or during booking creation
 */
const expirePendingBookings = asyncHandler(async (req, res) => {
  const expiryMinutes = parseInt(req.query.minutes || '15');
  const expiryTime = new Date(Date.now() - expiryMinutes * 60 * 1000);

  const pendingBookings = await Booking.find({
    status: 'Pending',
    createdAt: { $lt: expiryTime }
  });

  const expiredBookings = [];
  for (const booking of pendingBookings) {
    booking.status = 'Failed';
    booking.updatedAt = new Date();
    await booking.save();
    
    await deleteCache(`booking:${booking.bookingId}`);
    await deleteCache(`user:${booking.userId}:bookings`);
    
    expiredBookings.push(booking.bookingId);
    logger.info(`Expired booking: ${booking.bookingId}`);
  }

  res.json({
    success: true,
    message: `Expired ${expiredBookings.length} booking(s)`,
    data: { expiredBookings }
  });
});

/**
 * Create booking (HTTP endpoint for checkout flow)
 * This replaces the Kafka-based booking creation for checkout
 */
const createBooking = asyncHandler(async (req, res) => {
  logger.info(`[createBooking] Received booking creation request`, {
    body: req.body,
    userId: req.body.userId,
    listingId: req.body.listingId,
    listingType: req.body.listingType
  });

  const {
    userId,
    listingId,
    listingType,
    quantity,
    checkInDate,
    checkOutDate,
    travelDate,
    roomType,
    checkoutId,
    parentRequestId
  } = req.body;

  // Validate required fields
  if (!userId || !listingId || !listingType || !quantity) {
    logger.error(`[createBooking] Missing required fields`, {
      userId: !!userId,
      listingId: !!listingId,
      listingType: !!listingType,
      quantity: !!quantity
    });
    throw new ValidationError('Missing required fields: userId, listingId, listingType, quantity');
  }

  // CRITICAL: Ensure MongoDB is ready
  if (mongoose.connection.readyState === 0) {
    logger.warn('MongoDB disconnected, waiting for connection...');
    await waitForMongoDBReady(5000);
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error(`MongoDB not ready for booking creation. State: ${mongoose.connection.readyState}`);
  }

  // Expire old pending bookings
  try {
    const expiryTime = new Date(Date.now() - 15 * 60 * 1000);
    const oldPendingBookings = await Booking.find({
      userId,
      listingId,
      listingType,
      status: 'Pending',
      createdAt: { $lt: expiryTime }
    });

    if (oldPendingBookings.length > 0) {
      logger.info(`Expiring ${oldPendingBookings.length} old Pending booking(s)`);
      for (const oldBooking of oldPendingBookings) {
        oldBooking.status = 'Failed';
        oldBooking.updatedAt = new Date();
        await oldBooking.save();
      }
    }
  } catch (expiryError) {
    logger.warn(`Failed to expire old pending bookings: ${expiryError.message}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
      throw new ValidationError('Invalid listing type');
    }

    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1');
    }

    // Fetch listing details
    let listing;
    try {
      const listingTypeLower = listingType.toLowerCase() + 's';
      const url = `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`;
      logger.info(`[createBooking] Fetching listing from: ${url}`);
      
      const response = await axios.get(url, { timeout: 10000 });
      logger.info(`[createBooking] Listing service response`, {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      });
      
      listing = response.data.data[listingTypeLower.slice(0, -1)];
      
      if (!listing) {
        logger.error(`[createBooking] Listing not found in response data`, {
          listingId,
          listingType,
          responseData: response.data
        });
        throw new NotFoundError(`Listing not found: ${listingId}`);
      }
      
      logger.info(`[createBooking] Listing fetched successfully`, {
        listingId: listing.hotelId || listing.carId || listing.flightId,
        listingType
      });
    } catch (error) {
      logger.error(`[createBooking] Failed to fetch listing`, {
        listingId,
        listingType,
        error: error.message,
        status: error.response?.status,
        responseData: error.response?.data,
        url: error.config?.url
      });
      throw new NotFoundError(`Listing not found: ${listingId} - ${error.message}`);
    }

    // Check availability (same logic as Kafka handler)
    if (listingType === 'Flight') {
      if (!travelDate) {
        throw new ValidationError('Travel date is required for flight bookings');
      }
      
      // Validate seat type
      let seatType = roomType; // Use roomType field for seat type (for consistency)
      if (!seatType) {
        throw new ValidationError('Seat type is required for flight bookings');
      }
      
      // Check if flight has seatTypes (new format) or legacy format
      if (listing.seatTypes && Array.isArray(listing.seatTypes)) {
        const selectedSeatType = listing.seatTypes.find(st => st.type === seatType);
        if (!selectedSeatType) {
          throw new ValidationError(`Seat type '${seatType}' is not available on this flight. Available types: ${listing.seatTypes.map(st => st.type).join(', ')}`);
        }
        
        // Check availability for this seat type on this date
        const travel = new Date(travelDate);
        travel.setHours(0, 0, 0, 0);
        const travelEnd = new Date(travelDate);
        travelEnd.setHours(23, 59, 59, 999);
        
        const conflictingBookings = await Booking.find({
          listingId,
          listingType: 'Flight',
          roomType: seatType, // Using roomType field for seat type
          status: { $in: ['Confirmed', 'Pending'] },
          travelDate: { $gte: travel, $lte: travelEnd }
        });
        
        const bookedSeats = conflictingBookings.reduce((sum, b) => sum + b.quantity, 0);
        const availableSeats = Math.max(0, selectedSeatType.availableSeats - bookedSeats);
        
        if (availableSeats < quantity) {
          throw new ValidationError(`Not enough ${seatType} seats available. Available: ${availableSeats}, Requested: ${quantity}`);
        }
        
        // Validate travel date is within flight's available date range
        const availableFrom = new Date(listing.availableFrom);
        const availableTo = new Date(listing.availableTo);
        const travelDateObj = new Date(travelDate);
        
        if (travelDateObj < availableFrom || travelDateObj > availableTo) {
          throw new ValidationError('Selected travel date is outside the flight\'s availability period');
        }
        
        // Validate that the travel date falls on an operating day
        if (listing.operatingDays && Array.isArray(listing.operatingDays) && listing.operatingDays.length > 0) {
          const dayIndex = travelDateObj.getDay();
          const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const travelDayOfWeek = daysOfWeek[dayIndex];
          
          if (!listing.operatingDays.includes(travelDayOfWeek)) {
            throw new ValidationError(`This flight does not operate on ${travelDayOfWeek}. Operating days: ${listing.operatingDays.join(', ')}`);
          }
        }
      } else {
        // Legacy format - single seat type
        if (listing.flightClass !== seatType) {
          throw new ValidationError(`Seat type '${seatType}' does not match flight class '${listing.flightClass}'`);
        }
        
        if (listing.availableSeats < quantity) {
          throw new ValidationError('Not enough seats available');
        }
        
        // Check bookings for legacy format
        const travel = new Date(travelDate);
        travel.setHours(0, 0, 0, 0);
        const travelEnd = new Date(travelDate);
        travelEnd.setHours(23, 59, 59, 999);
        
        const conflictingBookings = await Booking.find({
          listingId,
          listingType: 'Flight',
          roomType: seatType,
          status: { $in: ['Confirmed', 'Pending'] },
          travelDate: { $gte: travel, $lte: travelEnd }
        });
        
        const bookedSeats = conflictingBookings.reduce((sum, b) => sum + b.quantity, 0);
        const availableSeats = Math.max(0, (listing.availableSeats || 0) - bookedSeats);
        
        if (availableSeats < quantity) {
          throw new ValidationError(`Not enough seats available. Available: ${availableSeats}, Requested: ${quantity}`);
        }
      }
    } else if (listingType === 'Hotel') {
      if (!checkInDate || !checkOutDate) {
        throw new ValidationError('Check-in and check-out dates are required for hotels');
      }
      
      if (!roomType) {
        throw new ValidationError('Room type is required for hotel bookings');
      }
      
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      const availableFrom = new Date(listing.availableFrom);
      const availableTo = new Date(listing.availableTo);
      
      if (checkIn < availableFrom || checkOut > availableTo) {
        throw new ValidationError('Selected dates are outside the hotel\'s availability period');
      }
      
      if (checkIn >= checkOut) {
        throw new ValidationError('Check-out date must be after check-in date');
      }
      
      if (!listing.roomTypes || !Array.isArray(listing.roomTypes)) {
        throw new ValidationError('Hotel listing is missing room types information');
      }
      
      const selectedRoomType = listing.roomTypes.find(rt => rt.type === roomType);
      if (!selectedRoomType) {
        throw new ValidationError(`Room type '${roomType}' is not available at this hotel. Available types: ${listing.roomTypes.map(rt => rt.type).join(', ')}`);
      }
      
      const conflictingBookings = await Booking.find({
        listingId,
        listingType: 'Hotel',
        roomType: roomType,
        status: { $in: ['Confirmed', 'Pending'] },
        $or: [
          {
            checkInDate: { $lt: checkOut },
            checkOutDate: { $gt: checkIn }
          }
        ]
      }).session(session);
      
      const bookedQuantity = conflictingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
      const availableQuantity = selectedRoomType.availableCount - bookedQuantity;
      
      if (availableQuantity < quantity) {
        throw new ValidationError(`Not enough ${roomType} rooms available. Only ${availableQuantity} room(s) available for the selected dates.`);
      }
    } else if (listingType === 'Car') {
      if (listing.availabilityStatus !== 'Available') {
        throw new ValidationError('Car is not available');
      }
      if (!checkInDate || !checkOutDate) {
        throw new ValidationError('Pick-up and drop-off dates are required for car rentals');
      }
      
      const pickupDate = new Date(checkInDate);
      const dropoffDate = new Date(checkOutDate);
      const availableFrom = new Date(listing.availableFrom);
      const availableTo = new Date(listing.availableTo);
      
      if (pickupDate < availableFrom || dropoffDate > availableTo) {
        throw new ValidationError('Selected dates are outside the car\'s availability period');
      }
      
      if (pickupDate >= dropoffDate) {
        throw new ValidationError('Drop-off date must be after pick-up date');
      }
      
      const conflictingBookings = await Booking.find({
        listingId,
        listingType: 'Car',
        status: { $in: ['Confirmed', 'Pending'] },
        $or: [
          {
            checkInDate: { $lte: dropoffDate },
            checkOutDate: { $gte: pickupDate }
          }
        ]
      }).session(session);
      
      if (conflictingBookings.length > 0) {
        throw new ValidationError('Car is already booked for the selected dates');
      }
    }

    // Calculate total amount
    let totalAmount = 0;
    let seatType = roomType; // For flights, roomType is actually seatType
    
    if (listingType === 'Flight') {
      if (listing.seatTypes && Array.isArray(listing.seatTypes)) {
        // New format - get price from seat type
        const selectedSeatType = listing.seatTypes.find(st => st.type === seatType);
        if (!selectedSeatType) {
          throw new ValidationError(`Seat type '${seatType}' not found for price calculation`);
        }
        totalAmount = selectedSeatType.ticketPrice * quantity;
      } else {
        // Legacy format
        totalAmount = listing.ticketPrice * quantity;
      }
    } else if (listingType === 'Hotel') {
      const nights = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
      if (nights < 1) {
        throw new ValidationError('Stay period must be at least 1 night');
      }
      const priceRoomType = listing.roomTypes.find(rt => rt.type === roomType);
      if (!priceRoomType) {
        throw new ValidationError(`Room type '${roomType}' not found for price calculation`);
      }
      totalAmount = priceRoomType.pricePerNight * nights * quantity;
    } else if (listingType === 'Car') {
      const days = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
      if (days < 1) {
        throw new ValidationError('Rental period must be at least 1 day');
      }
      totalAmount = listing.dailyRentalPrice * days * quantity;
    }

    const bookingId = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const booking = new Booking({
      bookingId,
      userId,
      listingId,
      listingType,
      quantity,
      roomType: listingType === 'Hotel' ? roomType : (listingType === 'Flight' ? seatType : null), // For flights, store seat type in roomType field
      totalAmount,
      checkInDate: listingType === 'Hotel' || listingType === 'Car' ? checkInDate : null,
      checkOutDate: listingType === 'Hotel' || listingType === 'Car' ? checkOutDate : null,
      travelDate: listingType === 'Flight' ? travelDate : null,
      status: 'Pending',
      checkoutId,
      parentRequestId
    });

    logger.info(`[createBooking] Attempting to save booking`, {
      bookingId,
      userId,
      listingId,
      listingType,
      status: booking.status
    });

    await booking.save({ session });

    logger.info(`[createBooking] Booking saved successfully`, {
      bookingId,
      status: booking.status
    });

    // Update listing availability (if needed)
    // Note: For flights with seatTypes, availability is calculated dynamically from bookings
    // Legacy flights might need manual updates, but we skip to avoid conflicts
    try {
      // Availability is now calculated dynamically from bookings for all listing types
      // No manual updates needed
      logger.info(`[createBooking] Availability will be calculated dynamically from bookings`);
    } catch (error) {
      logger.warn(`[createBooking] Failed to update listing availability: ${error.message}`);
      // Don't fail the booking if availability update fails
    }

    await session.commitTransaction();

    logger.info(`[createBooking] Transaction committed`, {
      bookingId
    });

    // Invalidate cache
    await deleteCache(`user:${userId}:bookings`);

    logger.info(`[createBooking] Booking created via HTTP successfully`, {
      bookingId,
      userId,
      listingId,
      listingType,
      totalAmount: booking.totalAmount
    });

    res.json({
      success: true,
      message: 'Booking created successfully',
      data: { booking }
    });

  } catch (error) {
    await session.abortTransaction();
    throw error; // Let asyncHandler handle it
  } finally {
    session.endSession();
  }
});

/**
 * Cancel booking (DELETE endpoint)
 * Sets booking status to 'Cancelled'
 * Availability will be automatically recalculated since cancelled bookings are excluded from availability checks
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user?.userId; // From authentication middleware

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  const booking = await Booking.findOne({ bookingId });
  if (!booking) {
    throw new NotFoundError('Booking');
  }

  // Verify user owns this booking
  if (booking.userId !== userId) {
    throw new ValidationError('You can only cancel your own bookings');
  }

  // Check if already cancelled
  if (booking.status === 'Cancelled') {
    throw new ValidationError('Booking is already cancelled');
  }

  // Check if booking is in a state that can be cancelled
  if (booking.status === 'Failed') {
    throw new ValidationError('Cannot cancel a failed booking');
  }

  // If booking has a billingId, cancel all bookings with the same billingId
  // This ensures that when a user cancels one booking from a multi-room hotel reservation,
  // all bookings in that reservation (same billing) are cancelled together
  let cancelledBookings = [];
  
  if (booking.billingId) {
    // Find all bookings with the same billingId that belong to the same user
    const bookingsToCancel = await Booking.find({
      billingId: booking.billingId,
      userId: userId,
      status: { $nin: ['Cancelled', 'Failed'] } // Only cancel non-cancelled, non-failed bookings
    });

    if (bookingsToCancel.length === 0) {
      throw new ValidationError('No bookings found to cancel');
    }

    // Cancel all bookings in the billing group
    for (const bookingToCancel of bookingsToCancel) {
      bookingToCancel.status = 'Cancelled';
      bookingToCancel.updatedAt = new Date();
      await bookingToCancel.save();
      cancelledBookings.push(bookingToCancel.bookingId);
      
      // Invalidate individual booking cache
      await deleteCache(`booking:${bookingToCancel.bookingId}`);
    }

    logger.info(`Cancelled ${cancelledBookings.length} booking(s) with billingId ${booking.billingId} by user ${userId}`, {
      bookingIds: cancelledBookings,
      billingId: booking.billingId
    });
  } else {
    // Single booking without billingId - just cancel this one
    booking.status = 'Cancelled';
    booking.updatedAt = new Date();
    await booking.save();
    cancelledBookings.push(bookingId);
    
    // Invalidate individual booking cache
    await deleteCache(`booking:${bookingId}`);
    
    logger.info(`Booking cancelled: ${bookingId} by user ${userId}`);
  }

  // Clear all user booking caches (all status variations)
  await deleteCachePattern(`user:${userId}:bookings:*`);
  await deleteCachePattern(`user:${booking.userId}:bookings:*`);

  res.json({
    success: true,
    message: cancelledBookings.length > 1 
      ? `Successfully cancelled ${cancelledBookings.length} booking(s)`
      : 'Booking cancelled successfully',
    data: { 
      cancelledBookings,
      billingId: booking.billingId,
      count: cancelledBookings.length
    }
  });
});

module.exports = {
  getBooking,
  updateBooking,
  getUserBookings,
  markBookingsAsFailed,
  expirePendingBookings,
  createBooking,
  cancelBooking
};
