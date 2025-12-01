/**
 * Search Event Consumer - Handles frontend search events via Kafka
 */

const Flight = require('../models/Flight');
const Hotel = require('../models/Hotel');
const Car = require('../models/Car');
const { mongoose } = require('../../../shared/config/database');
const { getCache, setCache, deleteCachePattern } = require('../../../shared/config/redis');
const { sendMessage } = require('../../../shared/config/kafka');
const logger = require('../../../shared/utils/logger');
const crypto = require('crypto');

/**
 * Handle flight search event
 */
/**
 * Calculate seat availability for a flight based on bookings
 * Returns availability for each seat type for the given date
 */
async function calculateFlightSeatAvailability(flightId, travelDate, seatType, quantity) {
  // Define booking schema inline for availability calculation
  let Booking;
  if (mongoose.models.Booking) {
    Booking = mongoose.models.Booking;
  } else {
    const bookingSchema = new mongoose.Schema({
      listingId: { type: String, required: true, index: true },
      listingType: { type: String, enum: ['Flight', 'Hotel', 'Car'], required: true, index: true },
      roomType: { type: String, default: null }, // Used for flight seat type
      quantity: { type: Number, required: true, min: 1 },
      travelDate: { type: Date, default: null },
      status: { type: String, enum: ['Confirmed', 'Pending', 'Cancelled', 'Failed'], default: 'Pending', index: true }
    }, { collection: 'bookings', strict: false });
    Booking = mongoose.model('Booking', bookingSchema, 'bookings');
  }
  
  const travel = new Date(travelDate);
  travel.setHours(0, 0, 0, 0);
  const travelEnd = new Date(travelDate);
  travelEnd.setHours(23, 59, 59, 999);
  
  // Find all bookings for this flight on this date with this seat type
  const bookings = await Booking.find({
    listingId: flightId,
    listingType: 'Flight',
    status: { $in: ['Confirmed', 'Pending'] },
    travelDate: { $gte: travel, $lte: travelEnd },
    roomType: seatType // Using roomType field for seat type
  });
  
  // Sum up booked quantities
  const bookedSeats = bookings.reduce((sum, booking) => sum + booking.quantity, 0);
  
  return bookedSeats;
}

/**
 * Handle flight search event
 * Supports one-way and round trip searches
 */
