/**
 * Provider Controller
 */

const Provider = require('../models/Provider');
const { NotFoundError, ConflictError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { validateEmail, validatePhoneNumber } = require('../../../shared/utils/validators');
const logger = require('../../../shared/utils/logger');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';

/**
 * Register provider
 */
const registerProvider = asyncHandler(async (req, res) => {
  logger.info('Provider registration request received', { body: req.body });

  const {
    providerId,
    providerName,
    email,
    password,
    phoneNumber,
    address
  } = req.body;

  if (!providerId || !providerName || !email || !password || !phoneNumber) {
    throw new ValidationError('Missing required fields: providerId, providerName, email, password, phoneNumber');
  }

  // Validate password length
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }

  validateEmail(email);
  validatePhoneNumber(phoneNumber);

  logger.info('Checking for existing provider...', { providerId, email });
  
  // CRITICAL: Fix #3 - Use mongoose from shared/config/database.js to ensure SAME instance
  // DO NOT require('mongoose') directly - always import from database.js
  const { mongoose, waitForMongoDBReady } = require('../../../shared/config/database');
  
  // Verify Provider model is using the SAME mongoose instance that was connected
  const providerDbInstance = Provider.db;
  const mongooseConnectionInstance = mongoose.connection;
  
  // CRITICAL VERIFICATION: Check if Provider model uses the connected mongoose instance
  if (!providerDbInstance || providerDbInstance.base !== mongooseConnectionInstance.base) {
    logger.error('CRITICAL: Provider model is using a DIFFERENT mongoose instance!', {
      providerDbExists: !!providerDbInstance,
      providerDbBase: providerDbInstance?.base?.constructor?.name,
      mongooseConnectionBase: mongooseConnectionInstance.base?.constructor?.name,
      areSameInstance: providerDbInstance?.base === mongooseConnectionInstance.base,
      providerDbReadyState: providerDbInstance?.readyState,
      mongooseReadyState: mongooseConnectionInstance.readyState
    });
    throw new Error('Provider model is using a different mongoose instance than the one that was connected');
  }
  
  // Log connection state for debugging
  logger.info('MongoDB connection state check:', {
    readyState: mongooseConnectionInstance.readyState,
    stateName: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongooseConnectionInstance.readyState] || 'unknown',
    hasDb: !!mongooseConnectionInstance.db,
    dbName: mongooseConnectionInstance.db?.databaseName,
    providerUsesSameInstance: providerDbInstance.base === mongooseConnectionInstance.base
  });
  
  // Wait for connection to be ready if needed
  if (mongooseConnectionInstance.readyState !== 1 || !mongooseConnectionInstance.db) {
    logger.warn('MongoDB connection not ready, ensuring connection...', {
      readyState: mongooseConnectionInstance.readyState,
      states: { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }
    });
    
    try {
      await waitForMongoDBReady(15000); // Wait up to 15 seconds
      
      // Verify connection is truly ready after wait
      if (mongooseConnectionInstance.readyState !== 1 || !mongooseConnectionInstance.db) {
        logger.error('MongoDB connection still not ready after waitForMongoDBReady', {
          readyState: mongooseConnectionInstance.readyState,
          hasDb: !!mongooseConnectionInstance.db
        });
        throw new Error(`MongoDB connection not ready after wait (readyState: ${mongooseConnectionInstance.readyState})`);
      }
      
      // Final verification with ping
      try {
        await mongooseConnectionInstance.db.admin().ping();
        logger.info('MongoDB connection verified and ready');
      } catch (pingError) {
        logger.error('MongoDB ping failed after reconnection:', pingError);
        throw new Error('MongoDB connection ping failed');
      }
    } catch (waitError) {
      logger.error('MongoDB connection not ready after wait:', waitError);
      throw new Error('Database connection is not available. Please try again later.');
    }
  }
  
  // Execute query - connection should be ready now
  logger.info('Executing Provider.findOne query...');
  const existing = await Provider.findOne({ 
    $or: [{ providerId }, { email: email.toLowerCase() }] 
  }).lean().maxTimeMS(15000);
  
  if (existing) {
    logger.warn('Provider already exists', { providerId, email });
    throw new ConflictError('Provider with this ID or email already exists');
  }

  logger.info('Creating new provider...');
  const provider = new Provider({
    providerId,
    providerName,
    email: email.toLowerCase(),
    password, // Will be hashed by pre-save hook
    phoneNumber,
    address
  });
  
  logger.info('Saving provider to database...');
  await provider.save({ maxTimeMS: 15000 });
  logger.info(`Provider registered successfully: ${providerId}`);

  // Convert to safe object (without password) for response
  const providerData = provider.toSafeObject();

  logger.info('Sending response...');
  if (!res.headersSent) {
    res.status(201).json({
      success: true,
      message: 'Provider registered successfully',
      data: { provider: providerData }
    });
    logger.info('Response sent successfully');
  }
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

  const provider = await Provider.findOne({ providerId }).maxTimeMS(10000);
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  // Create listing via HTTP call to listing service (status will be Pending)
  // CRITICAL: Pass authentication token to listing service
  try {
    const listingTypeLower = listingType.toLowerCase() + 's';
    
    // Get the authorization token from the request
    const authToken = req.headers.authorization || req.headers.Authorization;
    
    if (!authToken) {
      throw new ValidationError('Authentication token is required');
    }
    
    // Auto-generate listing ID if not provided
    let finalListingData = { ...listingData };
    if (listingType === 'Car' && !finalListingData.carId) {
      finalListingData.carId = `CAR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    } else if (listingType === 'Flight' && !finalListingData.flightId) {
      finalListingData.flightId = `FLT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    } else if (listingType === 'Hotel' && !finalListingData.hotelId) {
      finalListingData.hotelId = `HTL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }
    
    logger.info(`Calling listing service to create ${listingType} listing`, {
      url: `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}`,
      hasAuthToken: !!authToken,
      listingId: finalListingData.carId || finalListingData.flightId || finalListingData.hotelId
    });
    
    await axios.post(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}`,
      {
        ...finalListingData,
        providerId,
        providerName: provider.providerName,
        status: 'Pending'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken // Forward the auth token
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
 * Get current provider's own details (from token)
 */
const getMyProvider = asyncHandler(async (req, res) => {
  const { providerId } = req.user; // Get from authenticated user

  if (!providerId) {
    throw new ValidationError('Provider ID not found in token');
  }

  const provider = await Provider.findOne({ providerId });
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  res.json({
    success: true,
    data: { provider: provider.toSafeObject() }
  });
});

/**
 * Get provider details by ID
 */
const getProvider = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  
  logger.info('getProvider called', { providerId, path: req.path });

  // Don't match "listings" or "me" as providerId - these should be handled by specific routes
  if (providerId === 'listings' || providerId === 'me') {
    logger.warn(`getProvider called with reserved path: ${providerId}`);
    throw new NotFoundError('Provider');
  }

  const provider = await Provider.findOne({ providerId });
  if (!provider) {
    throw new NotFoundError('Provider');
  }

  res.json({
    success: true,
    data: { provider: provider.toSafeObject() }
  });
});

/**
 * Get provider analytics
 */
const getProviderAnalytics = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const { startDate, endDate } = req.query;

  const provider = await Provider.findOne({ providerId }).maxTimeMS(10000);
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

/**
 * Provider login
 */
const loginProvider = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Find provider with password field included
  const provider = await Provider.findOne({ email: email.toLowerCase() }).select('+password');
  if (!provider) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Verify password
  const isMatch = await provider.comparePassword(password);
  if (!isMatch) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Generate JWT token
  const { generateToken } = require('../../../shared/middleware/auth');
  const token = generateToken({
    providerId: provider.providerId,
    email: provider.email,
    role: 'provider'
  });

  logger.info(`Provider logged in: ${provider.providerId}`);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      provider: provider.toSafeObject(),
      token
    }
  });
});

