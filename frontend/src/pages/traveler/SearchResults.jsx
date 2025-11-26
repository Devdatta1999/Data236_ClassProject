import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setSearchResults, setLoading, setError } from '../../store/slices/searchSlice'
import { addToCart } from '../../store/slices/cartSlice'
import { sendEventAndWait } from '../../services/kafkaService'
import { ShoppingCart, Star, MapPin, Calendar, Users, Check } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

const SearchResults = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { searchResults, searchType, loading } = useSelector((state) => state.search)
  const { items: cartItems } = useSelector((state) => state.cart)
  const [results, setResults] = useState([])

  useEffect(() => {
    const performSearch = async () => {
      const { searchParams, type } = location.state || {}
      if (!searchParams || !type) {
        navigate('/dashboard')
        return
      }

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
          }
        } else if (type === 'hotels') {
          eventType = 'search.hotels'
          eventData = {
            city: searchParams.city,
            state: searchParams.state,
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
          30000
        )

        const resultKey = type === 'flights' ? 'flights' : type === 'hotels' ? 'hotels' : 'cars'
        const items = response[resultKey] || []
        
        dispatch(setSearchResults({ type, results: items }))
        setResults(items)
      } catch (err) {
        dispatch(setError(err.message))
        console.error('Search error:', err)
      } finally {
        dispatch(setLoading(false))
      }
    }

    performSearch()
  }, [location.state, dispatch, navigate])

  const handleAddToCart = (item) => {
    const listingId = item[`${searchType.slice(0, -1)}Id`] || item.flightId || item.hotelId || item.carId
    const listingType = searchType === 'flights' ? 'Flight' : searchType === 'hotels' ? 'Hotel' : 'Car'
    
    // For cars, calculate number of days
    let numberOfDays = 1
    if (searchType === 'cars') {
      const pickupDate = location.state?.searchParams?.pickupDate
      const returnDate = location.state?.searchParams?.returnDate
      if (pickupDate && returnDate) {
        numberOfDays = differenceInDays(new Date(returnDate), new Date(pickupDate)) || 1
      }
    }

    const cartItem = {
      listingId,
      listingType,
      listing: item,
      quantity: 1, // For cars, quantity is always 1 (each car is a unique vehicle)
      ...(searchType === 'flights' && { travelDate: location.state?.searchParams?.departureDate }),
      ...(searchType === 'hotels' && {
        checkInDate: location.state?.searchParams?.checkInDate,
        checkOutDate: location.state?.searchParams?.checkOutDate,
      }),
      ...(searchType === 'cars' && {
        pickupDate: location.state?.searchParams?.pickupDate,
        returnDate: location.state?.searchParams?.returnDate,
        numberOfDays,
        quantity: 1, // Cars are always quantity 1 - each car is a unique vehicle booking
      }),
    }

    dispatch(addToCart(cartItem))
    // Success feedback is handled by the button state change
  }

  // Check if item is already in cart (for cars, check for date overlaps)
  const getCartItemForCar = (item) => {
    const listingId = item[`${searchType.slice(0, -1)}Id`] || item.flightId || item.hotelId || item.carId
    const listingType = searchType === 'flights' ? 'Flight' : searchType === 'hotels' ? 'Hotel' : 'Car'
    
    if (searchType === 'cars') {
      const pickupDate = location.state?.searchParams?.pickupDate
      const returnDate = location.state?.searchParams?.returnDate
      
      if (!pickupDate || !returnDate) return null
      
      const searchPickup = new Date(pickupDate)
      const searchReturn = new Date(returnDate)
      
      // Find cart items with same car that have overlapping dates
      const overlappingItem = cartItems.find((cartItem) => {
        if (cartItem.listingId !== listingId || cartItem.listingType !== listingType) {
          return false
        }
        
        if (!cartItem.pickupDate || !cartItem.returnDate) {
          return false
        }
        
        const cartPickup = new Date(cartItem.pickupDate)
        const cartReturn = new Date(cartItem.returnDate)
        
        // Check for date overlap: two date ranges overlap if one starts before the other ends
        return searchPickup <= cartReturn && cartPickup <= searchReturn
      })
      
      return overlappingItem || null
    } else {
      const found = cartItems.find(
        (cartItem) =>
          cartItem.listingId === listingId &&
          cartItem.listingType === listingType
      )
      return found || null
    }
  }
  
  const isItemInCart = (item) => {
    return getCartItemForCar(item) !== null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
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
          <p className="text-gray-600 mt-2">{results.length} results found</p>
        </div>

        <div className="space-y-4">
          {results.map((item) => (
            <div key={item[`${searchType.slice(0, -1)}Id`] || item.flightId || item.hotelId || item.carId} className="card">
              {searchType === 'flights' && (
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <h3 className="text-xl font-semibold">{item.flightId}</h3>
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="ml-1">{item.flightRating || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <p className="font-medium">{item.departureAirport}</p>
                        <p>{item.departureDateTime ? format(new Date(item.departureDateTime), 'MMM dd, hh:mm a') : 'N/A'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs">{item.duration} min</p>
                      </div>
                      <div>
                        <p className="font-medium">{item.arrivalAirport}</p>
                        <p>{item.arrivalDateTime ? format(new Date(item.arrivalDateTime), 'MMM dd, hh:mm a') : 'N/A'}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">{item.flightClass}</p>
                  </div>
                  <div className="ml-6 text-right">
                    <p className="text-2xl font-bold text-primary-600">${item.ticketPrice}</p>
                    <p className="text-sm text-gray-500">{item.availableSeats} seats left</p>
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="btn-primary mt-4 flex items-center space-x-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </button>
                  </div>
                </div>
              )}

              {searchType === 'hotels' && (() => {
                const checkInDate = location.state?.searchParams?.checkInDate
                const checkOutDate = location.state?.searchParams?.checkOutDate
                const nights = checkInDate && checkOutDate 
                  ? differenceInDays(new Date(checkOutDate), new Date(checkInDate)) || 1
                  : 1
                
                // Get minimum price from available room types
                const minPrice = item.roomAvailability && item.roomAvailability.length > 0
                  ? Math.min(...item.roomAvailability.filter(rt => rt.available > 0).map(rt => rt.pricePerNight))
                  : item.roomTypes && item.roomTypes.length > 0
                  ? Math.min(...item.roomTypes.map(rt => rt.pricePerNight))
                  : 0
                
                return (
                  <div 
                    className="flex justify-between items-start cursor-pointer hover:bg-gray-50 p-4 -m-4 rounded-lg transition-colors"
                    onClick={() => navigate(`/hotel/${item.hotelId}`, { 
                      state: { 
                        hotel: item,
                        searchParams: location.state?.searchParams 
                      } 
                    })}
                  >
                    {/* Hotel Image */}
                    {item.images && item.images.length > 0 && (
                      <div className="w-32 h-32 flex-shrink-0 mr-4 rounded-lg overflow-hidden">
                        <img
                          src={item.images[0]?.startsWith('http') ? item.images[0] : `${API_BASE_URL}${item.images[0]}`}
                          alt={item.hotelName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/200x200?text=Hotel'
                          }}
                        />
                      </div>
                    )}
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
                        <span>{item.address}, {item.city}, {item.state} {item.zipCode}</span>
                      </div>
                      {item.amenities && item.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {item.amenities.slice(0, 5).map((amenity, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              {amenity}
                            </span>
                          ))}
                          {item.amenities.length > 5 && (
                            <span className="text-xs text-gray-500">+{item.amenities.length - 5} more</span>
                          )}
                        </div>
                      )}
                      {item.roomAvailability && item.roomAvailability.length > 0 && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Available room types:</span>{' '}
                          {item.roomAvailability
                            .filter(rt => rt.available > 0)
                            .map(rt => rt.type)
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
                              searchParams: location.state?.searchParams 
                            } 
                          })
                        }}
                        className="btn-primary mt-4 flex items-center space-x-2"
                      >
                        <span>View Details</span>
                      </button>
                    </div>
                  </div>
                )
              })()}

              {searchType === 'cars' && (() => {
                const pickupDate = location.state?.searchParams?.pickupDate
                const returnDate = location.state?.searchParams?.returnDate
                
                // Validate dates before using them
                const isValidDate = (dateStr) => {
                  if (!dateStr) return false
                  const date = new Date(dateStr)
                  return date instanceof Date && !isNaN(date.getTime())
                }
                
                const numberOfDays = (pickupDate && returnDate && isValidDate(pickupDate) && isValidDate(returnDate))
                  ? (differenceInDays(new Date(returnDate), new Date(pickupDate)) || 1)
                  : 1
                const totalPrice = (item.dailyRentalPrice || 0) * numberOfDays
                const cartItem = getCartItemForCar(item)
                const inCart = cartItem !== null

                return (
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-2">
                        <h3 className="text-xl font-semibold">{item.model || item.carModel}</h3>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 fill-current" />
                          <span className="ml-1">{item.carRating || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        <p className="font-medium">{item.carType} • {item.transmissionType} • {item.numberOfSeats || item.seats} seats</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span>
                            {item.neighbourhood && `${item.neighbourhood}, `}
                            {item.city}
                            {item.state && `, ${item.state}`}
                            {item.country && `, ${item.country}`}
                          </span>
                        </div>
                        {pickupDate && returnDate && isValidDate(pickupDate) && isValidDate(returnDate) && (
                          <div className="flex items-center space-x-2 mt-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>
                              {format(new Date(pickupDate), 'MMM dd, yyyy')} - {format(new Date(returnDate), 'MMM dd, yyyy')} ({numberOfDays} {numberOfDays === 1 ? 'day' : 'days'})
                            </span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2 mt-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>
                            Available: {item.availableFrom && isValidDate(item.availableFrom) ? format(new Date(item.availableFrom), 'MMM dd, yyyy') : 'N/A'} - {item.availableTo && isValidDate(item.availableTo) ? format(new Date(item.availableTo), 'MMM dd, yyyy') : 'N/A'}
                          </span>
                        </div>
                        {item.providerName && (
                          <p className="text-sm text-gray-500 mt-1">Provider: {item.providerName}</p>
                        )}
                      </div>
                    </div>
                    <div className="ml-6 text-right">
                      <p className="text-2xl font-bold text-primary-600">${item.dailyRentalPrice}</p>
                      <p className="text-sm text-gray-500">per day</p>
                      {pickupDate && returnDate && isValidDate(pickupDate) && isValidDate(returnDate) && (
                        <p className="text-sm text-gray-600 mt-1">
                          Total: ${totalPrice.toFixed(2)} ({numberOfDays} {numberOfDays === 1 ? 'day' : 'days'})
                        </p>
                      )}
                      {inCart && cartItem?.pickupDate && cartItem?.returnDate ? (
                        <div className="mt-4">
                          <button
                            disabled
                            className="btn-secondary w-full flex items-center justify-center space-x-2 opacity-50 cursor-not-allowed"
                          >
                            <Check className="w-4 h-4" />
                            <span>Already in Cart</span>
                          </button>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            Added for: {isValidDate(cartItem.pickupDate) && isValidDate(cartItem.returnDate) 
                              ? `${format(new Date(cartItem.pickupDate), 'MMM dd, yyyy')} - ${format(new Date(cartItem.returnDate), 'MMM dd, yyyy')}`
                              : 'N/A'}
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="btn-primary mt-4 flex items-center space-x-2"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>Add to Cart</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>

        {results.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No results found. Try adjusting your search criteria.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchResults

