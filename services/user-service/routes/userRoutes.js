/**
 * User Routes
 * Note: User registration and login are handled via Kafka (user-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../../../shared/middleware/auth');

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

