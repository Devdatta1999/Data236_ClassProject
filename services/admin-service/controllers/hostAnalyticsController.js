/**
 * Host/Provider Analytics Controller
 * Handles analytics for host dashboards - clicks, views, reviews, user traces
 */

const { mongoose, getPostgresPool } = require('../../../shared/config/database');
const { asyncHandler, NotFoundError, ValidationError } = require('../../../shared/utils/errors');
const { getCache, setCache } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

// Import models
const Flight = require('../../listing-service/models/Flight');
const Hotel = require('../../listing-service/models/Hotel');
const Car = require('../../listing-service/models/Car');
const AnalyticsEvent = require('../../../shared/models/AnalyticsEvent');
const Booking = require('../../booking-service/models/Booking');

/**
 * HOST ANALYTICS
 */

/**
 * Get page clicks analytics for a provider
 */
const getPageClicks = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const { days = 30 } = req.query;

  const cacheKey = `analytics:host:${providerId}:page-clicks:${days}`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(days));

  // Get page view events
  const pageViews = await AnalyticsEvent.aggregate([
    {
      $match: {
        providerId,
        eventType: 'page_view',
        timestamp: { $gte: daysAgo }
      }
    },
    {
      $group: {
        _id: '$pageName',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  const data = {
    providerId,
    days: parseInt(days),
    pageClicks: pageViews.map(pv => ({
      pageName: pv._id,
      clicks: pv.count
    })),
    totalClicks: pageViews.reduce((sum, pv) => sum + pv.count, 0)
  };

  // Cache for 5 minutes
  await setCache(cacheKey, JSON.stringify(data), 300);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get listing clicks analytics for a provider
 */
const getListingClicks = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const { days = 30 } = req.query;

  const cacheKey = `analytics:host:${providerId}:listing-clicks:${days}`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(days));

  // Get listing click/view events
  const listingClicks = await AnalyticsEvent.aggregate([
    {
      $match: {
        providerId,
        eventType: { $in: ['listing_click', 'listing_view'] },
        timestamp: { $gte: daysAgo }
      }
    },
    {
      $group: {
        _id: {
          listingId: '$listingId',
          listingType: '$listingType'
        },
        clicks: { $sum: 1 }
      }
    },
    {
      $sort: { clicks: -1 }
    }
  ]);

  // Enrich with listing details
  const enrichedData = await Promise.all(listingClicks.map(async (item) => {
    let listingDetails = null;
    
    try {
      if (item._id.listingType === 'Flight') {
        listingDetails = await Flight.findOne({ flightId: item._id.listingId }).lean();
      } else if (item._id.listingType === 'Hotel') {
        listingDetails = await Hotel.findOne({ hotelId: item._id.listingId }).lean();
      } else if (item._id.listingType === 'Car') {
        listingDetails = await Car.findOne({ carId: item._id.listingId }).lean();
      }
    } catch (error) {
      logger.warn(`Failed to fetch listing details for ${item._id.listingId}:`, error.message);
    }

    return {
      listingId: item._id.listingId,
      listingType: item._id.listingType,
      clicks: item.clicks,
      listingName: listingDetails?.hotelName || listingDetails?.model || item._id.listingId,
      rating: listingDetails?.hotelRating || listingDetails?.carRating || listingDetails?.flightRating || 0
    };
  }));

  const data = {
    providerId,
    days: parseInt(days),
    listingClicks: enrichedData,
    totalClicks: listingClicks.reduce((sum, item) => sum + item.clicks, 0)
  };

  // Cache for 5 minutes
  await setCache(cacheKey, JSON.stringify(data), 300);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get least viewed sections/pages for a provider
 */
const getLeastViewedSections = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const { days = 30 } = req.query;

  const cacheKey = `analytics:host:${providerId}:least-viewed:${days}`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(days));

  // Get section view events
  const sectionViews = await AnalyticsEvent.aggregate([
    {
      $match: {
        providerId,
        eventType: { $in: ['section_view', 'page_view'] },
        sectionName: { $ne: null },
        timestamp: { $gte: daysAgo }
      }
    },
    {
      $group: {
        _id: '$sectionName',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: 1 } // Ascending to get least viewed
    },
    {
      $limit: 10
    }
  ]);

  const data = {
    providerId,
    days: parseInt(days),
    leastViewedSections: sectionViews.map(sv => ({
      sectionName: sv._id,
      views: sv.count
    }))
  };

  // Cache for 5 minutes
  await setCache(cacheKey, JSON.stringify(data), 300);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get reviews analytics for a provider
 */
const getReviewsAnalytics = asyncHandler(async (req, res) => {
  const { providerId } = req.params;

  const cacheKey = `analytics:host:${providerId}:reviews`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  // Get all listings for this provider
  const [flights, hotels, cars] = await Promise.all([
    Flight.find({ providerId }).select('flightId flightRating reviews').lean(),
    Hotel.find({ providerId }).select('hotelId hotelRating reviews').lean(),
    Car.find({ providerId }).select('carId carRating reviews').lean()
  ]);

  // Aggregate reviews
  let allReviews = [];
  let totalRatings = 0;
  let ratingSum = 0;

  flights.forEach(f => {
    if (f.reviews && f.reviews.length > 0) {
      allReviews = allReviews.concat(f.reviews.map(r => ({
        ...r,
        listingId: f.flightId,
        listingType: 'Flight'
      })));
    }
    if (f.flightRating > 0) {
      ratingSum += f.flightRating;
      totalRatings++;
    }
  });

  hotels.forEach(h => {
    if (h.reviews && h.reviews.length > 0) {
      allReviews = allReviews.concat(h.reviews.map(r => ({
        ...r,
        listingId: h.hotelId,
        listingType: 'Hotel'
      })));
    }
    if (h.hotelRating > 0) {
      ratingSum += h.hotelRating;
      totalRatings++;
    }
  });

  cars.forEach(c => {
    if (c.reviews && c.reviews.length > 0) {
      allReviews = allReviews.concat(c.reviews.map(r => ({
        ...r,
        listingId: c.carId,
        listingType: 'Car'
      })));
    }
    if (c.carRating > 0) {
      ratingSum += c.carRating;
      totalRatings++;
    }
  });

  // Sort reviews by date
  allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Calculate rating distribution
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  allReviews.forEach(r => {
    ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
  });

  // Reviews over time (monthly)
  const reviewsByMonth = {};
  allReviews.forEach(r => {
    const date = new Date(r.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!reviewsByMonth[monthKey]) {
      reviewsByMonth[monthKey] = {
        month: monthKey,
        count: 0,
        avgRating: 0,
        totalRating: 0
      };
    }
    reviewsByMonth[monthKey].count++;
    reviewsByMonth[monthKey].totalRating += r.rating;
    reviewsByMonth[monthKey].avgRating = reviewsByMonth[monthKey].totalRating / reviewsByMonth[monthKey].count;
  });

  const reviewTrend = Object.values(reviewsByMonth).sort((a, b) => a.month.localeCompare(b.month));

  const data = {
    providerId,
    totalReviews: allReviews.length,
    averageRating: totalRatings > 0 ? (ratingSum / totalRatings).toFixed(2) : 0,
    ratingDistribution,
    reviewTrend,
    recentReviews: allReviews.slice(0, 10) // Last 10 reviews
  };

  // Cache for 10 minutes
  await setCache(cacheKey, JSON.stringify(data), 600);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get user trace/journey for a specific user
 */
const getUserTrace = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { days = 30 } = req.query;

  const cacheKey = `analytics:user-trace:${userId}:${days}`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(days));

  // Get user's analytics events
  const userEvents = await AnalyticsEvent.find({
    userId,
    timestamp: { $gte: daysAgo }
  })
  .sort({ timestamp: 1 })
  .limit(1000)
  .lean();

  // Get user's bookings
  const userBookings = await Booking.find({
    userId,
    createdAt: { $gte: daysAgo }
  })
  .sort({ createdAt: 1 })
  .lean();

  // Combine into a timeline
  const timeline = [
    ...userEvents.map(e => ({
      type: 'event',
      eventType: e.eventType,
      timestamp: e.timestamp,
      pageName: e.pageName,
      listingId: e.listingId,
      listingType: e.listingType,
      metadata: e.metadata
    })),
    ...userBookings.map(b => ({
      type: 'booking',
      timestamp: b.createdAt,
      listingId: b.listingId,
      listingType: b.listingType,
      amount: b.totalAmount,
      status: b.status
    }))
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Calculate user behavior stats
  const pageViews = userEvents.filter(e => e.eventType === 'page_view').length;
  const listingViews = userEvents.filter(e => e.eventType === 'listing_view').length;
  const searches = userEvents.filter(e => e.eventType === 'search').length;
  const completedBookings = userBookings.filter(b => b.status === 'Confirmed').length;

  const data = {
    userId,
    days: parseInt(days),
    timeline,
    stats: {
      totalEvents: userEvents.length,
      pageViews,
      listingViews,
      searches,
      totalBookings: userBookings.length,
      completedBookings
    }
  };

  // Cache for 5 minutes
  await setCache(cacheKey, JSON.stringify(data), 300);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get cohort analysis (e.g., users from a specific city/state)
 */
const getCohortAnalysis = asyncHandler(async (req, res) => {
  const { city, state, days = 30 } = req.query;

  if (!city && !state) {
    throw new ValidationError('Please provide city or state for cohort analysis');
  }

  const cacheKey = `analytics:cohort:${city || 'all'}-${state || 'all'}:${days}`;
  
  // Try to get from cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: JSON.parse(cached),
      cached: true
    });
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(days));

  // Build match criteria
  const matchCriteria = {
    timestamp: { $gte: daysAgo }
  };

  if (city) matchCriteria.city = city;
  if (state) matchCriteria.state = state;

  // Get cohort events
  const cohortEvents = await AnalyticsEvent.aggregate([
    {
      $match: matchCriteria
    },
    {
      $group: {
        _id: {
          userId: '$userId',
          eventType: '$eventType'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get unique users in cohort
  const uniqueUsers = [...new Set(cohortEvents.map(e => e._id.userId).filter(u => u))];

  // Aggregate event types
  const eventTypeCounts = {};
  cohortEvents.forEach(e => {
    const eventType = e._id.eventType;
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + e.count;
  });

  const data = {
    cohort: {
      city: city || 'all',
      state: state || 'all'
    },
    days: parseInt(days),
    totalUsers: uniqueUsers.length,
    eventTypeCounts,
    averageEventsPerUser: uniqueUsers.length > 0 
      ? (Object.values(eventTypeCounts).reduce((sum, count) => sum + count, 0) / uniqueUsers.length).toFixed(2)
      : 0
  };

  // Cache for 10 minutes
  await setCache(cacheKey, JSON.stringify(data), 600);

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Track analytics event (POST)
 */
const trackEvent = asyncHandler(async (req, res) => {
  const {
    eventType,
    userId,
    userType,
    listingId,
    listingType,
    providerId,
    pageName,
    pageUrl,
    sectionName,
    metadata,
    sessionId,
    city,
    state
  } = req.body;

  if (!eventType || !pageName) {
    throw new ValidationError('eventType and pageName are required');
  }

  // Generate event ID
  const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create analytics event
  const analyticsEvent = new AnalyticsEvent({
    eventId,
    eventType,
    userId: userId || null,
    userType: userType || 'guest',
    listingId: listingId || null,
    listingType: listingType || null,
    providerId: providerId || null,
    pageName,
    pageUrl: pageUrl || null,
    sectionName: sectionName || null,
    metadata: metadata || {},
    sessionId: sessionId || null,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    city: city || null,
    state: state || null,
    timestamp: new Date()
  });

  await analyticsEvent.save();

  logger.info(`Analytics event tracked: ${eventType} - ${pageName}`, { eventId, userId });

  res.json({
    success: true,
    message: 'Event tracked successfully',
    data: { eventId }
  });
});

/**
 * Get host/provider profitability overview
 */
const getHostProfitability = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  
  if (!providerId) {
    throw new ValidationError('Provider ID is required');
  }

  const cacheKey = `analytics:host:${providerId}:profitability`;
  
  // Don't check cache first - we need to validate provider exists
  // Cache will be set after validation

  // Check if MongoDB is connected
  if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
    logger.error('MongoDB not connected - readyState:', mongoose.connection.readyState);
    return res.status(503).json({
      success: false,
      error: {
        message: 'Database connection not available',
        code: 'DATABASE_NOT_READY'
      }
    });
  }

  // Use MongoDB collections directly (same approach as top providers)
  const Flights = mongoose.connection.db.collection('flights');
  const Hotels = mongoose.connection.db.collection('hotels');
  const Cars = mongoose.connection.db.collection('cars');
  const Booking = mongoose.connection.db.collection('bookings');
  
  // Get all listings for this provider using collections
  const [flights, hotels, cars] = await Promise.all([
    Flights.find({ providerId }, { projection: { flightId: 1, providerId: 1 } }).toArray(),
    Hotels.find({ providerId }, { projection: { hotelId: 1, providerId: 1 } }).toArray(),
    Cars.find({ providerId }, { projection: { carId: 1, providerId: 1 } }).toArray()
  ]);

  const allListingIds = [
    ...flights.map(f => f.flightId),
    ...hotels.map(h => h.hotelId),
    ...cars.map(c => c.carId)
  ];

  if (allListingIds.length === 0) {
    // Check if provider exists at all by checking if any provider with this ID exists
    // Use collections directly for consistency
    const [flightProvider, hotelProvider, carProvider] = await Promise.all([
      Flights.findOne({ providerId }, { projection: { providerId: 1 } }),
      Hotels.findOne({ providerId }, { projection: { providerId: 1 } }),
      Cars.findOne({ providerId }, { projection: { providerId: 1 } })
    ]);
    
    const providerExists = !!(flightProvider || hotelProvider || carProvider);
    
    if (!providerExists) {
      logger.warn(`Provider ${providerId} not found`);
      throw new NotFoundError('Provider');
    }
    
    // Provider exists but has no listings
    logger.warn(`No listings found for provider ${providerId}`);
    const data = {
      providerId,
      totalRevenue: 0,
      totalBookings: 0,
      totalListings: 0,
      averageRating: 0,
      monthlyRevenue: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: new Date(2000, i, 1).toLocaleString('default', { month: 'short' }),
        revenue: 0,
        bookingCount: 0
      })),
      breakdown: {
        flights: 0,
        hotels: 0,
        cars: 0
      }
    };
    // Don't cache empty data for non-existent providers
    return res.json({
      success: true,
      data,
      cached: false
    });
  }

  // Use the same approach as top providers - get all bookings and filter
  // This is more robust and handles edge cases better
  const allConfirmedBookings = await Booking.find({
    status: 'Confirmed'
  }).toArray();
  
  // Create a Set for O(1) lookup
  const listingIdSet = new Set(allListingIds);
  
  // Filter bookings that belong to this provider
  const confirmedBookings = allConfirmedBookings.filter(booking => 
    listingIdSet.has(booking.listingId)
  );
  
  logger.info(`Host profitability calculation for ${providerId}`, {
    totalListings: allListingIds.length,
    totalBookingsInDB: allConfirmedBookings.length,
    matchingBookings: confirmedBookings.length,
    sampleListingIds: allListingIds.slice(0, 5),
    sampleBookingListingIds: allConfirmedBookings.slice(0, 10).map(b => b.listingId),
    matchingBookingIds: confirmedBookings.slice(0, 5).map(b => b.listingId)
  });
  
  // Calculate total revenue
  const totalRevenue = confirmedBookings.reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);
  const totalBookings = confirmedBookings.length;
  
  // Calculate monthly revenue breakdown
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: new Date(2000, i, 1).toLocaleString('default', { month: 'short' }),
    revenue: 0,
    bookingCount: 0
  }));
  
  confirmedBookings.forEach(booking => {
    const bookingDate = new Date(booking.bookingDate || booking.createdAt);
    const monthIndex = bookingDate.getMonth(); // 0-11
    if (monthIndex >= 0 && monthIndex < 12) {
      monthlyRevenue[monthIndex].revenue += booking.totalAmount || 0;
      monthlyRevenue[monthIndex].bookingCount += 1;
    }
  });

  // Calculate average rating - need to fetch full listing data for ratings
  const [fullFlights, fullHotels, fullCars] = await Promise.all([
    Flight.find({ providerId }).select('flightRating').lean(),
    Hotel.find({ providerId }).select('hotelRating').lean(),
    Car.find({ providerId }).select('carRating').lean()
  ]);
  
  const allRatings = [
    ...fullFlights.map(f => f.flightRating).filter(r => r > 0),
    ...fullHotels.map(h => h.hotelRating).filter(r => r > 0),
    ...fullCars.map(c => c.carRating).filter(r => r > 0)
  ];
  const averageRating = allRatings.length > 0 
    ? (allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length).toFixed(2)
    : 0;

  const data = {
    providerId,
    totalRevenue,
    totalBookings,
    totalListings: allListingIds.length,
    averageRating: parseFloat(averageRating),
    monthlyRevenue, // Add monthly breakdown
    breakdown: {
      flights: flights.length,
      hotels: hotels.length,
      cars: cars.length
    }
  };

  // Cache for 10 minutes
  await setCache(cacheKey, JSON.stringify(data), 600);

  res.json({
    success: true,
    data,
    cached: false
  });
});

module.exports = {
  getPageClicks,
  getListingClicks,
  getLeastViewedSections,
  getReviewsAnalytics,
  getUserTrace,
  getCohortAnalysis,
  trackEvent,
  getHostProfitability
};

