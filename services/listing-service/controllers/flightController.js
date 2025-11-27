/**
 * Flight Controller
 * Note: Flight search is handled via Kafka (search-events topic)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const Flight = require('../models/Flight');
const { NotFoundError, ValidationError, AuthenticationError, asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * Get flight by ID
 */
const getFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;

  const cacheKey = `flight:${flightId}`;
  let flight = await getCache(cacheKey);

  if (!flight) {
    flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
    if (!flight) {
      throw new NotFoundError('Flight');
    }
    await setCache(cacheKey, flight, 3600);
  }

  res.json({
    success: true,
    data: { flight }
  });
});

/**
 * Create flight (Admin/Provider only)
 */
const createFlight = asyncHandler(async (req, res) => {
  const flightData = req.body;

  // Validate required fields
  if (!flightData.flightId || !flightData.departureAirport || !flightData.arrivalAirport ||
      !flightData.departureTime || !flightData.arrivalTime || !flightData.duration) {
    throw new ValidationError('Missing required fields: flightId, departureAirport, arrivalAirport, departureTime, arrivalTime, duration');
  }
  
  // Validate operating days
  if (!flightData.operatingDays || !Array.isArray(flightData.operatingDays) || flightData.operatingDays.length === 0) {
    throw new ValidationError('At least one operating day must be specified');
  }
  
  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of flightData.operatingDays) {
    if (!validDays.includes(day)) {
      throw new ValidationError(`Invalid operating day: ${day}. Must be one of: ${validDays.join(', ')}`);
    }
  }
  
  // Validate time format
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(flightData.departureTime)) {
    throw new ValidationError('Departure time must be in HH:MM format (e.g., 14:30)');
  }
  if (!timeRegex.test(flightData.arrivalTime)) {
    throw new ValidationError('Arrival time must be in HH:MM format (e.g., 16:45)');
  }
  
  // Calculate duration from times if not provided
  if (!flightData.duration) {
    const [depHours, depMins] = flightData.departureTime.split(':').map(Number);
    const [arrHours, arrMins] = flightData.arrivalTime.split(':').map(Number);
    const depMinutes = depHours * 60 + depMins;
    const arrMinutes = arrHours * 60 + arrMins;
    // Handle next-day arrival (if arrival time is earlier than departure time, assume next day)
    const duration = arrMinutes >= depMinutes 
      ? arrMinutes - depMinutes 
      : (24 * 60) - depMinutes + arrMinutes;
    flightData.duration = duration;
  }

  // Validate seat types
  if (!flightData.seatTypes || !Array.isArray(flightData.seatTypes) || flightData.seatTypes.length === 0) {
    throw new ValidationError('At least one seat type is required');
  }

  // Validate each seat type
  for (const seatType of flightData.seatTypes) {
    if (!['Economy', 'Business', 'First'].includes(seatType.type)) {
      throw new ValidationError(`Invalid seat type: ${seatType.type}. Must be Economy, Business, or First`);
    }
    if (!seatType.ticketPrice || seatType.ticketPrice < 0) {
      throw new ValidationError(`Invalid ticket price for ${seatType.type}`);
    }
    if (!seatType.totalSeats || seatType.totalSeats < 1) {
      throw new ValidationError(`Invalid total seats for ${seatType.type}`);
    }
    // Set availableSeats to totalSeats (initial capacity)
    // Actual availability is calculated dynamically from bookings during search
    if (seatType.availableSeats === undefined || seatType.availableSeats < 0) {
      seatType.availableSeats = seatType.totalSeats; // Default to total if not provided
    }
    if (seatType.availableSeats > seatType.totalSeats) {
      throw new ValidationError(`Available seats cannot exceed total seats for ${seatType.type}`);
    }
    // Ensure availableSeats equals totalSeats for new flights (availability is calculated from bookings)
    seatType.availableSeats = seatType.totalSeats;
  }

  // Validate date range
  if (!flightData.availableFrom || !flightData.availableTo) {
    throw new ValidationError('availableFrom and availableTo dates are required');
  }

  const availableFrom = new Date(flightData.availableFrom);
  const availableTo = new Date(flightData.availableTo);
  if (availableFrom >= availableTo) {
    throw new ValidationError('availableTo must be after availableFrom');
  }

  // Check if flight already exists
  const existing = await Flight.findOne({ flightId: flightData.flightId.toUpperCase() });
  if (existing) {
    throw new ValidationError('Flight with this ID already exists');
  }

  // Allow admin to set status to 'Active', otherwise default to 'Pending'
  const status = (req.user?.role === 'admin' && flightData.status === 'Active') 
    ? 'Active' 
    : 'Pending';
  
  const flight = new Flight({
    ...flightData,
    flightId: flightData.flightId.toUpperCase(),
    departureAirport: flightData.departureAirport.toUpperCase(),
    arrivalAirport: flightData.arrivalAirport.toUpperCase(),
    departureTime: flightData.departureTime,
    arrivalTime: flightData.arrivalTime,
    operatingDays: flightData.operatingDays,
    seatTypes: flightData.seatTypes,
    availableFrom: availableFrom,
    availableTo: availableTo,
    status
  });

  await flight.save();

  // Invalidate search cache
  await deleteCachePattern('search:flight:*');

  logger.info(`Flight created: ${flight.flightId} with ${flight.seatTypes.length} seat types`);

  res.status(201).json({
    success: true,
    message: 'Flight created successfully',
    data: { flight }
  });
});

