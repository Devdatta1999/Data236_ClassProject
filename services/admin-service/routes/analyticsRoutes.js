/**
 * Analytics Routes
 * Routes for admin and host analytics endpoints
 */

const express = require('express');
const router = express.Router();

// Import controllers
const analyticsController = require('../controllers/analyticsController');
// Lazy load hostAnalyticsController only when host routes are accessed to avoid Kafka initialization
let hostAnalyticsController = null;
const getHostAnalyticsController = () => {
  if (!hostAnalyticsController) {
    hostAnalyticsController = require('../controllers/hostAnalyticsController');
  }
  return hostAnalyticsController;
};

/**
 * ADMIN ANALYTICS ROUTES
 */
router.get('/admin/overview', analyticsController.getAdminOverview);
router.get('/admin/top-properties', analyticsController.getTopPropertiesByRevenue);
router.get('/admin/city-revenue', analyticsController.getCityWiseRevenue);
router.get('/admin/top-providers', analyticsController.getTopProviders);
router.get('/admin/revenue-trend', analyticsController.getRevenueTrend);
router.get('/admin/providers', analyticsController.getAllProviders);

/**
 * HOST/PROVIDER ANALYTICS ROUTES
 * Lazy load controller to avoid Kafka initialization on startup
 */
router.get('/host/:providerId/page-clicks', (req, res, next) => {
  getHostAnalyticsController().getPageClicks(req, res, next);
});
router.get('/host/:providerId/listing-clicks', (req, res, next) => {
  getHostAnalyticsController().getListingClicks(req, res, next);
});
router.get('/host/:providerId/least-viewed', (req, res, next) => {
  getHostAnalyticsController().getLeastViewedSections(req, res, next);
});
router.get('/host/:providerId/reviews', (req, res, next) => {
  getHostAnalyticsController().getReviewsAnalytics(req, res, next);
});
router.get('/host/:providerId/profitability', (req, res, next) => {
  getHostAnalyticsController().getHostProfitability(req, res, next);
});

/**
 * USER TRACE AND COHORT ANALYSIS
 */
router.get('/user-trace/:userId', (req, res, next) => {
  getHostAnalyticsController().getUserTrace(req, res, next);
});
router.get('/cohort', (req, res, next) => {
  getHostAnalyticsController().getCohortAnalysis(req, res, next);
});

/**
 * EVENT TRACKING
 */
router.post('/track', (req, res, next) => {
  getHostAnalyticsController().trackEvent(req, res, next);
});

module.exports = router;

