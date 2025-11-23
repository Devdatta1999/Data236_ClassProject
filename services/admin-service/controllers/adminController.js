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
 * Admin login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email: email.toLowerCase() });
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
 */
const getPendingListings = asyncHandler(async (req, res) => {
  const { listingType } = req.query;

  // Call listing service to get pending listings
  const pendingListings = {
    flights: [],
    hotels: [],
    cars: []
  };

  try {
    if (!listingType || listingType === 'Flight') {
      const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/flights/search?status=Pending`);
      pendingListings.flights = response.data.data?.flights || [];
    }
    if (!listingType || listingType === 'Hotel') {
      const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/hotels/search?status=Pending`);
      pendingListings.hotels = response.data.data?.hotels || [];
    }
    if (!listingType || listingType === 'Car') {
      const response = await axios.get(`${LISTING_SERVICE_URL}/api/listings/cars/search?status=Pending`);
      pendingListings.cars = response.data.data?.cars || [];
    }
  } catch (error) {
    logger.error('Error fetching pending listings:', error);
  }

  res.json({
    success: true,
    data: { pendingListings }
  });
});

/**
 * Approve listing
 */
const approveListing = asyncHandler(async (req, res) => {
  const { listingId, listingType } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  // Call listing service to update status
  const listingTypeLower = listingType.toLowerCase() + 's';
  let listing;
  try {
    const response = await axios.put(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`,
      { status: 'Active' }
    );
    listing = response.data.data[listingTypeLower.slice(0, -1)];
  } catch (error) {
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
  const { listingId, listingType, reason } = req.body;

  if (!['Flight', 'Hotel', 'Car'].includes(listingType)) {
    throw new ValidationError('Invalid listing type');
  }

  // Call listing service to update status
  const listingTypeLower = listingType.toLowerCase() + 's';
  let listing;
  try {
    const response = await axios.put(
      `${LISTING_SERVICE_URL}/api/listings/${listingTypeLower}/${listingId}`,
      { status: 'Inactive' }
    );
    listing = response.data.data[listingTypeLower.slice(0, -1)];
  } catch (error) {
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
 * Modify user
 */
const modifyUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;

  // Call user service to update user
  try {
    const response = await axios.put(
      `${USER_SERVICE_URL}/api/users/${userId}`,
      updates
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
  login,
  getPendingListings,
  approveListing,
  rejectListing,
  listUsers,
  modifyUser,
  getRevenueAnalytics,
  getProviderAnalytics
};

