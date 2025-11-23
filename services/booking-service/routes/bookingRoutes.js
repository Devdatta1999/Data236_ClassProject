/**
 * Booking Routes
 * Note: Booking creation and cancellation are handled via Kafka (booking-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../../../shared/middleware/auth');

// Non-high-traffic operations
router.get('/:bookingId', authenticate, bookingController.getBooking);
router.put('/:bookingId', authenticate, bookingController.updateBooking);
router.get('/user/:userId', authenticate, bookingController.getUserBookings);

module.exports = router;

