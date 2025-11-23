/**
 * Provider Routes
 */

const express = require('express');
const router = express.Router();
const providerController = require('../controllers/providerController');
const { authenticate, requireProvider } = require('../../../shared/middleware/auth');

router.post('/register', providerController.registerProvider);
router.post('/listings', authenticate, requireProvider, providerController.submitListing);
router.get('/:providerId', authenticate, providerController.getProvider);
router.get('/:providerId/analytics', authenticate, requireProvider, providerController.getProviderAnalytics);

module.exports = router;

