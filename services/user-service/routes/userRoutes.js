/**
 * User Routes
 * Note: User registration and login can be handled via Kafka (user-events topic) or HTTP
 * HTTP endpoints are provided as a fallback and for reliability
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../../../shared/middleware/auth');

// Public routes (login and signup)
router.post('/login', userController.login);
router.post('/signup', userController.signup);

// Protected routes (non-high-traffic operations)
router.get('/:userId', authenticate, userController.getUser);
router.put('/:userId', authenticate, userController.updateUser);
router.delete('/:userId', authenticate, userController.deleteUser);
router.get('/:userId/bookings', authenticate, userController.getBookingHistory);
router.get('/:userId/reviews', authenticate, userController.getUserReviews);

// Credit card routes
router.post('/:userId/cards', authenticate, userController.addSavedCard);
router.get('/:userId/cards', authenticate, userController.getSavedCards);
router.get('/:userId/cards/decrypt', authenticate, userController.getDecryptedCard);
router.put('/:userId/cards', authenticate, userController.updateSavedCard);
router.delete('/:userId/cards', authenticate, userController.deleteSavedCard);

module.exports = router;

