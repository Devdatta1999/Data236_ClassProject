/**
 * Provider Routes
 */

const express = require('express');
const router = express.Router();
const providerController = require('../controllers/providerController');
const { authenticate, requireProvider } = require('../../../shared/middleware/auth');

router.post('/register', providerController.registerProvider);
router.post('/login', providerController.loginProvider);
router.post('/listings', authenticate, requireProvider, providerController.submitListing);
router.get('/listings', authenticate, requireProvider, providerController.getMyListings);
router.delete('/listings', authenticate, requireProvider, providerController.deleteMyListing);
router.get('/me', authenticate, requireProvider, providerController.getMyProvider);
router.get('/:providerId', authenticate, providerController.getProvider);
router.get('/:providerId/analytics', authenticate, requireProvider, providerController.getProviderAnalytics);

module.exports = router;

