/**
 * Booking Routes
 * Note: Booking creation is now handled via HTTP (POST /api/bookings/create)
 * Kafka is still used for login, signup, and search
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../../../shared/middleware/auth');

// Booking management endpoints (must be before /:bookingId to avoid route conflicts)
router.post('/fail', bookingController.markBookingsAsFailed); // No auth needed for internal service calls
router.post('/expire', bookingController.expirePendingBookings); // No auth needed for internal service calls

// Booking creation endpoint (for checkout flow) - must be before /:bookingId
router.post('/create', bookingController.createBooking); // No auth needed for internal service calls

// Non-high-traffic operations (these must come AFTER specific routes like /create, /fail, /expire)
router.get('/user/:userId', authenticate, bookingController.getUserBookings);
router.get('/:bookingId', authenticate, bookingController.getBooking);
router.put('/:bookingId', authenticate, bookingController.updateBooking);
router.delete('/:bookingId', authenticate, bookingController.cancelBooking);

module.exports = router;