async function handleFlightSearch(event) {
  const { 
    requestId, 
    departureAirport, 
    arrivalAirport, 
    departureDate, 
    returnDate, // For round trip
    tripType, // 'one-way' or 'round-trip'
    minPrice, 
    maxPrice, 
    seatType, // Filter by specific seat type
    sortBy,
    numberOfPassengers // Number of passengers needed
  } = event;

  try {
    // Search for outbound flights
    const outboundQuery = { status: 'Active' };

    if (departureAirport) outboundQuery.departureAirport = departureAirport.toUpperCase();
    if (arrivalAirport) outboundQuery.arrivalAirport = arrivalAirport.toUpperCase();
    
    // Get day of week from departure date for filtering by operating days
    let searchDayOfWeek = null;
    if (departureDate) {
      const searchDate = new Date(departureDate);
      // Check if flight is available on this date (within availableFrom/availableTo range)
      outboundQuery.availableFrom = { $lte: searchDate };
      outboundQuery.availableTo = { $gte: searchDate };

      // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayIndex = searchDate.getDay();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      searchDayOfWeek = daysOfWeek[dayIndex];
    }

    const cacheKey = `search:flight:${crypto.createHash('md5').update(JSON.stringify(outboundQuery)).digest('hex')}`;
    
    let outboundFlights = await getCache(cacheKey);
    
    if (!outboundFlights) {
      outboundFlights = await Flight.find(outboundQuery)
        .sort({ departureTime: 1 }) // Sort by departure time
        .limit(100);
      
      await setCache(cacheKey, outboundFlights, 900);
    }

    // Log diagnostic information about the query and initial results
    logger.info('Flight search Mongo query built', {
      requestId,
      departureAirport: outboundQuery.departureAirport,
      arrivalAirport: outboundQuery.arrivalAirport,
      availableFrom: outboundQuery.availableFrom,
      availableTo: outboundQuery.availableTo,
      searchDayOfWeek,
      initialCount: Array.isArray(outboundFlights) ? outboundFlights.length : 0
    });

    // Filter by operating days if search date is provided
    if (searchDayOfWeek) {
      outboundFlights = outboundFlights.filter(flight => {
        const flightObj = flight.toObject ? flight.toObject() : flight;
        // Check if flight operates on the search day
        return flightObj.operatingDays && flightObj.operatingDays.includes(searchDayOfWeek);
      });
    }

    // Log a small sample of flights after operating day filtering
    if (outboundFlights && outboundFlights.length > 0) {
      const sample = outboundFlights.slice(0, 5).map(f => {
        const fo = f.toObject ? f.toObject() : f;
        return {
          flightId: fo.flightId,
          departureAirport: fo.departureAirport,
          arrivalAirport: fo.arrivalAirport,
          availableFrom: fo.availableFrom,
          availableTo: fo.availableTo,
          operatingDays: fo.operatingDays
        };
      });
      logger.info('Flight search outbound flights after operating day filter', {
        requestId,
        count: outboundFlights.length,
        sample
      });
    } else {
      logger.info('Flight search: no outbound flights matched initial criteria after operating day filter', {
        requestId
      });
    }

    // Calculate actual seat availability for each flight
    const flightsWithAvailability = await Promise.all(
      outboundFlights.map(async (flight) => {
        const flightObj = flight.toObject ? flight.toObject() : flight;
        
        // Build departureDateTime and arrivalDateTime from search date + flight times for display
        let departureDateTime = null;
        let arrivalDateTime = null;
        if (departureDate && flightObj.departureTime && flightObj.arrivalTime) {
          const searchDate = new Date(departureDate);
          const [depHours, depMins] = flightObj.departureTime.split(':').map(Number);
          const [arrHours, arrMins] = flightObj.arrivalTime.split(':').map(Number);
          
          departureDateTime = new Date(searchDate);
          departureDateTime.setHours(depHours, depMins, 0, 0);
          
          arrivalDateTime = new Date(searchDate);
          arrivalDateTime.setHours(arrHours, arrMins, 0, 0);
          
          // If arrival time is earlier than departure time, assume next day
          if (arrivalDateTime <= departureDateTime) {
            arrivalDateTime.setDate(arrivalDateTime.getDate() + 1);
          }
        }
        
        // If flight has seatTypes (new format), calculate availability per seat type
        if (flightObj.seatTypes && Array.isArray(flightObj.seatTypes)) {
          const seatTypesWithAvailability = await Promise.all(
            flightObj.seatTypes.map(async (seatTypeData) => {
              const bookedSeats = await calculateFlightSeatAvailability(
                flightObj.flightId,
                departureDate,
                seatTypeData.type,
                0 // We're just checking, not booking
              );
              
              const available = Math.max(0, seatTypeData.availableSeats - bookedSeats);
              
              return {
                ...seatTypeData,
                availableSeats: available,
                bookedSeats: bookedSeats
              };
            })
          );
          
          // Filter by seat type if specified
          let filteredSeatTypes = seatTypesWithAvailability;
          if (seatType) {
            filteredSeatTypes = seatTypesWithAvailability.filter(st => st.type === seatType);
          }
          
          // Filter by price range if specified
          if (minPrice || maxPrice) {
            filteredSeatTypes = filteredSeatTypes.filter(st => {
              if (minPrice && st.ticketPrice < parseFloat(minPrice)) return false;
              if (maxPrice && st.ticketPrice > parseFloat(maxPrice)) return false;
              return true;
            });
          }
          
          // Filter by number of passengers needed
          if (numberOfPassengers) {
            filteredSeatTypes = filteredSeatTypes.filter(st => st.availableSeats >= numberOfPassengers);
          }
          
          // Only include flight if it has available seat types after filtering
          if (filteredSeatTypes.length === 0) {
            return null;
          }
          
          return {
            ...flightObj,
            departureDateTime: departureDateTime || flightObj.departureDateTime,
            arrivalDateTime: arrivalDateTime || flightObj.arrivalDateTime,
            seatTypes: filteredSeatTypes
          };
        } else {
          // Legacy format - single seat type
          // Check availability using legacy fields
          const bookedSeats = await calculateFlightSeatAvailability(
            flightObj.flightId,
            departureDate,
            flightObj.flightClass,
            0
          );
          
          const available = Math.max(0, (flightObj.availableSeats || 0) - bookedSeats);
          
          if (available < (numberOfPassengers || 1)) {
            return null;
          }
          
          // Convert legacy format to new format for consistency
          return {
            ...flightObj,
            seatTypes: [{
              type: flightObj.flightClass,
              ticketPrice: flightObj.ticketPrice,
              totalSeats: flightObj.totalSeats,
              availableSeats: available,
              bookedSeats: bookedSeats
            }]
          };
        }
      })
    );

    // Filter out null flights (no availability)
    const availableOutboundFlights = flightsWithAvailability.filter(f => f !== null);

    let returnFlights = [];
    
    // If round trip, search for return flights
    let returnDayOfWeek = null;
    if (tripType === 'round-trip' && returnDate && departureAirport && arrivalAirport) {
      const returnQuery = {
        status: 'Active',
        departureAirport: arrivalAirport.toUpperCase(), // Reverse airports for return
        arrivalAirport: departureAirport.toUpperCase()
      };
      
      const searchDate = new Date(returnDate);
      returnQuery.availableFrom = { $lte: searchDate };
      returnQuery.availableTo = { $gte: searchDate };
      
      // Get day of week for return flight
      const dayIndex = searchDate.getDay();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      returnDayOfWeek = daysOfWeek[dayIndex];
      
      const returnCacheKey = `search:flight:${crypto.createHash('md5').update(JSON.stringify(returnQuery)).digest('hex')}`;
      
      let returnFlightsCached = await getCache(returnCacheKey);
      
      if (!returnFlightsCached) {
        returnFlightsCached = await Flight.find(returnQuery)
          .sort({ departureTime: 1 }) // Sort by departure time
          .limit(100);
        
        await setCache(returnCacheKey, returnFlightsCached, 900);
      }

      // Filter by operating days if return date is provided
      if (returnDayOfWeek) {
        returnFlightsCached = returnFlightsCached.filter(flight => {
          const flightObj = flight.toObject ? flight.toObject() : flight;
          return flightObj.operatingDays && flightObj.operatingDays.includes(returnDayOfWeek);
        });
      }

      // Calculate availability for return flights
      const returnFlightsWithAvailability = await Promise.all(
        returnFlightsCached.map(async (flight) => {
          const flightObj = flight.toObject ? flight.toObject() : flight;
          
          // Build departureDateTime and arrivalDateTime from return date + flight times
          let departureDateTime = null;
          let arrivalDateTime = null;
          if (returnDate && flightObj.departureTime && flightObj.arrivalTime) {
            const searchDate = new Date(returnDate);
            const [depHours, depMins] = flightObj.departureTime.split(':').map(Number);
            const [arrHours, arrMins] = flightObj.arrivalTime.split(':').map(Number);
            
            departureDateTime = new Date(searchDate);
            departureDateTime.setHours(depHours, depMins, 0, 0);
            
            arrivalDateTime = new Date(searchDate);
            arrivalDateTime.setHours(arrHours, arrMins, 0, 0);
            
            // If arrival time is earlier than departure time, assume next day
            if (arrivalDateTime <= departureDateTime) {
              arrivalDateTime.setDate(arrivalDateTime.getDate() + 1);
            }
          }
          
          if (flightObj.seatTypes && Array.isArray(flightObj.seatTypes)) {
            const seatTypesWithAvailability = await Promise.all(
              flightObj.seatTypes.map(async (seatTypeData) => {
                const bookedSeats = await calculateFlightSeatAvailability(
                  flightObj.flightId,
                  returnDate,
                  seatTypeData.type,
                  0
                );
                
                const available = Math.max(0, seatTypeData.availableSeats - bookedSeats);
                
                return {
                  ...seatTypeData,
                  availableSeats: available,
                  bookedSeats: bookedSeats
                };
              })
            );
            
            let filteredSeatTypes = seatTypesWithAvailability;
            if (seatType) {
              filteredSeatTypes = filteredSeatTypes.filter(st => st.type === seatType);
            }
            
            if (minPrice || maxPrice) {
              filteredSeatTypes = filteredSeatTypes.filter(st => {
                if (minPrice && st.ticketPrice < parseFloat(minPrice)) return false;
                if (maxPrice && st.ticketPrice > parseFloat(maxPrice)) return false;
                return true;
              });
            }
            
            if (numberOfPassengers) {
              filteredSeatTypes = filteredSeatTypes.filter(st => st.availableSeats >= numberOfPassengers);
            }
            
            if (filteredSeatTypes.length === 0) {
              return null;
            }
            
            return {
              ...flightObj,
              departureDateTime: departureDateTime || flightObj.departureDateTime,
              arrivalDateTime: arrivalDateTime || flightObj.arrivalDateTime,
              seatTypes: filteredSeatTypes
            };
          } else {
            const bookedSeats = await calculateFlightSeatAvailability(
              flightObj.flightId,
              returnDate,
              flightObj.flightClass,
              0
            );
            
            const available = Math.max(0, (flightObj.availableSeats || 0) - bookedSeats);
            
            if (available < (numberOfPassengers || 1)) {
              return null;
            }
            
            return {
              ...flightObj,
              departureDateTime: departureDateTime || flightObj.departureDateTime,
              arrivalDateTime: arrivalDateTime || flightObj.arrivalDateTime,
              seatTypes: [{
                type: flightObj.flightClass,
                ticketPrice: flightObj.ticketPrice,
                totalSeats: flightObj.totalSeats,
                availableSeats: available,
                bookedSeats: bookedSeats
              }]
            };
          }
        })
      );
      
      returnFlights = returnFlightsWithAvailability.filter(f => f !== null);
    }

    // Structure response for frontend: outbound/return format
    const responseData = {
      outbound: availableOutboundFlights,
      return: returnFlights,
      tripType: tripType || 'one-way'
    };

    logger.info('Flight search final availability summary', {
      requestId,
      outboundInitialCount: flightsWithAvailability.length,
      outboundAvailableCount: availableOutboundFlights.length,
      returnCount: returnFlights.length,
      tripType: tripType || 'one-way'
    });

    await sendMessage('search-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'search.flights',
        data: responseData
      }
    });

  } catch (error) {
    logger.error(`Error handling flight search: ${error.message}`);
    
    await sendMessage('search-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'search.flights',
        error: {
          code: 'SEARCH_ERROR',
          message: error.message
        }
      }
    });
  }
}

