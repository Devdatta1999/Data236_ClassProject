/**
 * Billing Routes
 * Note: Payment processing and checkout are handled via Kafka (payment-events and checkout-events topics)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authenticate, requireAdmin } = require('../../../shared/middleware/auth');

// Non-high-traffic operations
router.get('/:billingId', authenticate, billingController.getBilling);
router.get('/user/:userId', authenticate, billingController.getUserBillingHistory);
router.get('/search', authenticate, requireAdmin, billingController.searchBills);
router.get('/invoice/:billingId', authenticate, billingController.getInvoice);

module.exports = router;

