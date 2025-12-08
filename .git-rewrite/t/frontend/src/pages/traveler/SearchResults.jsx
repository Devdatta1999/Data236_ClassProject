import { useEffect, useState, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setSearchResults, setLoading, setError, setSearchType } from '../../store/slices/searchSlice'
import { addToCart } from '../../store/slices/cartSlice'
import { sendEventAndWait } from '../../services/kafkaService'
import { ShoppingCart, Star, MapPin, Calendar, Users, Check, Plane, Car } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import Pagination from '../../components/common/Pagination'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source - handles various image path formats
const getImageSrc = (imagePath) => {
  if (!imagePath) return ''
  // If it's already a full URL (http/https), return as is
  if (imagePath.startsWith('http')) return imagePath
  // If it already starts with /api/, prepend API_BASE_URL (handles both listings/images and providers/profile-pictures)
  if (imagePath.startsWith('/api/')) {
    return `${API_BASE_URL}${imagePath}`
  }
  // Otherwise, extract filename and construct the path (assume listings/images)
  const filename = imagePath.split('/').pop()
  const encodedFilename = encodeURIComponent(filename)
  return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
}

// Flight Card Component
const FlightCard = ({ item, searchParams, searchType, onViewDetails }) => {
  const formatTime = (dateTime) => {
    if (!dateTime) return 'N/A'
    return format(new Date(dateTime), 'hh:mm a')
  }

  const formatDate = (dateTime) => {
    if (!dateTime) return 'N/A'
    return format(new Date(dateTime), 'MMM dd')
  }

  const formatDuration = (duration) => {
    if (!duration) return 'N/A'
    const hours = Math.floor(duration / 60)
    const minutes = duration % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  // Get minimum price from seat types
  const minPrice =
    item.seatTypes && item.seatTypes.length > 0
      ? Math.min(
          ...item.seatTypes
            .filter((st) => st.availableSeats > 0)
            .map((st) => st.ticketPrice),
        )
      : item.ticketPrice || 0

  return (
    <div
      className="card hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onViewDetails(item)}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 flex items-start space-x-4">
          {/* Flight Image */}
          <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
            {(() => {
              const imageSrc = item.image ? getImageSrc(item.image) : null
              return imageSrc ? (
                <img
                  key={`img-flight-${item.flightId}-${imageSrc}`}
                  src={imageSrc}
                  alt={item.providerName || item.flightId}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextSibling?.classList.remove('hidden')
                  }}
                  onLoad={(e) => {
                    e.target.style.opacity = '1'
                    e.target.style.display = 'block'
                  }}
                />
              ) : null
            })()}
            <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
              <Plane className="w-8 h-8" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-4 mb-3">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{item.flightId}</h3>
                {item.providerName && (
                  <span className="text-sm text-gray-600">{item.providerName}</span>
                )}
              </div>
              {item.flightRating > 0 && (
                <div className="flex items-center">
                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                  <span className="ml-1">{item.flightRating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-4 items-center">
              <div>
                <p className="text-2xl font-bold">{item.departureAirport}</p>
                <p className="text-sm text-gray-600">{formatTime(item.departureDateTime)}</p>
                <p className="text-xs text-gray-500">{formatDate(item.departureDateTime)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">{formatDuration(item.duration)}</p>
                <div className="flex items-center my-2">
                  <div className="flex-1 h-px bg-gray-300" />
                  <div className="mx-2 transform rotate-90">→</div>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold">{item.arrivalAirport}</p>
                <p className="text-sm text-gray-600">{formatTime(item.arrivalDateTime)}</p>
                <p className="text-xs text-gray-500">{formatDate(item.arrivalDateTime)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary-600">
                  ${minPrice.toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">per person</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDetails(item)
                  }}
                  className="btn-primary mt-3 flex items-center space-x-2"
                >
                  <span>View Details</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hotel Card Component
const HotelCard = ({ item, location, navigate }) => {
  const checkInDate = location.state?.searchParams?.checkInDate
  const checkOutDate = location.state?.searchParams?.checkOutDate
  const nights =
    checkInDate && checkOutDate
      ? differenceInDays(new Date(checkOutDate), new Date(checkInDate)) || 1
      : 1

  const minPrice =
    item.roomAvailability && item.roomAvailability.length > 0
      ? Math.min(
          ...item.roomAvailability
            .filter((rt) => rt.available > 0)
            .map((rt) => rt.pricePerNight),
        )
      : item.roomTypes && item.roomTypes.length > 0
      ? Math.min(...item.roomTypes.map((rt) => rt.pricePerNight))
      : 0

  // Compute image source once using the shared helper function
  const imageSrc = item.images && item.images.length > 0 ? getImageSrc(item.images[0]) : null

  return (
    <div
      className="card"
      onClick={(e) => {
        e.stopPropagation()
        navigate(`/hotel/${item.hotelId}`, {
          state: {
            hotel: item,
            searchParams: location.state?.searchParams || {},
            type: 'hotels',
            fromSearch: true,
          },
        })
      }}
    >
      <div className="flex justify-between items-start cursor-pointer hover:bg-gray-50 p-4 -m-4 rounded-lg transition-colors">
        {/* Hotel Image */}
        <div className="w-32 h-32 flex-shrink-0 mr-4 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
          {imageSrc ? (
            <img
              key={`img-hotel-${item.hotelId}-${imageSrc}`}
              src={imageSrc}
              alt={item.hotelName}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling?.classList.remove('hidden')
              }}
              onLoad={(e) => {
                e.target.style.opacity = '1'
                e.target.style.display = 'block'
              }}
            />
          ) : null}
          <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center space-x-4 mb-2">
            <h3 className="text-xl font-semibold">{item.hotelName}</h3>
            <div className="flex items-center space-x-1">
              {Array.from({ length: item.starRating || 0 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
              ))}
            </div>
            {item.hotelRating > 0 && (
              <div className="flex items-center bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                <Star className="w-3 h-3 fill-current mr-1" />
                <span>{item.hotelRating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center text-gray-600 mb-2">
            <MapPin className="w-4 h-4 mr-1" />
            <span>
              {item.address}, {item.city}, {item.state} {item.zipCode}
            </span>
          </div>
          {item.amenities && item.amenities.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {item.amenities.slice(0, 5).map((amenity, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                >
                  {amenity}
                </span>
              ))}
              {item.amenities.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{item.amenities.length - 5} more
                </span>
              )}
            </div>
          )}
          {item.roomAvailability && item.roomAvailability.length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Available room types:</span>{' '}
              {item.roomAvailability
                .filter((rt) => rt.available > 0)
                .map((rt) => rt.type)
                .join(', ')}
            </div>
          )}
        </div>

        <div className="ml-6 text-right">
          <p className="text-2xl font-bold text-primary-600">
            ${minPrice.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500">per night</p>
          {nights > 1 && (
            <p className="text-sm text-gray-600 mt-1">
              ${(minPrice * nights).toFixed(2)} for {nights} nights
            </p>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/hotel/${item.hotelId}`, {
                state: {
                  hotel: item,
                  searchParams: location.state?.searchParams || {},
                  type: 'hotels',
                  fromSearch: true,
                },
              })
            }}
            className="btn-primary mt-4 flex items-center space-x-2"
          >
            <span>View Details</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Car Card Component
const CarCard = ({ item, location, navigate }) => {
  const pickupDate = location.state?.searchParams?.pickupDate
  const returnDate = location.state?.searchParams?.returnDate

  const isValidDate = (dateStr) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    return date instanceof Date && !isNaN(date.getTime())
  }

  const numberOfDays =
    pickupDate &&
    returnDate &&
    isValidDate(pickupDate) &&
    isValidDate(returnDate)
      ? differenceInDays(new Date(returnDate), new Date(pickupDate)) || 1
      : 1

  const totalPrice = (item.dailyRentalPrice || 0) * numberOfDays

  return (
    <div className="card">
      <div className="flex justify-between items-start">
        <div className="flex-1 flex items-start space-x-4">
          {/* Car Image */}
          <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
            {(() => {
              const imageSrc = item.image ? getImageSrc(item.image) : null
              return imageSrc ? (
                <img
                  key={`img-car-${item.carId || item.model}-${imageSrc}`}
                  src={imageSrc}
                  alt={item.providerName || item.model || item.carModel}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextSibling?.classList.remove('hidden')
                  }}
                  onLoad={(e) => {
                    e.target.style.opacity = '1'
                    e.target.style.display = 'block'
                  }}
                />
              ) : null
            })()}
            <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
              <Car className="w-8 h-8" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-4 mb-2">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{item.model || item.carModel}</h3>
                {item.providerName && (
                  <span className="text-sm text-gray-600">{item.providerName}</span>
                )}
              </div>
              <div className="flex items-center">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="ml-1">{item.carRating || 'N/A'}</span>
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-2">
              <p className="font-medium">
                {item.carType} • {item.transmissionType} •{' '}
                {item.numberOfSeats || item.seats} seats
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>
                  {item.neighbourhood && `${item.neighbourhood}, `}
                  {item.city}
                  {item.state && `, ${item.state}`}
                  {item.country && `, ${item.country}`}
                </span>
              </div>
              {pickupDate &&
                returnDate &&
                isValidDate(pickupDate) &&
                isValidDate(returnDate) && (
                  <div className="flex items-center space-x-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>
                      {format(new Date(pickupDate), 'MMM dd, yyyy')} -{' '}
                      {format(new Date(returnDate), 'MMM dd, yyyy')} ({numberOfDays}{' '}
                      {numberOfDays === 1 ? 'day' : 'days'})
                    </span>
                  </div>
                )}
              <div className="flex items-center space-x-2 mt-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>
                  Available:{' '}
                  {item.availableFrom && isValidDate(item.availableFrom)
                    ? format(new Date(item.availableFrom), 'MMM dd, yyyy')
                    : 'N/A'}{' '}
                  -{' '}
                  {item.availableTo && isValidDate(item.availableTo)
                    ? format(new Date(item.availableTo), 'MMM dd, yyyy')
                    : 'N/A'}
                </span>
              </div>
              {item.providerName && (
                <p className="text-sm text-gray-500 mt-1">
                  Provider: {item.providerName}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="ml-6 text-right">
          <p className="text-2xl font-bold text-primary-600">
            ${item.dailyRentalPrice}
          </p>
          <p className="text-sm text-gray-500">per day</p>
          {pickupDate &&
            returnDate &&
            isValidDate(pickupDate) &&
            isValidDate(returnDate) && (
              <p className="text-sm text-gray-600 mt-1">
                Total: ${totalPrice.toFixed(2)} ({numberOfDays}{' '}
                {numberOfDays === 1 ? 'day' : 'days'})
              </p>
            )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/car/${item.carId}`, {
                state: {
                  car: item,
                  searchParams: location.state?.searchParams || {},
                  type: 'cars',
                  fromSearch: true,
                },
              })
            }}
            className="btn-primary mt-4 flex items-center space-x-2"
          >
            <span>View Details</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const SearchResults = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { searchResults, searchType, loading } = useSelector((state) => state.search)
  const { items: cartItems } = useSelector((state) => state.cart)
  const [results, setResults] = useState([])
  const [imageLoadKey, setImageLoadKey] = useState(0)
  const [resultsReady, setResultsReady] = useState(false)
  const lastSearchKey = useRef(null)
  const isSearching = useRef(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    const performSearch = async () => {
      const { searchParams, type } = location.state || {}

      // If no location.state but we have results in Redux, use those
      if (!searchParams || !type) {
        const currentSearchType = searchType || 'hotels'
        const existingResults = searchResults[currentSearchType] || []
        if (existingResults.length > 0) {
          setResults(existingResults)
          setResultsReady(false)
          requestAnimationFrame(() => {
            setImageLoadKey(Date.now())
            setResultsReady(true)
          })
          dispatch(setLoading(false))
          return
        }
        navigate('/dashboard')
        return
      }

      const searchKey = JSON.stringify({ searchParams, type })

      if (lastSearchKey.current === searchKey) {
        if (isSearching.current) {
          return
        }
        if (results.length > 0) {
          dispatch(setLoading(false))
          return
        }
          const cachedResults = searchResults[type] || []
        if (cachedResults.length > 0) {
          setResults(cachedResults)
          setCurrentPage(1) // Reset to first page on new search
          setResultsReady(false)
          requestAnimationFrame(() => {
            setImageLoadKey(Date.now())
            setResultsReady(true)
          })
          dispatch(setLoading(false))
          return
        }
      }

      dispatch(setSearchType(type))

      lastSearchKey.current = searchKey
      isSearching.current = true
      dispatch(setLoading(true))

      try {
        let eventType = ''
        let eventData = {}

        if (type === 'flights') {
          eventType = 'search.flights'
          eventData = {
            departureAirport: searchParams.departureAirport,
            arrivalAirport: searchParams.arrivalAirport,
            departureDate: searchParams.departureDate,
            returnDate: searchParams.returnDate || null,
            tripType: searchParams.tripType || 'one-way',
            numberOfPassengers:
              searchParams.numberOfPassengers || searchParams.quantity || 1,
          }
        } else if (type === 'hotels') {
          eventType = 'search.hotels'
          eventData = {
            city: searchParams.city ? searchParams.city.trim() : '',
            state: searchParams.state ? searchParams.state.trim().toUpperCase() : '',
            checkInDate: searchParams.checkInDate,
            checkOutDate: searchParams.checkOutDate,
            numberOfRooms: searchParams.numberOfRooms || 1,
            numberOfAdults: searchParams.numberOfAdults || 2,
          }
        } else if (type === 'cars') {
          eventType = 'search.cars'
          eventData = {
            carType: searchParams.carType,
            pickupDate: searchParams.pickupDate,
            returnDate: searchParams.returnDate,
            location: searchParams.location,
          }
        }

        const response = await sendEventAndWait(
          'search-events',
          {
            eventType,
            ...eventData,
          },
          'search-events-response',
          30000,
        )

        let items = []
        if (type === 'flights') {
          if (response.data?.outbound || response.outbound) {
            items = {
              outbound: response.data?.outbound || response.outbound || [],
              return: response.data?.return || response.return || [],
              tripType: response.data?.tripType || response.tripType || 'one-way',
            }
          } else if (response.data) {
            items = {
              outbound: response.data.outbound || [],
              return: response.data.return || [],
              tripType: response.data.tripType || 'one-way',
            }
          } else {
            const flights = response.data?.flights || response.flights || []
            if (response.data?.returnFlights || response.returnFlights) {
              items = {
                outbound: flights,
                return:
                  response.data?.returnFlights || response.returnFlights || [],
                tripType: response.data?.tripType || response.tripType || 'one-way',
              }
            } else {
              items = flights
            }
          }
        } else if (response.hotels) {
          items = response.hotels
        } else if (response.data?.hotels) {
          items = response.data.hotels
        } else {
          const resultKey = type === 'hotels' ? 'hotels' : 'cars'
          items = response[resultKey] || []
        }

        console.log(`Search results for ${type}:`, items)
        dispatch(setSearchResults({ type, results: items }))
        
        // Set results first
        setResults(items)
        setResultsReady(false) // Reset ready state
        
        // Use requestAnimationFrame to ensure state is updated before setting imageLoadKey
        requestAnimationFrame(() => {
          setImageLoadKey(Date.now()) // Force image re-render
          setResultsReady(true) // Mark results as ready
        })
        
        isSearching.current = false
        dispatch(setLoading(false))
      } catch (err) {
        dispatch(setError(err.message))
        console.error('Search error:', err)
        isSearching.current = false
        dispatch(setLoading(false))
        lastSearchKey.current = null
      }
    }

    performSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const handleAddToCart = (item) => {
    const listingId =
      item[`${searchType.slice(0, -1)}Id`] ||
      item.flightId ||
      item.hotelId ||
      item.carId
    const listingType =
      searchType === 'flights'
        ? 'Flight'
        : searchType === 'hotels'
        ? 'Hotel'
        : 'Car'

    let numberOfDays = 1
    if (searchType === 'cars') {
      const pickupDate = location.state?.searchParams?.pickupDate
      const returnDate = location.state?.searchParams?.returnDate
      if (pickupDate && returnDate) {
        numberOfDays =
          differenceInDays(new Date(returnDate), new Date(pickupDate)) || 1
      }
    }

    const cartItem = {
      listingId,
      listingType,
      listing: item,
      quantity: 1,
      ...(searchType === 'flights' && {
        travelDate: location.state?.searchParams?.departureDate,
      }),
      ...(searchType === 'hotels' && {
        checkInDate: location.state?.searchParams?.checkInDate,
        checkOutDate: location.state?.searchParams?.checkOutDate,
      }),
      ...(searchType === 'cars' && {
        pickupDate: location.state?.searchParams?.pickupDate,
        returnDate: location.state?.searchParams?.returnDate,
        numberOfDays,
        quantity: 1,
      }),
    }

    dispatch(addToCart(cartItem))
  }

  const getCartItemForCar = (item) => {
    const listingId =
      item[`${searchType.slice(0, -1)}Id`] ||
      item.flightId ||
      item.hotelId ||
      item.carId
    const listingType =
      searchType === 'flights'
        ? 'Flight'
        : searchType === 'hotels'
        ? 'Hotel'
        : 'Car'

    if (searchType === 'cars') {
      const pickupDate = location.state?.searchParams?.pickupDate
      const returnDate = location.state?.searchParams?.returnDate

      if (!pickupDate || !returnDate) return null

      const searchPickup = new Date(pickupDate)
      const searchReturn = new Date(returnDate)

      const overlappingItem = cartItems.find((cartItem) => {
        if (cartItem.listingId !== listingId || cartItem.listingType !== listingType) {
          return false
        }

        if (!cartItem.pickupDate || !cartItem.returnDate) {
          return false
        }

        const cartPickup = new Date(cartItem.pickupDate)
        const cartReturn = new Date(cartItem.returnDate)

        return searchPickup <= cartReturn && cartPickup <= searchReturn
      })

      return overlappingItem || null
    } else {
      const found = cartItems.find(
        (cartItem) =>
          cartItem.listingId === listingId && cartItem.listingType === listingType,
      )
      return found || null
    }
  }

  const isItemInCart = (item) => {
    return getCartItemForCar(item) !== null
  }

  // Pagination logic
  const getPaginatedResults = useMemo(() => {
    if (searchType === 'flights' && results && typeof results === 'object' && results.outbound) {
      // For flights with outbound/return structure
      if (results.tripType === 'round-trip') {
        // Round trip: paginate both outbound and return separately
        const outboundStart = (currentPage - 1) * itemsPerPage
        const outboundEnd = outboundStart + itemsPerPage
        const paginatedOutbound = results.outbound.slice(outboundStart, outboundEnd)
        const returnStart = (currentPage - 1) * itemsPerPage
        const returnEnd = returnStart + itemsPerPage
        const paginatedReturn = results.return ? results.return.slice(returnStart, returnEnd) : []
        
        return {
          outbound: paginatedOutbound,
          return: paginatedReturn,
          tripType: 'round-trip',
          totalPages: Math.ceil(Math.max(results.outbound.length, results.return?.length || 0) / itemsPerPage),
          totalItems: Math.max(results.outbound.length, results.return?.length || 0)
        }
      } else {
        // One-way: paginate outbound
        const start = (currentPage - 1) * itemsPerPage
        const end = start + itemsPerPage
        const paginatedOutbound = results.outbound.slice(start, end)
        
        return {
          outbound: paginatedOutbound,
          return: null,
          tripType: 'one-way',
          totalPages: Math.ceil(results.outbound.length / itemsPerPage),
          totalItems: results.outbound.length
        }
      }
    } else if (Array.isArray(results)) {
      // For hotels, cars, or simple flight arrays
      const start = (currentPage - 1) * itemsPerPage
      const end = start + itemsPerPage
      const paginatedResults = results.slice(start, end)
      
      return {
        items: paginatedResults,
        totalPages: Math.ceil(results.length / itemsPerPage),
        totalItems: results.length
      }
    }
    
    return null
  }, [results, searchType, currentPage, itemsPerPage])

  // Reset to page 1 when results change
  useEffect(() => {
    setCurrentPage(1)
  }, [results])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Searching...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-primary-600 hover:text-primary-700 mb-4"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold text-gray-900">
            Search Results for {searchType}
          </h2>
          <p className="text-gray-600 mt-2">
            {searchType === 'flights' && results.outbound
              ? `${results.outbound.length} outbound flight${
                  results.outbound.length !== 1 ? 's' : ''
                } found${
                  results.return
                    ? `, ${results.return.length} return flight${
                        results.return.length !== 1 ? 's' : ''
                      }`
                    : ''
                }`
              : Array.isArray(results)
              ? `${results.length} result${results.length !== 1 ? 's' : ''} found`
              : '0 results found'}
          </p>
        </div>

        <div className="space-y-4">
          {getPaginatedResults && searchType === 'flights' && getPaginatedResults.outbound ? (
            getPaginatedResults.tripType === 'round-trip' ? (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    Round Trip Flights
                  </h3>
                  <p className="text-gray-600">
                    {results.outbound.length} outbound, {results.return?.length || 0}{' '}
                    return flights found
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">
                      Outbound - Departure
                    </h4>
                    {getPaginatedResults.outbound.length > 0 ? (
                      getPaginatedResults.outbound.map((item) => (
                        <FlightCard
                          key={item.flightId}
                          item={item}
                          searchParams={location.state?.searchParams}
                          searchType={searchType}
                          onViewDetails={(flight) =>
                            navigate(`/flight/${flight.flightId}`, {
                              state: {
                                flight,
                                searchParams: {
                                  ...location.state?.searchParams,
                                  flightType: 'outbound',
                                },
                                returnFlights: results.return,
                              },
                            })
                          }
                        />
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No outbound flights found.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">
                      Return
                    </h4>
                    {getPaginatedResults.return && getPaginatedResults.return.length > 0 ? (
                      getPaginatedResults.return.map((item) => (
                        <FlightCard
                          key={item.flightId}
                          item={item}
                          searchParams={location.state?.searchParams}
                          searchType={searchType}
                          onViewDetails={(flight) =>
                            navigate(`/flight/${flight.flightId}`, {
                              state: {
                                flight,
                                searchParams: {
                                  ...location.state?.searchParams,
                                  flightType: 'return',
                                },
                                outboundFlights: results.outbound,
                              },
                            })
                          }
                        />
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No return flights found. Try adjusting your search.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {getPaginatedResults.outbound.length > 0 ? (
                  getPaginatedResults.outbound.map((item) => (
                    <FlightCard
                      key={item.flightId}
                      item={item}
                      searchParams={location.state?.searchParams}
                      searchType={searchType}
                      onViewDetails={(flight) =>
                        navigate(`/flight/${flight.flightId}`, {
                          state: {
                            flight,
                            searchParams: location.state?.searchParams,
                          },
                        })
                      }
                    />
                  ))
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600 text-lg">
                      No flights found. Try adjusting your search criteria.
                    </p>
                  </div>
                )}
              </div>
            )
          ) : getPaginatedResults && getPaginatedResults.items ? (
            getPaginatedResults.items.map((item) => {
              const key =
                item[`${searchType.slice(0, -1)}Id`] ||
                item.flightId ||
                item.hotelId ||
                item.carId
              if (searchType === 'hotels') {
                return (
                  <HotelCard
                    key={key}
                    item={item}
                    location={location}
                    navigate={navigate}
                  />
                )
              }
              if (searchType === 'cars') {
                return (
                  <CarCard
                    key={key}
                    item={item}
                    location={location}
                    navigate={navigate}
                  />
                )
              }
              if (searchType === 'flights') {
                return (
                  <FlightCard
                    key={key}
                    item={item}
                    searchParams={location.state?.searchParams}
                    searchType={searchType}
                    onViewDetails={(flight) =>
                      navigate(`/flight/${flight.flightId}`, {
                        state: {
                          flight,
                          searchParams: location.state?.searchParams,
                        },
                      })
                    }
                  />
                )
              }
              return null
            })
          ) : null}
        </div>

        {/* Pagination */}
        {getPaginatedResults && getPaginatedResults.totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={getPaginatedResults.totalPages}
            totalItems={getPaginatedResults.totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}

        {((searchType === 'flights' &&
          results.outbound &&
          results.outbound.length === 0) ||
          (Array.isArray(results) && results.length === 0) ||
          (!results ||
            (typeof results === 'object' &&
              !results.outbound &&
              !Array.isArray(results)))) &&
          !loading && (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                No results found. Try adjusting your search criteria.
              </p>
            </div>
          )}
      </div>
    </div>
  )
}

export default SearchResults