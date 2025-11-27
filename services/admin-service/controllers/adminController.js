/**
 * Admin Controller
 */

const Admin = require('../models/Admin');
const mongoose = require('mongoose');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const { NotFoundError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { generateToken } = require('../../../shared/middleware/auth');
// Kafka removed - using HTTP for inter-service communication
const { getPostgresPool } = require('../../../shared/config/database');
const logger = require('../../../shared/utils/logger');

/**
 * Admin registration
 */
const register = asyncHandler(async (req, res) => {
  const {
    adminId,
    firstName,
    lastName,
    email,
    password,
    phoneNumber,
    address
  } = req.body;

  if (!adminId || !firstName || !lastName || !email || !password || !phoneNumber) {
    throw new ValidationError('Missing required fields: adminId, firstName, lastName, email, password, phoneNumber');
  }

  // Validate password length
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }

  const { validateEmail, validatePhoneNumber } = require('../../../shared/utils/validators');
  validateEmail(email);
  validatePhoneNumber(phoneNumber);

  // Check if admin already exists
  const existing = await Admin.findOne({ 
    $or: [{ adminId }, { email: email.toLowerCase() }] 
  });

  if (existing) {
    throw new ValidationError('Admin with this ID or email already exists');
  }

  const admin = new Admin({
    adminId,
    firstName,
    lastName,
    email: email.toLowerCase(),
    password, // Will be hashed by pre-save hook
    phoneNumber,
    address
  });

  await admin.save();

  logger.info(`Admin registered: ${adminId}`);

  res.status(201).json({
    success: true,
    message: 'Admin registered successfully',
    data: { admin: admin.toSafeObject() }
  });
});

/**
 * Admin login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
  if (!admin) {
    throw new AuthenticationError('Invalid credentials');
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    throw new AuthenticationError('Invalid credentials');
  }

  const token = generateToken({
    adminId: admin.adminId,
    email: admin.email,
    role: 'admin',
    accessLevel: admin.accessLevel
  });

  logger.info(`Admin logged in: ${admin.adminId}`);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      admin: admin.toSafeObject(),
      token
    }
  });
});

/**
 * Get pending listings
 * CRITICAL: Query MongoDB directly since search endpoints are Kafka-only
 */
const getPendingListings = asyncHandler(async (req, res) => {
  const { listingType } = req.query;

  const pendingListings = {
    flights: [],
    hotels: [],
    cars: []
  };

  try {
    // Import models directly to query MongoDB
    // Path: /workspace/services/admin-service/controllers -> /workspace/services/listing-service/models
    // From admin-service/controllers: ../../listing-service/models
    const Flight = require('../../listing-service/models/Flight');
    const Hotel = require('../../listing-service/models/Hotel');
    const Car = require('../../listing-service/models/Car');

    // Query pending listings directly from MongoDB
    if (!listingType || listingType === 'Flight') {
      pendingListings.flights = await Flight.find({ status: 'Pending' }).lean();
    }
    if (!listingType || listingType === 'Hotel') {
      pendingListings.hotels = await Hotel.find({ status: 'Pending' }).lean();
    }
    if (!listingType || listingType === 'Car') {
      pendingListings.cars = await Car.find({ status: 'Pending' }).lean();
    }

    logger.info(`Fetched pending listings: ${pendingListings.flights.length} flights, ${pendingListings.hotels.length} hotels, ${pendingListings.cars.length} cars`);
  } catch (error) {
    logger.error('Error fetching pending listings:', error);
    throw error;
  }

  res.json({
    success: true,
    data: { pendingListings }
  });
});

/**
 * Get approved listings
 */
