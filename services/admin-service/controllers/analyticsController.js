/**
 * Analytics Controller
 * Handles all analytics queries for admin and host dashboards
 */

const { mongoose } = require('../../../shared/config/database');
// PostgreSQL disabled due to connection issues - using MongoDB only
const { asyncHandler } = require('../../../shared/utils/errors');
const { getCache, setCache } = require('../../../shared/config/redis');
const logger = require('../../../shared/utils/logger');

/**
 * ADMIN ANALYTICS
 */

/**
 * Get overview analytics for admin dashboard
 */
const getAdminOverview = asyncHandler(async (req, res) => {
  const { providerId } = req.query;
  try {
    const cacheKey = 'analytics:admin:overview';
    
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: JSON.parse(cached),
          cached: true
        });
      }
    } catch (cacheError) {
      logger.warn('Cache error (continuing without cache):', cacheError.message);
    }

    // Check if MongoDB is connected
    if (!mongoose || !mongoose.connection || !mongoose.connection.db || mongoose.connection.readyState !== 1) {
      const readyState = mongoose?.connection?.readyState ?? 'unknown';
      logger.error('MongoDB not connected - readyState:', readyState);
      return res.status(503).json({
        success: false,
        error: {
          message: 'Database connection not available',
          code: 'DATABASE_NOT_READY',
          details: `MongoDB readyState: ${readyState}`
        }
      });
    }

    const User = mongoose.connection.db.collection('users');
    const totalUsers = await User.countDocuments();

    const Booking = mongoose.connection.db.collection('bookings');
    
    // If providerId is provided, filter by provider's listings
    let bookingFilter = { status: 'Confirmed' };
    let confirmedBookings;
    
    if (providerId) {
      // Get all listing IDs for this provider
      const Flights = mongoose.connection.db.collection('flights');
      const Hotels = mongoose.connection.db.collection('hotels');
      const Cars = mongoose.connection.db.collection('cars');
      
      const [providerFlights, providerHotels, providerCars] = await Promise.all([
        Flights.find({ providerId }, { projection: { flightId: 1 } }).toArray(),
        Hotels.find({ providerId }, { projection: { hotelId: 1 } }).toArray(),
        Cars.find({ providerId }, { projection: { carId: 1 } }).toArray()
      ]);
      
      const providerListingIds = [
        ...providerFlights.map(f => f.flightId),
        ...providerHotels.map(h => h.hotelId),
        ...providerCars.map(c => c.carId)
      ];
      
      bookingFilter = {
        status: 'Confirmed',
        listingId: { $in: providerListingIds }
      };
    }
    
    const totalBookings = await Booking.countDocuments(bookingFilter);
    confirmedBookings = await Booking.find(bookingFilter).toArray();
    const totalRevenue = confirmedBookings.reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);
    
    // Recent bookings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentBookings = await Booking.countDocuments({ 
      status: 'Confirmed',
      createdAt: { $gte: thirtyDaysAgo }
    });

    const Flights = mongoose.connection.db.collection('flights');
    const Hotels = mongoose.connection.db.collection('hotels');
    const Cars = mongoose.connection.db.collection('cars');
    
    // Filter by providerId if provided
    const flightStatusFilter = providerId ? { status: 'Active', providerId } : { status: 'Active' };
    const hotelStatusFilter = providerId ? { status: 'Active', providerId } : { status: 'Active' };
    const carStatusFilter = providerId ? { status: 'Active', providerId } : { status: 'Active' };
    const flightPendingFilter = providerId ? { status: 'Pending', providerId } : { status: 'Pending' };
    const hotelPendingFilter = providerId ? { status: 'Pending', providerId } : { status: 'Pending' };
    const carPendingFilter = providerId ? { status: 'Pending', providerId } : { status: 'Pending' };
    
    const totalFlights = await Flights.countDocuments(flightStatusFilter);
    const totalHotels = await Hotels.countDocuments(hotelStatusFilter);
    const totalCars = await Cars.countDocuments(carStatusFilter);
    const activeListings = totalFlights + totalHotels + totalCars;

    const pendingFlights = await Flights.countDocuments(flightPendingFilter);
    const pendingHotels = await Hotels.countDocuments(hotelPendingFilter);
    const pendingCars = await Cars.countDocuments(carPendingFilter);
    const pendingListings = pendingFlights + pendingHotels + pendingCars;

    const data = {
      totalUsers,
      totalBookings,
      totalRevenue,
      activeListings,
      pendingListings,
      recentBookings,
      breakdown: {
        flights: totalFlights,
        hotels: totalHotels,
        cars: totalCars
      }
    };

    try {
      await setCache(cacheKey, JSON.stringify(data), 300);
    } catch (cacheError) {
      logger.warn('Cache set error (continuing without cache):', cacheError.message);
    }

    res.json({
      success: true,
      data,
      cached: false
    });
  } catch (error) {
    logger.error('Error in getAdminOverview:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Only send response if headers haven't been sent
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: {
          message: `Analytics Error: ${error.message || 'Internal server error'}`,
          code: 'INTERNAL_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  }
});

/**
 * Get top 10 properties by revenue
 * NOTE: "Properties" means HOTELS only (not flights or cars)
 */
const getTopPropertiesByRevenue = asyncHandler(async (req, res) => {
  const { year, providerId } = req.query;
  const targetYear = year || new Date().getFullYear();

  const cacheKey = `analytics:admin:top-properties:${targetYear}`;
  
  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }
  } catch (cacheError) {
    logger.warn('Cache error (continuing without cache):', cacheError.message);
  }

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

  const Hotels = mongoose.connection.db.collection('hotels');
  const hotelFilter = providerId ? { providerId } : {};
  const allHotels = await Hotels.find(hotelFilter, { projection: { hotelId: 1, hotelName: 1, city: 1, state: 1, providerName: 1, starRating: 1 } }).toArray();

  const validHotelIds = new Set(allHotels.map(h => h.hotelId));
  const hotelMap = {};
  allHotels.forEach(h => hotelMap[h.hotelId] = h);
  
  // Create a map of hotel names to count duplicates
  const hotelNameCount = {};
  allHotels.forEach(h => {
    hotelNameCount[h.hotelName] = (hotelNameCount[h.hotelName] || 0) + 1;
  });

  // Calculate revenue from MongoDB bookings for hotels
  const Booking = mongoose.connection.db.collection('bookings');
  
  // Get all confirmed hotel bookings for the year (or all-time if year filter results in < 10)
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59);
  
  let hotelBookings = await Booking.find({
    status: 'Confirmed',
    listingType: 'Hotel',
    bookingDate: { $gte: startDate, $lte: endDate }
  }).toArray();
  
  // If we have less than 10 hotels with bookings for the year, get all-time data
  const yearHotelIds = new Set(hotelBookings.map(b => b.listingId));
  if (yearHotelIds.size < 10) {
    logger.info(`Only ${yearHotelIds.size} hotels with bookings in ${targetYear}, using all-time data for top 10`);
    hotelBookings = await Booking.find({
      status: 'Confirmed',
      listingType: 'Hotel'
    }).toArray();
  }

  // Aggregate revenue by hotel
  const hotelRevenue = {};
  hotelBookings.forEach(booking => {
    const hotelId = booking.listingId;
    if (!hotelRevenue[hotelId]) {
      hotelRevenue[hotelId] = {
        revenue: 0,
        bookingCount: 0
      };
    }
    hotelRevenue[hotelId].revenue += booking.totalAmount || 0;
    hotelRevenue[hotelId].bookingCount += 1;
  });

  // Enrich with hotel details
  const enrichedData = [];
  for (const [hotelId, stats] of Object.entries(hotelRevenue)) {
    if (!validHotelIds.has(hotelId)) continue;
    
    const hotel = hotelMap[hotelId];
    if (!hotel) continue;

    enrichedData.push({
      listingId: hotelId,
      listingType: 'Hotel',
      revenue: stats.revenue,
      bookingCount: stats.bookingCount,
      listingName: hotel.hotelName || 'Unknown Hotel',
      providerName: hotel.providerName || 'Unknown',
      city: hotel.city || 'Unknown',
      state: hotel.state || 'Unknown',
      starRating: hotel.starRating || 0
    });
  }

  // Sort by revenue first
  enrichedData.sort((a, b) => b.revenue - a.revenue);
  
  // Remove duplicates - keep only the first (highest revenue) for each hotel name
  const seenHotelNames = new Set();
  const topProperties = [];
  for (const hotel of enrichedData) {
    if (!seenHotelNames.has(hotel.listingName)) {
      seenHotelNames.add(hotel.listingName);
      topProperties.push(hotel);
      if (topProperties.length >= 10) break;
    }
  }

  const data = {
    year: parseInt(targetYear),
    topProperties
  };

  try {
    await setCache(cacheKey, JSON.stringify(data), 600);
  } catch (cacheError) {
    logger.warn('Cache set error (continuing without cache):', cacheError.message);
  }

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get city-wise revenue
 */