/**
 * Calculate room availability for a hotel based on bookings
 * Returns availability for each room type for the given date range
 */
async function calculateHotelRoomAvailability(hotelId, checkInDate, checkOutDate) {
  // Define booking schema inline for availability calculation (similar to billing service)
  // Use existing model if available, otherwise create inline schema
  let Booking;
  if (mongoose.models.Booking) {
    Booking = mongoose.models.Booking;
  } else {
    const bookingSchema = new mongoose.Schema({
      listingId: { type: String, required: true, index: true },
      listingType: { type: String, enum: ['Flight', 'Hotel', 'Car'], required: true, index: true },
      roomType: { type: String, default: null },
      quantity: { type: Number, required: true, min: 1 },
      checkInDate: { type: Date, default: null },
      checkOutDate: { type: Date, default: null },
      status: { type: String, enum: ['Confirmed', 'Pending', 'Cancelled', 'Failed'], default: 'Pending', index: true }
    }, { collection: 'bookings', strict: false });
    Booking = mongoose.model('Booking', bookingSchema, 'bookings');
  }
  
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  
  // Find all bookings that overlap with the requested date range
  // A booking overlaps if: booking.checkInDate < checkOutDate AND booking.checkOutDate > checkInDate
  const overlappingBookings = await Booking.find({
    listingId: hotelId,
    listingType: 'Hotel',
    status: { $in: ['Confirmed', 'Pending'] },
    $or: [
      {
        // Booking starts before requested checkout and ends after requested checkin
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    ]
  });
  
  // Group bookings by room type and sum quantities
  const bookedByRoomType = {};
  overlappingBookings.forEach(booking => {
    if (booking.roomType) {
      bookedByRoomType[booking.roomType] = (bookedByRoomType[booking.roomType] || 0) + booking.quantity;
    }
  });
  
  return bookedByRoomType;
}

/**
 * Handle hotel search event
 */
async function handleHotelSearch(event) {
  const { 
    requestId, 
    city, 
    state, 
    starRating, 
    minPrice, 
    maxPrice, 
    amenities, 
    sortBy,
    checkInDate,
    checkOutDate,
    numberOfRooms,
    numberOfAdults
  } = event;

  try {
    const query = { status: 'Active' };
    const andConditions = [];

    // Search in both city and address fields for location matching
    if (city) {
      const citySearch = city.trim();
      if (citySearch) {
        // Use $or to search in both city and address fields for partial matches
        // This allows searching for "San" to find "San Jose" or hotels in addresses containing "San"
        const locationConditions = [
          { city: new RegExp(citySearch, 'i') },
          { address: new RegExp(citySearch, 'i') }
        ];
        andConditions.push({ $or: locationConditions });
      }
    }
    
    // Add state filter if provided
    if (state) {
      andConditions.push({ state: state.toUpperCase() });
    }
    
    // Add other filters
    if (starRating) {
      andConditions.push({ starRating: parseInt(starRating) });
    }
    if (amenities) {
      const amenityList = Array.isArray(amenities) ? amenities : [amenities];
      andConditions.push({ amenities: { $in: amenityList } });
    }
    
    // Filter by availability dates if provided
    // Hotel must be available during the entire requested date range
    if (checkInDate && checkOutDate) {
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      
      // Only apply date filter if dates are valid
      if (!isNaN(checkIn.getTime()) && !isNaN(checkOut.getTime()) && checkOut > checkIn) {
        // Hotel's availableFrom must be <= checkIn (hotel starts being available before or on check-in)
        // Hotel's availableTo must be >= checkOut (hotel remains available after or on check-out)
        andConditions.push({
          availableFrom: { $lte: checkIn },
          availableTo: { $gte: checkOut }
        });
      }
    }
    
    // Combine all conditions - use $and if we have multiple, otherwise merge directly
    if (andConditions.length > 1) {
      query.$and = andConditions;
    } else if (andConditions.length === 1) {
      // If only one condition, merge it directly into query
      const condition = andConditions[0];
      if (condition.$or) {
        query.$or = condition.$or;
      } else {
        Object.assign(query, condition);
      }
    }

    const cacheKey = `search:hotel:${crypto.createHash('md5').update(JSON.stringify(query)).digest('hex')}`;
    
    let hotels = await getCache(cacheKey);
    
    if (!hotels) {
      hotels = await Hotel.find(query).sort({ [sortBy || 'hotelRating']: -1 }).limit(100);
      
      // Convert to plain objects for caching (deep conversion)
      hotels = hotels.map(h => {
        const hotelObj = h.toObject ? h.toObject() : h;
        // Ensure roomTypes array is also plain objects
        if (hotelObj.roomTypes && Array.isArray(hotelObj.roomTypes)) {
          hotelObj.roomTypes = hotelObj.roomTypes.map(rt => {
            return rt && typeof rt.toObject === 'function' ? rt.toObject() : rt;
          });
        }
        return hotelObj;
      });
      
      // Filter by price if specified
      if (minPrice || maxPrice) {
        hotels = hotels.filter(hotel => {
          const minRoomPrice = Math.min(...hotel.roomTypes.map(rt => rt.pricePerNight));
          const maxRoomPrice = Math.max(...hotel.roomTypes.map(rt => rt.pricePerNight));
          if (minPrice && maxRoomPrice < parseFloat(minPrice)) return false;
          if (maxPrice && minRoomPrice > parseFloat(maxPrice)) return false;
          return true;
        });
      }
      
      await setCache(cacheKey, hotels, 900);
    } else {
      // Hotels from cache - ensure roomTypes are plain objects
      hotels = hotels.map(hotel => {
        if (hotel.roomTypes && Array.isArray(hotel.roomTypes)) {
          hotel.roomTypes = hotel.roomTypes.map(rt => {
            // Remove any Mongoose methods/properties if present
            // Ensure rt exists, is an object, and toObject is a function
            if (rt && typeof rt === 'object' && rt.toObject && typeof rt.toObject === 'function') {
              return rt.toObject();
            }
            return rt;
          });
        }
        return hotel;
      });
    }

    // Calculate availability for each hotel if dates are provided
    // Use numberOfRooms if provided, otherwise calculate from numberOfAdults
    if (checkInDate && checkOutDate && (numberOfRooms || numberOfAdults)) {
      // Priority: Use numberOfRooms if specified, otherwise calculate from adults (assuming 2 adults per room)
      const requiredRooms = numberOfRooms || Math.ceil((numberOfAdults || 2) / 2);
      
      const hotelsWithAvailability = await Promise.all(
        hotels.map(async (hotel) => {
          const bookedByRoomType = await calculateHotelRoomAvailability(
            hotel.hotelId,
            checkInDate,
            checkOutDate
          );
          
          // Calculate available rooms for each room type
          const roomAvailability = hotel.roomTypes.map(roomType => {
            const booked = bookedByRoomType[roomType.type] || 0;
            // Handle both Mongoose documents and plain objects
            // Use typeof check to ensure toObject is actually a function
            const roomTypeObj = (roomType && typeof roomType.toObject === 'function') 
              ? roomType.toObject() 
              : (roomType || {});
            const available = Math.max(0, (roomTypeObj.availableCount || 0) - booked);
            return {
              ...roomTypeObj,
              available,
              booked
            };
          });
          
          // Check if hotel has enough rooms to satisfy the request
          const totalAvailable = roomAvailability.reduce((sum, rt) => sum + rt.available, 0);
          const hasEnoughRooms = totalAvailable >= requiredRooms;
          
          // Handle both Mongoose documents and plain objects
          const hotelObj = hotel && typeof hotel.toObject === 'function' ? hotel.toObject() : hotel;
          
          return {
            ...hotelObj,
            roomAvailability,
            totalAvailableRooms: totalAvailable,
            hasEnoughRooms
          };
        })
      );
      
      // Filter hotels that have enough rooms
      const availableHotels = hotelsWithAvailability.filter(h => h.hasEnoughRooms);
      
      logger.info(`Hotel search: Found ${hotels.length} hotels matching criteria, ${availableHotels.length} have enough rooms. Required: ${requiredRooms} rooms.`);
      
      await sendMessage('search-events-response', {
        key: requestId,
        value: {
          requestId,
          success: true,
          eventType: 'search.hotels',
          data: {
            hotels: availableHotels,
            count: availableHotels.length
          }
        }
      });
    } else {
      // No date/room filtering, return all hotels
      await sendMessage('search-events-response', {
        key: requestId,
        value: {
          requestId,
          success: true,
          eventType: 'search.hotels',
          data: {
            hotels,
            count: hotels.length
          }
        }
      });
    }

  } catch (error) {
    logger.error(`Error handling hotel search: ${error.message}`);
    
    await sendMessage('search-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'search.hotels',
        error: {
          code: 'SEARCH_ERROR',
          message: error.message
        }
      }
    });
  }
}