const getApprovedListings = asyncHandler(async (req, res) => {
  const { listingType } = req.query;

  const approvedListings = {
    flights: [],
    hotels: [],
    cars: []
  };

  try {
    // Import models directly to query MongoDB
    const Flight = require('../../listing-service/models/Flight');
    const Hotel = require('../../listing-service/models/Hotel');
    const Car = require('../../listing-service/models/Car');

    // Query approved (Active) listings directly from MongoDB
    if (!listingType || listingType === 'Flight') {
      approvedListings.flights = await Flight.find({ status: 'Active' }).lean();
    }
    if (!listingType || listingType === 'Hotel') {
      approvedListings.hotels = await Hotel.find({ status: 'Active' }).lean();
    }
    if (!listingType || listingType === 'Car') {
      approvedListings.cars = await Car.find({ status: 'Active' }).lean();
    }

    logger.info(`Fetched approved listings: ${approvedListings.flights.length} flights, ${approvedListings.hotels.length} hotels, ${approvedListings.cars.length} cars`);
  } catch (error) {
    logger.error('Error fetching approved listings:', error);
    throw error;
  }

  res.json({
    success: true,
    data: { approvedListings }
  });
});

/**
 * Approve listing
 */
const approveListing = asyncHandler(async (req, res) => {
  const { listingId } = req.params; // Get from URL params
  const { listingType } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  // Get auth token to forward to listing service
  const authToken = req.headers.authorization || req.headers.Authorization;
  if (!authToken) {
    throw new ValidationError('Authentication token is required');
  }

  // Call listing service to update status
  const listingTypeLower = listingType.toLowerCase() + 's';
  let listing;
  try {
    const response = await axios.put(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`,
      { status: 'Active' },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken // Forward the auth token
        }
      }
    );
    listing = response.data.data[listingTypeLower.slice(0, -1)];
  } catch (error) {
    logger.error(`Error approving listing: ${error.message}`, {
      listingId,
      listingType,
      response: error.response?.data
    });
    throw new NotFoundError('Listing');
  }

  logger.info(`Listing approved: ${listingId} (${listingType})`);

  res.json({
    success: true,
    message: 'Listing approved successfully',
    data: { listing }
  });
});

/**
 * Reject listing
 */
const rejectListing = asyncHandler(async (req, res) => {
  const { listingId } = req.params; // Get from URL params
  const { listingType, reason } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  // Get auth token to forward to listing service
  const authToken = req.headers.authorization || req.headers.Authorization;
  if (!authToken) {
    throw new ValidationError('Authentication token is required');
  }

  // Call listing service to update status
  const listingTypeLower = listingType.toLowerCase() + 's';
  let listing;
  try {
    const response = await axios.put(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`,
      { status: 'Inactive' },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken // Forward the auth token
        }
      }
    );
    listing = response.data.data[listingTypeLower.slice(0, -1)];
  } catch (error) {
    logger.error(`Error rejecting listing: ${error.message}`, {
      listingId,
      listingType,
      response: error.response?.data
    });
    throw new NotFoundError('Listing');
  }

  logger.info(`Listing rejected: ${listingId} (${listingType})`);

  res.json({
    success: true,
    message: 'Listing rejected',
    data: { listing }
  });
});

/**
 * Search users by name or ID
 */
const searchUsers = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim().length === 0) {
    return res.json({
      success: true,
      data: {
        users: [],
        count: 0
      }
    });
  }

  const searchTerm = query.trim();

  try {
    // Call user service to search users
    // Pass admin's auth token to user service
    const authHeader = req.headers.authorization;
    const response = await axios.get(
      `${USER_SERVICE_URL}/api/users/search?q=${encodeURIComponent(searchTerm)}`,
      {
        timeout: 10000,
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    );

    res.json({
      success: true,
      data: response.data.data || { users: [], count: 0 }
    });
  } catch (error) {
    if (error.response?.status === 404) {
      // User service might not have search endpoint yet, return empty
      return res.json({
        success: true,
        data: {
          users: [],
          count: 0
        }
      });
    }
    logger.error('Error searching users:', error);
    throw error;
  }
});

/**
 * List users
 */
const listUsers = asyncHandler(async (req, res) => {
  // This would typically call user service
  // For now, return a placeholder response
  res.json({
    success: true,
    message: 'User listing functionality - integrate with user service',
    data: {
      users: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0
      }
    }
  });
});