/**
 * Get provider's own listings (all statuses)
 */
const getMyListings = asyncHandler(async (req, res) => {
  logger.info('getMyListings called', { user: req.user, path: req.path });
  const { providerId } = req.user; // Get from authenticated user

  if (!providerId) {
    throw new ValidationError('Provider ID not found in token');
  }

  // Get auth token to forward to listing service
  const authToken = req.headers.authorization || req.headers.Authorization;
  if (!authToken) {
    throw new ValidationError('Authentication token is required');
  }

  try {
    // Query listings from listing service by providerId
    const [flightsResponse, hotelsResponse, carsResponse] = await Promise.all([
      axios.get(`${LISTING_SERVICE_URL}/api/listings/flights/by-provider`, {
        params: { providerId },
        headers: { 'Authorization': authToken }
      }).catch(() => ({ data: { data: { flights: [] } } })),
      axios.get(`${LISTING_SERVICE_URL}/api/listings/hotels/by-provider`, {
        params: { providerId },
        headers: { 'Authorization': authToken }
      }).catch(() => ({ data: { data: { hotels: [] } } })),
      axios.get(`${LISTING_SERVICE_URL}/api/listings/cars/by-provider`, {
        params: { providerId },
        headers: { 'Authorization': authToken }
      }).catch(() => ({ data: { data: { cars: [] } } }))
    ]);

    // Extract listings from responses
    const flights = flightsResponse.data?.data?.flights || [];
    const hotels = hotelsResponse.data?.data?.hotels || [];
    const cars = carsResponse.data?.data?.cars || [];

    // Combine all listings with their types
    const allListings = [
      ...flights.map(f => ({ ...f, listingType: 'Flight', listingId: f.flightId })),
      ...hotels.map(h => ({ ...h, listingType: 'Hotel', listingId: h.hotelId })),
      ...cars.map(c => ({ ...c, listingType: 'Car', listingId: c.carId }))
    ];

    logger.info(`Fetched ${allListings.length} listings for provider ${providerId}`, {
      flights: flights.length,
      hotels: hotels.length,
      cars: cars.length
    });

    res.json({
      success: true,
      data: { listings: allListings }
    });
  } catch (error) {
    logger.error('Error fetching provider listings:', error);
    throw error;
  }
});

