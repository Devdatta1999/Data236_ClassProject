/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../../../shared/middleware/auth');

router.post('/login', adminController.login);
router.get('/listings/pending', authenticate, requireAdmin, adminController.getPendingListings);
router.put('/listings/:listingId/approve', authenticate, requireAdmin, adminController.approveListing);
router.put('/listings/:listingId/reject', authenticate, requireAdmin, adminController.rejectListing);
router.get('/users', authenticate, requireAdmin, adminController.listUsers);
router.put('/users/:userId', authenticate, requireAdmin, adminController.modifyUser);
router.get('/analytics/revenue', authenticate, requireAdmin, adminController.getRevenueAnalytics);
router.get('/analytics/providers', authenticate, requireAdmin, adminController.getProviderAnalytics);

module.exports = router;

