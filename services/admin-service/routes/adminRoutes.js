/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../../../shared/middleware/auth');

router.post('/register', adminController.register);
router.post('/login', adminController.login);
router.get('/listings/pending', authenticate, requireAdmin, adminController.getPendingListings);
router.get('/listings/approved', authenticate, requireAdmin, adminController.getApprovedListings);
router.put('/listings/:listingId/approve', authenticate, requireAdmin, adminController.approveListing);
router.put('/listings/:listingId/reject', authenticate, requireAdmin, adminController.rejectListing);
// User routes - search must come before /:userId to avoid route conflicts
router.get('/users/search', authenticate, requireAdmin, adminController.searchUsers);
router.get('/users/:userId', authenticate, requireAdmin, adminController.getUser);
router.put('/users/:userId', authenticate, requireAdmin, adminController.modifyUser);
router.get('/users', authenticate, requireAdmin, adminController.listUsers);
// Analytics routes - general analytics endpoint must come before specific ones
router.get('/analytics', authenticate, requireAdmin, adminController.getAnalytics);
router.get('/analytics/revenue', authenticate, requireAdmin, adminController.getRevenueAnalytics);
router.get('/analytics/providers', authenticate, requireAdmin, adminController.getProviderAnalytics);

module.exports = router;