const getCityWiseRevenue = asyncHandler(async (req, res) => {
  const { year, providerId } = req.query;
  const targetYear = year || new Date().getFullYear();

  const cacheKey = `analytics:admin:city-revenue:${targetYear}`;
  
  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }
  } catch (cacheError) {
    logger.warn('Cache error (continuing without cache):', cacheError.message);
  }

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

  const Flights = mongoose.connection.db.collection('flights');
  const Hotels = mongoose.connection.db.collection('hotels');
  const Cars = mongoose.connection.db.collection('cars');
  
  // Filter by providerId if provided
  const flightFilter = providerId ? { providerId } : {};
  const hotelFilter = providerId ? { providerId } : {};
  const carFilter = providerId ? { providerId } : {};
  
  const [allFlights, allHotels, allCars] = await Promise.all([
    Flights.find(flightFilter, { projection: { flightId: 1, departureAirport: 1 } }).toArray(),
    Hotels.find(hotelFilter, { projection: { hotelId: 1, city: 1 } }).toArray(),
    Cars.find(carFilter, { projection: { carId: 1, city: 1 } }).toArray()
  ]);

  // Get all valid cities from database
  const validCities = new Set();
  allFlights.forEach(f => {
    if (f.departureAirport && f.departureAirport !== 'Unknown' && f.departureAirport !== '') {
      validCities.add(f.departureAirport);
    }
  });
  allHotels.forEach(h => {
    if (h.city && h.city !== 'Unknown' && h.city !== '') {
      validCities.add(h.city);
    }
  });
  allCars.forEach(c => {
    if (c.city && c.city !== 'Unknown' && c.city !== '') {
      validCities.add(c.city);
    }
  });

  const allListingCityMap = {};
  allFlights.forEach(f => {
    const airport = f.departureAirport;
    allListingCityMap[f.flightId] = (airport && airport !== 'Unknown' && airport !== '' && validCities.has(airport)) ? airport : null;
  });
  allHotels.forEach(h => {
    const city = h.city;
    allListingCityMap[h.hotelId] = (city && city !== 'Unknown' && city !== '' && validCities.has(city)) ? city : null;
  });
  allCars.forEach(c => {
    const city = c.city;
    allListingCityMap[c.carId] = (city && city !== 'Unknown' && city !== '' && validCities.has(city)) ? city : null;
  });

  // Calculate revenue from MongoDB bookings by city
  const Booking = mongoose.connection.db.collection('bookings');
  
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59);
  
  const allBookings = await Booking.find({
    status: 'Confirmed',
    bookingDate: { $gte: startDate, $lte: endDate }
  }).toArray();

  // Aggregate revenue by city - ONLY use cities that exist in database
  const cityRevenue = {};
  
  allBookings.forEach(booking => {
    const listingId = booking.listingId;
    const city = allListingCityMap[listingId];
    
    // Only process if city exists in database and is valid
    if (!city || city === 'Unknown' || city === '' || !validCities.has(city)) {
      return; // Skip this booking - city not in database
    }
    
    if (!cityRevenue[city]) {
      cityRevenue[city] = {
        city,
        revenue: 0,
        bookingCount: 0
      };
    }
    cityRevenue[city].revenue += booking.totalAmount || 0;
    cityRevenue[city].bookingCount += 1;
  });

  // Only return cities that are in the database
  const cityRevenueArray = Object.values(cityRevenue)
    .filter(item => item.city && validCities.has(item.city))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  const data = {
    year: parseInt(targetYear),
    cityRevenue: cityRevenueArray
  };

  try {
    await setCache(cacheKey, JSON.stringify(data), 600);
  } catch (cacheError) {
    logger.warn('Cache set error (continuing without cache):', cacheError.message);
  }

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get all providers/hosts for filtering
 */