/**
 * Delete provider's listing
 */
const deleteMyListing = asyncHandler(async (req, res) => {
  const { providerId } = req.user; // Get from authenticated user
  const { listingId, listingType } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  // Get auth token to forward to listing service
  const authToken = req.headers.authorization || req.headers.Authorization;
  if (!authToken) {
    throw new ValidationError('Authentication token is required');
  }

  // Import models to verify ownership
  const Flight = require('../../listing-service/models/Flight');
  const Hotel = require('../../listing-service/models/Hotel');
  const Car = require('../../listing-service/models/Car');

  let listing;
  const listingTypeLower = listingType.toLowerCase() + 's';

  // Verify listing exists and belongs to this provider
  if (listingType === 'Flight') {
    listing = await Flight.findOne({ flightId: listingId, providerId });
  } else if (listingType === 'Hotel') {
    listing = await Hotel.findOne({ hotelId: listingId, providerId });
  } else if (listingType === 'Car') {
    listing = await Car.findOne({ carId: listingId, providerId });
  }

  if (!listing) {
    throw new NotFoundError('Listing not found or you do not have permission to delete it');
  }

  // Call listing service to delete
  try {
    await axios.delete(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`,
      {
        headers: {
          'Authorization': authToken
        }
      }
    );

    logger.info(`Listing deleted by provider ${providerId}: ${listingId} (${listingType})`);

    res.json({
      success: true,
      message: 'Listing deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting listing: ${error.message}`, {
      listingId,
      listingType,
      response: error.response?.data
    });
    
    if (error.response?.status === 404) {
      throw new NotFoundError('Listing not found');
    }
    throw new ValidationError('Failed to delete listing: ' + (error.response?.data?.error?.message || error.message));
  }
});

module.exports = {
  registerProvider,
  loginProvider,
  submitListing,
  getProvider,
  getMyProvider,
  getProviderAnalytics,
  getMyListings,
  deleteMyListing
};

