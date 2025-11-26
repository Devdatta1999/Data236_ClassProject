/**
 * Billing Routes
 * Note: Payment processing and checkout are now handled via HTTP
 * Kafka is still used for login, signup, and search
 */

const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authenticate, requireAdmin } = require('../../../shared/middleware/auth');

// Checkout and payment endpoints (HTTP)
router.post('/checkout', billingController.checkout);
router.post('/payment', billingController.processPayment);

// Non-high-traffic operations
router.get('/:billingId', authenticate, billingController.getBilling);
router.get('/user/:userId', authenticate, billingController.getUserBillingHistory);
router.get('/search', authenticate, requireAdmin, billingController.searchBills);
router.get('/invoice/:billingId', authenticate, billingController.getInvoice);

module.exports = router;