/**
 * Handle car search event
 */
async function handleCarSearch(event) {
  const { requestId, carType, minPrice, maxPrice, transmissionType, minSeats, sortBy, pickupDate, dropoffDate, location } = event;

  try {
    const query = { 
      status: 'Active'
    };
    
    // Only filter by availabilityStatus if dates are provided (to check actual availability)
    // Otherwise, show all Active cars (availabilityStatus can be checked later during booking)
    if (pickupDate && dropoffDate) {
      query.availabilityStatus = 'Available';
    }

    if (carType) query.carType = carType;
    if (transmissionType) query.transmissionType = transmissionType;
    if (minSeats) query.numberOfSeats = { $gte: parseInt(minSeats) };
    if (minPrice || maxPrice) {
      query.dailyRentalPrice = {};
      if (minPrice) query.dailyRentalPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.dailyRentalPrice.$lte = parseFloat(maxPrice);
    }
    
    // Location filtering with hierarchical matching
    // If location is provided, match hierarchically:
    // - If neighbourhood matches, show only that neighbourhood
    // - If city matches, show all cars in that city
    // - If state matches, show all cars in that state
    // - If country matches, show all cars in that country
    if (location) {
      const locationLower = location.toLowerCase().trim();
      const locationQuery = {
        $or: [
          // Match neighbourhood (exact or partial)
          { neighbourhood: { $regex: locationLower, $options: 'i' } },
          // Match city (exact or partial)
          { city: { $regex: locationLower, $options: 'i' } },
          // Match state (exact or partial, case-insensitive)
          { state: { $regex: locationLower, $options: 'i' } },
          // Match country (exact or partial)
          { country: { $regex: locationLower, $options: 'i' } }
        ]
      };
      
      // If we have existing $and conditions, merge them
      if (query.$and) {
        query.$and.push(locationQuery);
      } else {
        query.$and = [locationQuery];
      }
    }
    
    // Filter by availability dates if provided
    // Note: Cars created before availableFrom/availableTo were added may have null/undefined dates
    // In that case, we should include them (assume they're always available)
    if (pickupDate && dropoffDate) {
      const pickup = new Date(pickupDate);
      const dropoff = new Date(dropoffDate);
      
      // Build date filter to include cars without dates OR cars with overlapping dates
      // We use $or at the root level, but need to include all other conditions in each branch
      // Instead, we'll use a simpler approach: filter in post-processing
      // For now, include cars that either have no dates or have overlapping dates
      query.$and = [
        {
          $or: [
            // Cars without date ranges (null/undefined) - assume always available
            { availableFrom: null },
            { availableFrom: { $exists: false } },
            { availableTo: null },
            { availableTo: { $exists: false } },
            // Cars with date ranges that overlap the requested period
            {
              $and: [
                { availableFrom: { $exists: true, $ne: null } },
                { availableTo: { $exists: true, $ne: null } },
                { availableFrom: { $lte: dropoff } },
                { availableTo: { $gte: pickup } }
              ]
            }
          ]
        }
      ];
    }

    const cacheKey = `search:car:${crypto.createHash('md5').update(JSON.stringify(query)).digest('hex')}`;
    
    let cars = await getCache(cacheKey);
    
    if (!cars) {
      cars = await Car.find(query).sort({ [sortBy || 'dailyRentalPrice']: 1 }).limit(100);
      
      // If dates provided, check for booking conflicts
      if (pickupDate && dropoffDate) {
        try {
          const Booking = require('../../booking-service/models/Booking');
          const pickup = new Date(pickupDate);
          const dropoff = new Date(dropoffDate);
          
          // Filter out cars with conflicting bookings
          const availableCars = [];
          for (const car of cars) {
            // Exclude 'Failed' bookings as they don't hold inventory
            const conflictingBookings = await Booking.find({
              listingId: car.carId,
              listingType: 'Car',
              status: { $in: ['Confirmed', 'Pending'] }, // Exclude 'Failed' and 'Cancelled'
              $or: [
                {
                  checkInDate: { $lte: dropoff },
                  checkOutDate: { $gte: pickup }
                }
              ]
            });
            
            if (conflictingBookings.length === 0) {
              availableCars.push(car);
            }
          }
          cars = availableCars;
        } catch (error) {
          logger.error('Error checking booking conflicts:', error);
          // Continue with original cars list if booking check fails
        }
      }
      
      await setCache(cacheKey, cars, 900);
    }

    await sendMessage('search-events-response', {
      key: requestId,
      value: {
        requestId,
        success: true,
        eventType: 'search.cars',
        data: {
          cars,
          count: cars.length
        }
      }
    });

  } catch (error) {
    logger.error(`Error handling car search: ${error.message}`);
    
    await sendMessage('search-events-response', {
      key: requestId,
      value: {
        requestId,
        success: false,
        eventType: 'search.cars',
        error: {
          code: 'SEARCH_ERROR',
          message: error.message
        }
      }
    });
  }
}

/**
 * Kafka message handler
 */
async function handleSearchEvent(topic, message, metadata) {
  try {
    const event = typeof message === 'string' ? JSON.parse(message) : message;
    const { eventType } = event;

    logger.info(`Received search event: ${eventType}`, { requestId: event.requestId });

    switch (eventType) {
      case 'search.flights':
        await handleFlightSearch(event);
        break;
      case 'search.hotels':
        await handleHotelSearch(event);
        break;
      case 'search.cars':
        await handleCarSearch(event);
        break;
      default:
        logger.warn(`Unknown search event type: ${eventType}`);
    }
  } catch (error) {
    logger.error(`Error processing search event: ${error.message}`, error);
  }
}

module.exports = {
  handleSearchEvent
};

