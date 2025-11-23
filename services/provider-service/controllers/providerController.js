/**
 * Provider Controller
 */

const Provider = require('../models/Provider');
const { NotFoundError, ConflictError, ValidationError, asyncHandler } = require('../../../shared/utils/errors');
const { validateEmail, validatePhoneNumber } = require('../../../shared/utils/validators');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';

/**
 * Register provider
 */
const registerProvider = asyncHandler(async (req, res) => {
  const {
    providerId,
    providerName,
    email,
    phoneNumber,
    address
  } = req.body;

  validateEmail(email);
  validatePhoneNumber(phoneNumber);

  const existing = await Provider.findOne({ 
    $or: [{ providerId }, { email: email.toLowerCase() }] 
  });
  if (existing) {
    throw new ConflictError('Provider with this ID or email already exists');
  }

  const provider = new Provider({
    providerId,
    providerName,
    email: email.toLowerCase(),
    phoneNumber,
    address
  });

  await provider.save();

  logger.info(`Provider registered: ${providerId}`);

  res.status(201).json({
    success: true,
    message: 'Provider registered successfully',
    data: { provider }
  });
});

/**
 * Submit listing for approval
 */
const submitListing = asyncHandler(async (req, res) => {
  const { providerId } = req.user;
  const { listingType, listingData } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  const provider = await Provider.findOne({ providerId });
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  // Create listing via HTTP call to listing service (status will be Pending)
  try {
    const listingTypeLower = listingType.toLowerCase() + 's';
    await axios.post(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}`,
      {
        ...listingData,
        providerId,
        providerName: provider.providerName,
        status: 'Pending'
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    logger.error(`Failed to create listing: ${error.message}`);
    throw new ValidationError('Failed to submit listing');
  }

  logger.info(`Listing submitted by provider ${providerId}: ${listingType}`);

  res.status(202).json({
    success: true,
    message: 'Listing submitted for approval',
    data: {
      providerId,
      listingType,
      status: 'Pending'
    }
  });
});

/**
 * Get provider details
 */
const getProvider = asyncHandler(async (req, res) => {
  const { providerId } = req.params;

  const provider = await Provider.findOne({ providerId });
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  res.json({
    success: true,
    data: { provider }
  });
});

/**
 * Get provider analytics
 */
const getProviderAnalytics = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const { startDate, endDate } = req.query;

  const provider = await Provider.findOne({ providerId });
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  // Get billing data for this provider's listings
  // This would typically query the billing service
  // For now, return basic analytics

  const analytics = {
    providerId: provider.providerId,
    providerName: provider.providerName,
    totalListings: provider.listings.length,
    activeListings: provider.listings.filter(l => l.status === 'Active').length,
    pendingListings: provider.listings.filter(l => l.status === 'Pending').length,
    period: {
      startDate: startDate || null,
      endDate: endDate || null
    },
    // Additional analytics would be calculated from billing data
    revenue: 0,
    bookings: 0
  };

  res.json({
    success: true,
    data: { analytics }
  });
});

module.exports = {
  registerProvider,
  submitListing,
  getProvider,
  getProviderAnalytics
};

