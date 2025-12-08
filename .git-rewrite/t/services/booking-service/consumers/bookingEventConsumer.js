/**
 * Booking Event Consumer - Handles frontend booking events via Kafka
 */

const { mongoose, waitForMongoDBReady } = require('../../../shared/config/database');
const Booking = require('../models/Booking');
const { ValidationError, TransactionError, NotFoundError } = require('../../../shared/utils/errors');
const { sendMessage } = require('../../../shared/config/kafka');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';

/**
 * Handle booking creation event
 */
async function handleBookingCreate(event) {
  logger.info(`[handleBookingCreate] Starting booking creation`, {
    requestId: event.requestId,
    listingType: event.listingType,
    listingId: event.listingId,
    roomType: event.roomType,
    userId: event.userId
  });

  const {
    requestId,
    userId,
    listingId,
    listingType,
    quantity,
    checkInDate,
    checkOutDate,
    travelDate,
    roomType, // For hotels: 'Standard', 'Suite', 'Deluxe', etc.
    checkoutId, // Optional: if part of checkout
    parentRequestId // Optional: parent checkout request ID
  } = event;

  // CRITICAL: Ensure MongoDB is ready before starting transaction
  if (mongoose.connection.readyState === 0) {
    logger.warn('MongoDB disconnected, waiting for connection...');
    await waitForMongoDBReady(5000); // 5 second timeout
  }

  // Verify connection is ready
  if (mongoose.connection.readyState !== 1) {
    throw new Error(`MongoDB not ready for booking creation. State: ${mongoose.connection.readyState}`);
  }

  // Before creating new booking, expire old Pending bookings for this user/listing
  // This prevents abandoned checkouts from blocking new bookings
  try {
    const Booking = require('../models/Booking');
    const expiryTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    
    const oldPendingBookings = await Booking.find({
      userId,
      listingId,
      listingType,
      status: 'Pending',
      createdAt: { $lt: expiryTime }
    });

    if (oldPendingBookings.length > 0) {
      logger.info(`Expiring ${oldPendingBookings.length} old Pending booking(s) for user ${userId}, listing ${listingId}`);
      for (const oldBooking of oldPendingBookings) {
        oldBooking.status = 'Failed';
        oldBooking.updatedAt = new Date();
        await oldBooking.save();
        logger.info(`Expired old booking: ${oldBooking.bookingId}`);
      }
    }
  } catch (expiryError) {
    logger.warn(`Failed to expire old pending bookings: ${expiryError.message}`);
    // Continue with booking creation even if expiry check fails
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
      throw new ValidationError('Invalid listing type');
    }

    if (!quantity || quantity < 1) {
      throw new ValidationError('Quantity must be at least 1');
    }

    // Fetch listing details
    let listing;
    try {
      const listingTypeLower = listingType.toLowerCase() + 's';
      logger.info(`[handleBookingCreate] Fetching listing: ${listingTypeLower}/${listingId}`);
      const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`);
      listing = response.data.data[listingTypeLower.slice(0, -1)];
      logger.info(`[handleBookingCreate] Listing fetched successfully`, {
        listingId,
        listingType,
        hasRoomTypes: listing.roomTypes ? listing.roomTypes.length : 0
      });
    } catch (error) {
      logger.error(`[handleBookingCreate] Failed to fetch listing: ${error.message}`, {
        listingId,
        listingType,
        error: error.message,
        response: error.response?.data
      });
      throw new NotFoundError(`Listing not found: ${listingId}`);
    }

    // Check availability
    if (listingType === 'Flight') {
      if (listing.availableSeats < quantity) {
        throw new ValidationError('Not enough seats available');
      }
    } else if (listingType === 'Hotel') {
      if (!checkInDate || !checkOutDate) {
        throw new ValidationError('Check-in and check-out dates are required for hotels');
      }
      
      if (!roomType) {
        throw new ValidationError('Room type is required for hotel bookings');
      }
      
      // Validate dates
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
      
      // Validate roomTypes array exists
      if (!listing.roomTypes || !Array.isArray(listing.roomTypes)) {
        logger.error(`[handleBookingCreate] Hotel listing missing roomTypes array`, {
          listingId,
          listingType,
          hasRoomTypes: !!listing.roomTypes,
          roomTypesType: typeof listing.roomTypes
        });
        throw new ValidationError('Hotel listing is missing room types information');
      }
      
      // Find the room type in the hotel
      logger.info(`[handleBookingCreate] Looking for room type: ${roomType}`, {
        listingId,
        availableRoomTypes: listing.roomTypes.map(rt => rt.type),
        requestedRoomType: roomType
      });
      
      const selectedRoomType = listing.roomTypes.find(rt => rt.type === roomType);
      if (!selectedRoomType) {
        logger.error(`[handleBookingCreate] Room type not found in hotel`, {
          listingId,
          requestedRoomType: roomType,
          availableRoomTypes: listing.roomTypes.map(rt => rt.type)
        });
        throw new ValidationError(`Room type '${roomType}' is not available at this hotel. Available types: ${listing.roomTypes.map(rt => rt.type).join(', ')}`);
      }
      
      // Calculate availability for this room type for the date range
      // Use session for read consistency within transaction
      const conflictingBookings = await Booking.find({
        listingId,
        listingType: 'Hotel',
        roomType: roomType,
        status: { $in: ['Confirmed', 'Pending'] }, // Exclude 'Failed' and 'Cancelled'
        $or: [
          {
            checkInDate: { $lt: checkOut },
            checkOutDate: { $gt: checkIn }
          }
        ]
      }).session(session);
      
      // Sum up booked quantities
      const bookedQuantity = conflictingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
      const availableQuantity = selectedRoomType.availableCount - bookedQuantity;
      
      logger.info(`[handleBookingCreate] Room availability check`, {
        roomType,
        availableCount: selectedRoomType.availableCount,
        bookedQuantity,
        availableQuantity,
        requestedQuantity: quantity
      });
      
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
      
      // Validate dates are within car's availability window
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
      
      // Check for date conflicts with existing bookings
      // Exclude 'Failed' bookings as they don't hold inventory
      // Use session for read consistency within transaction
      const conflictingBookings = await Booking.find({
        listingId,
        listingType: 'Car',
        status: { $in: ['Confirmed', 'Pending'] }, // Exclude 'Failed' and 'Cancelled'
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
    if (listingType === 'Flight') {
      totalAmount = listing.ticketPrice * quantity;
    } else if (listingType === 'Hotel') {
      const nights = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
      if (nights < 1) {
        throw new ValidationError('Stay period must be at least 1 night');
      }
      // Get price for the selected room type (reuse the one found earlier for availability check)
      // Note: selectedRoomType is already found above, but we need to find it again here
      // because it's in a different scope. This is safe because we already validated it exists.
      const priceRoomType = listing.roomTypes.find(rt => rt.type === roomType);
      if (!priceRoomType) {
        logger.error(`[handleBookingCreate] Room type not found for price calculation`, {
          listingId,
          roomType,
          availableRoomTypes: listing.roomTypes.map(rt => rt.type)
        });
        throw new ValidationError(`Room type '${roomType}' not found for price calculation`);
      }
      totalAmount = priceRoomType.pricePerNight * nights * quantity;
      
      logger.info(`[handleBookingCreate] Calculated total amount for hotel booking`, {
        listingId,
        roomType,
        pricePerNight: priceRoomType.pricePerNight,
        nights,
        quantity,
        totalAmount
      });
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
      roomType: listingType === 'Hotel' ? roomType : null,
      totalAmount,
      checkInDate: listingType === 'Hotel' || listingType === 'Car' ? checkInDate : null,
      checkOutDate: listingType === 'Hotel' || listingType === 'Car' ? checkOutDate : null,
      travelDate: listingType === 'Flight' ? travelDate : null,
      status: 'Pending',
      checkoutId,
      parentRequestId
    });

    logger.info(`Attempting to save booking: ${bookingId}`, {
      userId,
      listingId,
      listingType,
      roomType,
      quantity,
      totalAmount,
      status: booking.status
    });

    await booking.save({ session });
    
    logger.info(`Booking saved successfully: ${bookingId}`, {
      bookingId: booking.bookingId,
      status: booking.status
    });

    // Update listing availability
    try {
      if (listingType === 'Flight') {
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/flights/${listingId}`, {
          availableSeats: listing.availableSeats - quantity
        });
      } else if (listingType === 'Hotel') {
        // For hotels, availability is calculated dynamically based on bookings
        // No need to update availableRooms - it's calculated from bookings
        logger.info(`Hotel booking created: ${listingId} for ${roomType} room(s) from ${checkInDate} to ${checkOutDate}`);
      } else if (listingType === 'Car') {
        // For cars, availability is managed by date-based booking conflicts
        // No need to update availabilityStatus - conflicts are checked during booking
        logger.info(`Car booking created: ${listingId} for dates ${checkInDate} to ${checkOutDate}`);
      }
    } catch (error) {
      throw new TransactionError('Failed to update listing availability');
    }

    await session.commitTransaction();

    logger.info(`[handleBookingCreate] Booking created and committed: ${bookingId}`, {
      bookingId,
      userId,
      listingId,
      listingType,
      roomType,
      status: booking.status,
      totalAmount: booking.totalAmount
    });

    await sendMessage('booking-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'booking.create',
        data: { booking },
        // Include checkout info if this is part of a checkout
        checkoutId: event.checkoutId || null,
        parentRequestId: event.parentRequestId || null
      }
    });

  } catch (error) {
    await session.abortTransaction();
    logger.error(`[handleBookingCreate] Error handling booking create: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      requestId,
      listingId,
      listingType,
      roomType,
      userId
    });
    
    await sendMessage('booking-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'booking.create',
        error: {
          code: error.code || 'BOOKING_ERROR',
          message: error.message
        },
        // Include checkout info even on failure so billing service can aggregate
        checkoutId: event.checkoutId || null,
        parentRequestId: event.parentRequestId || null,
        data: {
          listingId: event.listingId,
          listingType: event.listingType
        }
      }
    });
  } finally {
    session.endSession();
  }
}

/**
 * Handle booking cancellation event
 */
async function handleBookingCancel(event) {
  const { requestId, bookingId, userId } = event;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const booking = await Booking.findOne({ bookingId }).session(session);
    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.status === 'Cancelled') {
      throw new ValidationError('Booking is already cancelled');
    }

    booking.status = 'Cancelled';
    await booking.save({ session });

    // Restore listing availability
    try {
      if (booking.listingType === 'Flight') {
        const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/flights/${booking.listingId}`);
        const flight = response.data.data.flight;
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/flights/${booking.listingId}`, {
          availableSeats: flight.availableSeats + booking.quantity
        });
      } else if (booking.listingType === 'Hotel') {
        const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/hotels/${booking.listingId}`);
        const hotel = response.data.data.hotel;
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/hotels/${booking.listingId}`, {
          availableRooms: hotel.availableRooms + booking.quantity
        });
      } else if (booking.listingType === 'Car') {
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/cars/${booking.listingId}`, {
          availabilityStatus: 'Available'
        });
      }
    } catch (error) {
      throw new TransactionError('Failed to restore listing availability');
    }

    await session.commitTransaction();

    logger.info(`Booking cancelled via Kafka: ${bookingId}`);

    await sendMessage('booking-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'booking.cancel',
        data: { booking }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error handling booking cancel: ${error.message}`);
    
    await sendMessage('booking-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'booking.cancel',
        error: {
          code: error.code || 'BOOKING_ERROR',
          message: error.message
        }
      }
    });
  } finally {
    session.endSession();
  }
}

/**
 * Kafka message handler
 */
async function handleBookingEvent(topic, message, metadata) {
  try {
    const event = typeof message === 'string' ? JSON.parse(message) : message;
    const { eventType } = event;

    logger.info(`[handleBookingEvent] Received booking event: ${eventType}`, { 
      requestId: event.requestId,
      listingType: event.listingType,
      listingId: event.listingId,
      userId: event.userId
    });

    switch (eventType) {
      case 'booking.create':
        await handleBookingCreate(event);
        break;
      case 'booking.cancel':
        await handleBookingCancel(event);
        break;
      default:
        logger.warn(`[handleBookingEvent] Unknown booking event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`[handleBookingEvent] Error processing booking event: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      event: typeof message === 'string' ? JSON.parse(message) : message
    });
  }
}

module.exports = {
  handleBookingEvent
};

