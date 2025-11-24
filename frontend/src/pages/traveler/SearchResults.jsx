import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setSearchResults, setLoading, setError } from '../../store/slices/searchSlice'
import { addToCart } from '../../store/slices/cartSlice'
import { sendEventAndWait } from '../../services/kafkaService'
import { ShoppingCart, Star, MapPin, Calendar, Users } from 'lucide-react'
import { format } from 'date-fns'

const SearchResults = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { searchResults, searchType, loading } = useSelector((state) => state.search)
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
          }
        } else if (type === 'cars') {
          eventType = 'search.cars'
          eventData = {
            carType: searchParams.carType,
            pickupDate: searchParams.pickupDate,
            returnDate: searchParams.returnDate,
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
    const cartItem = {
      listingId: item[`${searchType.slice(0, -1)}Id`] || item.flightId || item.hotelId || item.carId,
      listingType: searchType === 'flights' ? 'Flight' : searchType === 'hotels' ? 'Hotel' : 'Car',
      listing: item,
      quantity: 1,
      ...(searchType === 'flights' && { travelDate: location.state?.searchParams?.departureDate }),
      ...(searchType === 'hotels' && {
        checkInDate: location.state?.searchParams?.checkInDate,
        checkOutDate: location.state?.searchParams?.checkOutDate,
      }),
      ...(searchType === 'cars' && {
        travelDate: location.state?.searchParams?.pickupDate,
        returnDate: location.state?.searchParams?.returnDate,
      }),
    }

    dispatch(addToCart(cartItem))
    alert('Added to cart!')
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
                        <p>{format(new Date(item.departureDateTime), 'MMM dd, hh:mm a')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs">{item.duration} min</p>
                      </div>
                      <div>
                        <p className="font-medium">{item.arrivalAirport}</p>
                        <p>{format(new Date(item.arrivalDateTime), 'MMM dd, hh:mm a')}</p>
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

              {searchType === 'hotels' && (
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <h3 className="text-xl font-semibold">{item.hotelName}</h3>
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="ml-1">{item.hotelRating || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="flex items-center text-gray-600 mb-2">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>{item.address}, {item.city}, {item.state}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{item.amenities?.join(', ')}</p>
                    <p className="text-sm text-gray-500">{item.availableRooms} rooms available</p>
                  </div>
                  <div className="ml-6 text-right">
                    <p className="text-2xl font-bold text-primary-600">${item.pricePerNight}</p>
                    <p className="text-sm text-gray-500">per night</p>
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

              {searchType === 'cars' && (
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <h3 className="text-xl font-semibold">{item.carModel}</h3>
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="ml-1">{item.carRating || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <p>{item.carType} • {item.transmissionType} • {item.seats} seats</p>
                      <p>{item.location}</p>
                    </div>
                    <p className="text-sm text-gray-500">{item.availableCars} cars available</p>
                  </div>
                  <div className="ml-6 text-right">
                    <p className="text-2xl font-bold text-primary-600">${item.dailyRentalPrice}</p>
                    <p className="text-sm text-gray-500">per day</p>
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

