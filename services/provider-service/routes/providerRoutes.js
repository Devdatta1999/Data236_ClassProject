/**
 * Provider Routes
 */

const express = require('express');
const router = express.Router();
const providerController = require('../controllers/providerController');
const { authenticate, requireProvider } = require('../../../shared/middleware/auth');
const { upload, uploadProfilePicture, handleUploadError } = require('../controllers/uploadController');

router.post('/register', providerController.registerProvider);
router.post('/login', providerController.loginProvider);

// Profile picture upload route (protected)
router.post('/upload/profile-picture', authenticate, requireProvider, upload.single('profilePicture'), handleUploadError, uploadProfilePicture);
router.get('/search', providerController.searchProviders); // Search providers (for autocomplete)
router.post('/listings', authenticate, requireProvider, providerController.submitListing);
router.get('/listings', authenticate, requireProvider, providerController.getMyListings);
router.delete('/listings', authenticate, requireProvider, providerController.deleteMyListing);
router.get('/me', authenticate, requireProvider, providerController.getMyProvider);
router.put('/me', authenticate, requireProvider, providerController.updateProvider);
router.post('/sync-images', authenticate, requireProvider, providerController.syncProviderImageToAllListings);
router.get('/:providerId', authenticate, providerController.getProvider);
router.get('/:providerId/analytics', authenticate, requireProvider, providerController.getProviderAnalytics);

module.exports = router;