/**
 * Get user by ID
 */
const getUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    // Pass admin's auth token to user service
    const authHeader = req.headers.authorization;
    const response = await axios.get(
      `${USER_SERVICE_URL}/api/users/${userId}`,
      {
        timeout: 10000,
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    );
    res.json({
      success: true,
      data: response.data.data
    });
  } catch (error) {
    if (error.response?.status === 404) {
      throw new NotFoundError('User');
    }
    logger.error('Error fetching user:', error);
    throw error;
  }
});

/**
 * Modify user
 */
const modifyUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;

  // Don't allow updating userId, email, password, or SSN for security
  const restrictedFields = ['userId', 'email', 'password', 'ssn'];
  for (const field of restrictedFields) {
    if (updates[field] !== undefined) {
      delete updates[field];
    }
  }

  // Call user service to update user
  // Pass admin's auth token to user service
  try {
    const authHeader = req.headers.authorization;
    const response = await axios.put(
      `${USER_SERVICE_URL}/api/users/${userId}`,
      updates,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        }
      }
    );
    res.json({
      success: true,
      message: 'User updated successfully',
      data: response.data.data
    });
  } catch (error) {
    if (error.response?.status === 404) {
      throw new NotFoundError('User');
    }
    logger.error('Error updating user:', error);
    throw error;
  }
});

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const targetYear = year || new Date().getFullYear();

  const pool = getPostgresPool();
  
  // Top 10 properties with revenue
  const topPropertiesQuery = `
    SELECT 
      booking_id,
      booking_type,
      SUM(total_amount) as revenue,
      COUNT(*) as bookings
    FROM bills
    WHERE EXTRACT(YEAR FROM transaction_date) = $1
      AND transaction_status = 'Completed'
    GROUP BY booking_id, booking_type
    ORDER BY revenue DESC
    LIMIT 10
  `;

  const topPropertiesResult = await pool.query(topPropertiesQuery, [targetYear]);

  // City-wise revenue
  const cityRevenueQuery = `
    SELECT 
      invoice_details->>'city' as city,
      SUM(total_amount) as revenue
    FROM bills
    WHERE EXTRACT(YEAR FROM transaction_date) = $1
      AND transaction_status = 'Completed'
      AND invoice_details->>'city' IS NOT NULL
    GROUP BY city
    ORDER BY revenue DESC
  `;

  const cityRevenueResult = await pool.query(cityRevenueQuery, [targetYear]);

  res.json({
    success: true,
    data: {
      year: targetYear,
      topProperties: topPropertiesResult.rows,
      cityRevenue: cityRevenueResult.rows
    }
  });
});

/**
 * Get general analytics (aggregated)
 */
const getAnalytics = asyncHandler(async (req, res) => {
  // Return basic analytics for the dashboard
  // This is a simplified version - you can enhance it later
  res.json({
    success: true,
    data: {
      totalUsers: 0,
      totalBookings: 0,
      totalRevenue: 0,
      activeListings: 0
    }
  });
});

/**
 * Get provider analytics
 */
const getProviderAnalytics = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  const pool = getPostgresPool();

  // This would require joining with listings to get provider info
  // Simplified version for now
  const query = `
    SELECT 
      COUNT(DISTINCT booking_id) as total_bookings,
      SUM(total_amount) as total_revenue
    FROM bills
    WHERE EXTRACT(MONTH FROM transaction_date) = $1
      AND EXTRACT(YEAR FROM transaction_date) = $2
      AND transaction_status = 'Completed'
  `;

  const result = await pool.query(query, [targetMonth, targetYear]);

  res.json({
    success: true,
    data: {
      month: targetMonth,
      year: targetYear,
      analytics: result.rows[0]
    }
  });
});

module.exports = {
  register,
  login,
  getPendingListings,
  getApprovedListings,
  approveListing,
  rejectListing,
  listUsers,
  searchUsers,
  getUser,
  modifyUser,
  getAnalytics,
  getRevenueAnalytics,
  getProviderAnalytics
};