const getAllProviders = asyncHandler(async (req, res) => {
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

  const Flights = mongoose.connection.db.collection('flights');
  const Hotels = mongoose.connection.db.collection('hotels');
  const Cars = mongoose.connection.db.collection('cars');
  
  const [allFlights, allHotels, allCars] = await Promise.all([
    Flights.find({}, { projection: { providerId: 1, providerName: 1 } }).toArray(),
    Hotels.find({}, { projection: { providerId: 1, providerName: 1 } }).toArray(),
    Cars.find({}, { projection: { providerId: 1, providerName: 1 } }).toArray()
  ]);

  // Get unique providers
  const providerMap = new Map();
  
  [...allFlights, ...allHotels, ...allCars].forEach(item => {
    if (item.providerId && item.providerName) {
      if (!providerMap.has(item.providerId)) {
        providerMap.set(item.providerId, {
          providerId: item.providerId,
          providerName: item.providerName
        });
      }
    }
  });

  const providers = Array.from(providerMap.values()).sort((a, b) => 
    a.providerName.localeCompare(b.providerName)
  );

  res.json({
    success: true,
    data: { providers }
  });
});

/**
 * Get top providers/hosts by sales
 */
const getTopProviders = asyncHandler(async (req, res) => {
  const { month, year, providerId } = req.query;
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  const cacheKey = `analytics:admin:top-providers:${targetMonth}:${targetYear}`;
  
  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }
  } catch (cacheError) {
    logger.warn('Cache error (continuing without cache):', cacheError.message);
  }

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

  const Flights = mongoose.connection.db.collection('flights');
  const Hotels = mongoose.connection.db.collection('hotels');
  const Cars = mongoose.connection.db.collection('cars');
  
  // Filter by providerId if provided
  const flightFilter = providerId ? { providerId } : {};
  const hotelFilter = providerId ? { providerId } : {};
  const carFilter = providerId ? { providerId } : {};
  
  const [allFlights, allHotels, allCars] = await Promise.all([
    Flights.find(flightFilter, { projection: { flightId: 1, providerId: 1, providerName: 1 } }).toArray(),
    Hotels.find(hotelFilter, { projection: { hotelId: 1, providerId: 1, providerName: 1 } }).toArray(),
    Cars.find(carFilter, { projection: { carId: 1, providerId: 1, providerName: 1 } }).toArray()
  ]);

  const validListingIds = new Set([
    ...allFlights.map(f => f.flightId),
    ...allHotels.map(h => h.hotelId),
    ...allCars.map(c => c.carId)
  ]);

  const listingProviderMap = {};
  allFlights.forEach(f => {
    if (f.providerId) {
      listingProviderMap[f.flightId] = {
        providerId: f.providerId,
        providerName: f.providerName || 'Unknown'
      };
    }
  });
  allHotels.forEach(h => {
    if (h.providerId) {
      listingProviderMap[h.hotelId] = {
        providerId: h.providerId,
        providerName: h.providerName || 'Unknown'
      };
    }
  });
  allCars.forEach(c => {
    if (c.providerId) {
      listingProviderMap[c.carId] = {
        providerId: c.providerId,
        providerName: c.providerName || 'Unknown'
      };
    }
  });

  // Calculate revenue from MongoDB bookings by provider
  const Booking = mongoose.connection.db.collection('bookings');
  
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
  
  let monthBookings = await Booking.find({
    status: 'Confirmed',
    bookingDate: { $gte: startDate, $lte: endDate }
  }).toArray();
  
  // If we have less than 10 providers with bookings for the month, get all-time data
  const monthProviderIds = new Set();
  monthBookings.forEach(booking => {
    const listingId = booking.listingId;
    if (validListingIds.has(listingId) && listingProviderMap[listingId]) {
      monthProviderIds.add(listingProviderMap[listingId].providerId);
    }
  });
  
  if (monthProviderIds.size < 10) {
    logger.info(`Only ${monthProviderIds.size} providers with bookings in ${targetMonth}/${targetYear}, using all-time data for top 10`);
    monthBookings = await Booking.find({
      status: 'Confirmed'
    }).toArray();
  }

  // Aggregate by provider
  const providerStats = {};
  monthBookings.forEach(booking => {
    const listingId = booking.listingId;
    
    if (!validListingIds.has(listingId)) return;
    
    const providerInfo = listingProviderMap[listingId];
    if (!providerInfo) return;

    const providerId = providerInfo.providerId;
    
    if (!providerStats[providerId]) {
      providerStats[providerId] = {
        providerId,
        providerName: providerInfo.providerName,
        revenue: 0,
        bookingCount: 0,
        listingsSold: new Set()
      };
    }
    
    providerStats[providerId].revenue += booking.totalAmount || 0;
    providerStats[providerId].bookingCount += 1;
    providerStats[providerId].listingsSold.add(listingId);
  });

  const topProviders = Object.values(providerStats)
    .map(p => ({
      providerId: p.providerId,
      providerName: p.providerName,
      revenue: p.revenue,
      bookingCount: p.bookingCount,
      listingsSoldCount: p.listingsSold.size
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const data = {
    month: parseInt(targetMonth),
    year: parseInt(targetYear),
    topProviders
  };

  try {
    await setCache(cacheKey, JSON.stringify(data), 600);
  } catch (cacheError) {
    logger.warn('Cache set error (continuing without cache):', cacheError.message);
  }

  res.json({
    success: true,
    data,
    cached: false
  });
});

/**
 * Get revenue trend over time (monthly for a year)
 */
const getRevenueTrend = asyncHandler(async (req, res) => {
  const { year, providerId } = req.query;
  const targetYear = year || new Date().getFullYear();

  const cacheKey = `analytics:admin:revenue-trend:${targetYear}`;
  
  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }
  } catch (cacheError) {
    logger.warn('Cache error (continuing without cache):', cacheError.message);
  }

  // Calculate revenue from MongoDB bookings by month
  const Booking = mongoose.connection.db.collection('bookings');
  
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59);
  
  // If providerId is provided, we need to filter bookings by listings that belong to this provider
  let yearBookings;
  if (providerId) {
    // Get all listing IDs for this provider
    const Flights = mongoose.connection.db.collection('flights');
    const Hotels = mongoose.connection.db.collection('hotels');
    const Cars = mongoose.connection.db.collection('cars');
    
    const [providerFlights, providerHotels, providerCars] = await Promise.all([
      Flights.find({ providerId }, { projection: { flightId: 1 } }).toArray(),
      Hotels.find({ providerId }, { projection: { hotelId: 1 } }).toArray(),
      Cars.find({ providerId }, { projection: { carId: 1 } }).toArray()
    ]);
    
    const providerListingIds = [
      ...providerFlights.map(f => f.flightId),
      ...providerHotels.map(h => h.hotelId),
      ...providerCars.map(c => c.carId)
    ];
    
    yearBookings = await Booking.find({
      status: 'Confirmed',
      listingId: { $in: providerListingIds },
      bookingDate: { $gte: startDate, $lte: endDate }
    }).toArray();
  } else {
    yearBookings = await Booking.find({
      status: 'Confirmed',
      bookingDate: { $gte: startDate, $lte: endDate }
    }).toArray();
  }

  // Initialize monthly revenue array
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: new Date(2000, i, 1).toLocaleString('default', { month: 'short' }),
    revenue: 0,
    bookingCount: 0
  }));

  // Aggregate by month
  yearBookings.forEach(booking => {
    const bookingDate = new Date(booking.bookingDate || booking.createdAt);
    const monthIndex = bookingDate.getMonth(); // 0-11
    monthlyRevenue[monthIndex].revenue += booking.totalAmount || 0;
    monthlyRevenue[monthIndex].bookingCount += 1;
  });

  const data = {
    year: parseInt(targetYear),
    monthlyRevenue
  };

  try {
    await setCache(cacheKey, JSON.stringify(data), 600);
  } catch (cacheError) {
    logger.warn('Cache set error (continuing without cache):', cacheError.message);
  }

  res.json({
    success: true,
    data,
    cached: false
  });
});

module.exports = {
  getAdminOverview,
  getTopPropertiesByRevenue,
  getCityWiseRevenue,
  getTopProviders,
  getRevenueTrend,
  getAllProviders
};
