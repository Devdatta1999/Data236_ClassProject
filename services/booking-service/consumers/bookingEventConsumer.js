/**
 * Booking Event Consumer - Handles frontend booking events via Kafka
 */

const Booking = require('../models/Booking');
const { ValidationError, TransactionError, NotFoundError } = require('../../../shared/utils/errors');
const { sendMessage } = require('../../../shared/config/kafka');
const logger = require('../../../shared/utils/logger');
const mongoose = require('mongoose');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';

/**
 * Handle booking creation event
 */
async function handleBookingCreate(event) {
  const {
    requestId,
    userId,
    listingId,
    listingType,
    quantity,
    checkInDate,
    checkOutDate,
    travelDate,
    checkoutId, // Optional: if part of checkout
    parentRequestId // Optional: parent checkout request ID
  } = event;

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
      const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`);
      listing = response.data.data[listingTypeLower.slice(0, -1)];
    } catch (error) {
      throw new NotFoundError('Listing');
    }

    // Check availability
    if (listingType === 'Flight') {
      if (listing.availableSeats < quantity) {
        throw new ValidationError('Not enough seats available');
      }
    } else if (listingType === 'Hotel') {
      if (listing.availableRooms < quantity) {
        throw new ValidationError('Not enough rooms available');
      }
      if (!checkInDate || !checkOutDate) {
        throw new ValidationError('Check-in and check-out dates are required for hotels');
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
      const Booking = require('../models/Booking');
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
      });
      
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
      const roomPrice = listing.roomTypes && listing.roomTypes.length > 0 
        ? listing.roomTypes[0].pricePerNight 
        : listing.pricePerNight || 0;
      totalAmount = roomPrice * nights * quantity;
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
      totalAmount,
      checkInDate: listingType === 'Hotel' || listingType === 'Car' ? checkInDate : null,
      checkOutDate: listingType === 'Hotel' || listingType === 'Car' ? checkOutDate : null,
      travelDate: listingType === 'Flight' ? travelDate : null,
      status: 'Pending',
      checkoutId,
      parentRequestId
    });

    await booking.save({ session });

    // Update listing availability
    try {
      if (listingType === 'Flight') {
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/flights/${listingId}`, {
          availableSeats: listing.availableSeats - quantity
        });
      } else if (listingType === 'Hotel') {
        await axios.put(`${LISTING_SERVICE_URL}/api/listings/hotels/${listingId}`, {
          availableRooms: listing.availableRooms - quantity
        });
      } else if (listingType === 'Car') {
        // For cars, availability is managed by date-based booking conflicts
        // No need to update availabilityStatus - conflicts are checked during booking
        logger.info(`Car booking created: ${listingId} for dates ${checkInDate} to ${checkOutDate}`);
      }
    } catch (error) {
      throw new TransactionError('Failed to update listing availability');
    }

    await session.commitTransaction();

    logger.info(`Booking created via Kafka: ${bookingId}`);

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
    logger.error(`Error handling booking create: ${error.message}`);
    
    await sendMessage('booking-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'booking.create',
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

    logger.info(`Received booking event: ${eventType}`, { requestId: event.requestId });

    switch (eventType) {
      case 'booking.create':
        await handleBookingCreate(event);
        break;
      case 'booking.cancel':
        await handleBookingCancel(event);
        break;
      default:
        logger.warn(`Unknown booking event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`Error processing booking event: ${error.message}`, error);
  }
}

module.exports = {
  handleBookingEvent
};