/**
 * Update flight
 */
const updateFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;
  const updates = req.body;

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'flightId') {
      flight[key] = updates[key];
    }
  });

  flight.updatedAt = new Date();
  await flight.save();

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  res.json({
    success: true,
    message: 'Flight updated successfully',
    data: { flight }
  });
});

/**
 * Delete flight
 * Allows admin or the owner (provider) to delete
 */
const deleteFlight = asyncHandler(async (req, res) => {
  const { flightId } = req.params;
  const user = req.user; // From auth middleware

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  // Check if user is admin OR the owner of the listing
  const isAdmin = user.role === 'admin';
  const isOwner = user.role === 'provider' && user.providerId === flight.providerId;

  if (!isAdmin && !isOwner) {
    throw new AuthenticationError('You do not have permission to delete this listing');
  }

  await Flight.deleteOne({ flightId: flightId.toUpperCase() });

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  logger.info(`Flight deleted: ${flightId} by ${isAdmin ? 'admin' : 'provider'}`);

  res.json({
    success: true,
    message: 'Flight deleted successfully'
  });
});

/**
 * Add review to flight
 */
const addReview = asyncHandler(async (req, res) => {
  const { flightId } = req.params;
  const { userId, rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  flight.reviews.push({
    reviewId,
    userId,
    rating,
    comment: comment || '',
    date: new Date()
  });

  flight.updateRating();
  await flight.save();

  // Invalidate cache
  await deleteCache(`flight:${flightId}`);
  await deleteCachePattern('search:flight:*');

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: { review: flight.reviews[flight.reviews.length - 1] }
  });
});

/**
 * Get flights by providerId
 */
const getFlightsByProvider = asyncHandler(async (req, res) => {
  const { providerId } = req.query;
  const user = req.user; // From auth middleware

  if (!providerId) {
    throw new ValidationError('Provider ID is required');
  }

  // Check if user is admin OR the owner of the listings
  const isAdmin = user?.role === 'admin';
  const isOwner = user?.role === 'provider' && user.providerId === providerId;

  if (!isAdmin && !isOwner) {
    throw new AuthenticationError('You do not have permission to view these listings');
  }

  const flights = await Flight.find({ providerId }).lean();

  res.json({
    success: true,
    data: { flights }
  });
});

/**
 * Get flight reviews
 */
const getReviews = asyncHandler(async (req, res) => {
  const { flightId } = req.params;

  const flight = await Flight.findOne({ flightId: flightId.toUpperCase() });
  if (!flight) {
    throw new NotFoundError('Flight');
  }

  res.json({
    success: true,
    count: flight.reviews.length,
    data: { reviews: flight.reviews }
  });
});

module.exports = {
  getFlight,
  getFlightsByProvider,
  createFlight,
  updateFlight,
  deleteFlight,
  addReview,
  getReviews
};

