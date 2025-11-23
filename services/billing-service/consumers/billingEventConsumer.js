/**
 * Billing Event Consumer - Handles frontend checkout and payment events via Kafka
 */

const { getPostgresPool } = require('../../../shared/config/database');
const { NotFoundError, ValidationError, TransactionError } = require('../../../shared/utils/errors');
const { sendMessage } = require('../../../shared/config/kafka');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';

// Store pending checkout requests to match with booking responses
const pendingCheckouts = new Map();

/**
 * Handle checkout initiation event (cart checkout)
 * Publishes booking.create events for each cart item
 */
async function handleCheckoutInitiate(event) {
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
    for (const item of cartItems) {
      const bookingRequestId = `${requestId}-${item.listingId}`;
      
      await sendMessage('booking-events', {
        key: bookingRequestId,
        value: {
          requestId: bookingRequestId,
          eventType: 'booking.create',
          userId,
          listingId: item.listingId,
          listingType: item.listingType,
          quantity: item.quantity,
          checkInDate: item.checkInDate,
          checkOutDate: item.checkOutDate,
          travelDate: item.travelDate,
          checkoutId, // Include checkout ID for correlation
          parentRequestId: requestId // Link back to checkout request
        }
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

  if (bookingResponse.success) {
    checkout.bookings.push(bookingResponse.data.booking);
  }

  checkout.completed++;

  // If all bookings are complete, send checkout response
  if (checkout.completed === checkout.totalItems) {
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
 * Rollback booking status updates (compensation transaction)
 * Sets bookings back to Pending status if payment failed
 */
async function rollbackBookingStatuses(confirmedBookings) {
  const rollbackErrors = [];
  
  for (const bookingId of confirmedBookings) {
    try {
      await axios.put(`${BOOKING_SERVICE_URL}/api/bookings/${bookingId}`, {
        status: 'Pending',
        billingId: null // Remove billing ID
      });
      logger.info(`Rolled back booking status: ${bookingId}`);
    } catch (error) {
      rollbackErrors.push({ bookingId, error: error.message });
      logger.error(`Failed to rollback booking ${bookingId}: ${error.message}`);
    }
  }
  
  if (rollbackErrors.length > 0) {
    logger.error('Some booking rollbacks failed:', rollbackErrors);
    // In production, you might want to publish to a dead-letter queue
    // or alert monitoring system for manual intervention
  }
  
  return rollbackErrors;
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

  const pool = getPostgresPool();
  const client = await pool.connect();
  
  // Track bookings that have been confirmed (for rollback if needed)
  const confirmedBookings = [];

  try {
    await client.query('BEGIN');

    // Get booking details
    const bookings = [];
    for (const bookingId of bookingIds) {
      try {
        const response = await axios.get(`${BOOKING_SERVICE_URL}/api/bookings/${bookingId}`);
        bookings.push(response.data.data.booking);
      } catch (error) {
        throw new NotFoundError(`Booking ${bookingId}`);
      }
    }

    // Validate all bookings are in Pending status
    for (const booking of bookings) {
      if (booking.status !== 'Pending') {
        throw new ValidationError(`Booking ${booking.bookingId} is not in pending status`);
      }
    }

    // Create billing records for each booking
    const bills = [];
    const finalBillingId = billingId || `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Step 1: Create all billing records in PostgreSQL transaction
    for (const booking of bookings) {
      const insertQuery = `
        INSERT INTO bills (
          billing_id, user_id, booking_type, booking_id, 
          transaction_date, total_amount, payment_method, 
          transaction_status, invoice_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const invoiceDetails = {
        bookingId: booking.bookingId,
        listingId: booking.listingId,
        listingType: booking.listingType,
        quantity: booking.quantity,
        bookingDate: booking.bookingDate,
        checkoutId
      };

      const result = await client.query(insertQuery, [
        `${finalBillingId}-${booking.bookingId}`,
        userId,
        booking.listingType,
        booking.bookingId,
        new Date(),
        booking.totalAmount,
        paymentMethod,
        'Completed',
        JSON.stringify(invoiceDetails)
      ]);

      bills.push(result.rows[0]);
    }

    // Step 2: Commit PostgreSQL transaction first
    await client.query('COMMIT');
    logger.info(`Billing records created: ${finalBillingId}`, { bookingCount: bookings.length });

    // Step 3: Update booking statuses AFTER successful payment commit
    // If any booking update fails, we need to rollback the billing records
    try {
      for (const booking of bookings) {
        try {
          await axios.put(`${BOOKING_SERVICE_URL}/api/bookings/${booking.bookingId}`, {
            status: 'Confirmed',
            billingId: `${finalBillingId}-${booking.bookingId}`
          });
          confirmedBookings.push(booking.bookingId);
          logger.info(`Booking confirmed: ${booking.bookingId}`);
        } catch (error) {
          // If booking update fails, we need to rollback everything
          logger.error(`Failed to update booking ${booking.bookingId} status: ${error.message}`);
          throw new TransactionError(`Failed to update booking ${booking.bookingId} status: ${error.message}`);
        }
      }
    } catch (bookingUpdateError) {
      // Rollback booking statuses that were already confirmed
      if (confirmedBookings.length > 0) {
        logger.warn(`Rolling back ${confirmedBookings.length} booking statuses due to payment failure`);
        await rollbackBookingStatuses(confirmedBookings);
      }
      
      // Rollback billing records (compensation transaction)
      // Note: Since we already committed, we need to mark bills as failed or delete them
      // For now, we'll update them to 'Failed' status
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
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Transaction might already be committed, check if we need to rollback bookings
      if (confirmedBookings.length > 0) {
        logger.warn(`Rolling back ${confirmedBookings.length} booking statuses after payment failure`);
        await rollbackBookingStatuses(confirmedBookings);
      }
    }
    
    logger.error(`Error handling payment complete: ${error.message}`, {
      requestId,
      userId,
      confirmedBookingsCount: confirmedBookings.length
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
    client.release();
  }
}

/**
 * Kafka message handler
 */
async function handleBillingEvent(topic, message, metadata) {
  try {
    const event = typeof message === 'string' ? JSON.parse(message) : message;
    const { eventType } = event;

    logger.info(`Received billing event: ${eventType}`, { requestId: event.requestId });

    switch (eventType) {
      case 'checkout.initiate':
        await handleCheckoutInitiate(event);
        break;
      case 'payment.complete':
        await handlePaymentComplete(event);
        break;
      default:
        logger.warn(`Unknown billing event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`Error processing billing event: ${error.message}`, error);
  }
}

module.exports = {
  handleBillingEvent,
  handleBookingResponseForCheckout,
  rollbackBookingStatuses
};

