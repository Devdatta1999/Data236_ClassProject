import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { addToCart } from '../../store/slices/cartSlice'
import api from '../../services/apiService'
import { 
  Star, MapPin, Calendar, Users, ShoppingCart, ArrowLeft, 
  Plane, Clock, CheckCircle, XCircle
} from 'lucide-react'
import { format } from 'date-fns'
import Notification from '../../components/common/Notification'

const FlightDetailPage = () => {
  const { flightId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const [flight, setFlight] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notification, setNotification] = useState(null)
  const [selectedSeatTypes, setSelectedSeatTypes] = useState({}) // { seatType: quantity }
  const [travelDate, setTravelDate] = useState('')
  const [numberOfPassengers, setNumberOfPassengers] = useState(1)

  useEffect(() => {
    const fetchFlight = async () => {
      try {
        // If flight data is passed from search results, use it
        if (location.state?.flight) {
          setFlight(location.state.flight)
          setTravelDate(location.state.searchParams?.departureDate || '')
          setNumberOfPassengers(location.state.searchParams?.numberOfPassengers || location.state.searchParams?.quantity || 1)
          setLoading(false)
          return
        }

        // Otherwise fetch from API
        const response = await api.get(`/api/listings/flights/${flightId}`)
        setFlight(response.data.data?.flight)
        setTravelDate(location.state?.searchParams?.departureDate || '')
        setNumberOfPassengers(location.state?.searchParams?.numberOfPassengers || location.state?.searchParams?.quantity || 1)
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load flight details')
        console.error('Error fetching flight:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFlight()
  }, [flightId, location.state])

  const handleSeatTypeChange = (seatType, quantity) => {
    setSelectedSeatTypes(prev => ({
      ...prev,
      [seatType]: quantity > 0 ? quantity : undefined
    }))
  }

  const handleAddToCart = () => {
    if (!travelDate) {
      setNotification({ type: 'error', message: 'Please select a travel date' })
      return
    }

    const selectedSeats = Object.entries(selectedSeatTypes)
      .filter(([_, qty]) => qty > 0)
      .map(([seatType, quantity]) => ({ seatType, quantity }))

    if (selectedSeats.length === 0) {
      setNotification({ type: 'error', message: 'Please select at least one seat type' })
      return
    }

    let addedCount = 0

    // Add each selected seat type as a separate cart item (like hotel room types)
    selectedSeats.forEach((seat) => {
      const seatTypeData = flight.seatTypes?.find(st => st.type === seat.seatType)
      
      if (!seatTypeData) {
        console.error(`Seat type ${seat.seatType} not found`)
        return
      }

      const totalPrice = seatTypeData.ticketPrice * seat.quantity

      const cartItem = {
        listingId: flight.flightId,
        listingType: 'Flight',
        listingName: `${flight.flightId} - ${flight.departureAirport} to ${flight.arrivalAirport}`,
        listing: flight,
        roomType: seat.seatType, // Using roomType field for seatType (for consistency with backend)
        quantity: seat.quantity,
        price: seatTypeData.ticketPrice,
        totalPrice,
        travelDate,
        numberOfPassengers: seat.quantity,
        image: null,
        address: `${flight.departureAirport} → ${flight.arrivalAirport}`,
      }

      dispatch(addToCart(cartItem))
      addedCount++
    })

    if (addedCount > 0) {
      setNotification({ 
        type: 'success', 
        message: `Added ${addedCount} seat type${addedCount > 1 ? 's' : ''} to cart!` 
      })
    }
  }

  const formatTime = (dateTime) => {
    if (!dateTime) return 'N/A'
    return format(new Date(dateTime), 'hh:mm a')
  }
  
  const formatDate = (dateTime) => {
    if (!dateTime) return 'N/A'
    return format(new Date(dateTime), 'EEEE, MMMM dd, yyyy')
  }
  
  const formatDuration = (duration) => {
    if (!duration) return 'N/A'
    const hours = Math.floor(duration / 60)
    const minutes = duration % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading flight details...</p>
        </div>
      </div>
    )
  }

  if (error || !flight) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error || 'Flight not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const seatTypes = flight.seatTypes || []

  return (
    <div className="min-h-screen bg-gray-50">
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => {
              if (location.state?.searchParams) {
                navigate('/search', { 
                  state: { 
                    searchParams: location.state.searchParams,
                    type: 'flights'
                  } 
                })
              } else {
                navigate(-1)
              }
            }}
            className="text-primary-600 hover:text-primary-700 mb-4 flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Search</span>
          </button>
          <h1 className="text-3xl font-bold">{flight.flightId}</h1>
          <div className="flex items-center space-x-4 mt-2">
            {flight.providerName && (
              <span className="text-gray-600">{flight.providerName}</span>
            )}
            {(() => {
              // Calculate average rating from reviews array
              const avgRating = flight.reviews && flight.reviews.length > 0
                ? (flight.reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / flight.reviews.length).toFixed(1)
                : flight.flightRating?.toFixed(1) || 0
              
              return avgRating > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${i < Math.round(parseFloat(avgRating)) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    <span>{avgRating} {avgRating >= 4 ? 'Excellent' : avgRating >= 3 ? 'Good' : 'Average'}</span>
                    {flight.reviews && flight.reviews.length > 0 && (
                      <span className="ml-2">({flight.reviews.length} review{flight.reviews.length > 1 ? 's' : ''})</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
          {/* Latest Review */}
          {flight.reviews && flight.reviews.length > 0 && (() => {
            // Sort reviews by date (newest first) and get the latest
            const sortedReviews = [...flight.reviews].sort((a, b) => new Date(b.date) - new Date(a.date))
            const latestReview = sortedReviews[0]
            
            return latestReview && latestReview.comment && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="flex items-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < latestReview.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">
                    {latestReview.comment}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Flight Route */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-gray-900">{flight.departureAirport}</p>
                  <p className="text-lg text-gray-600 mt-1">{formatTime(flight.departureDateTime)}</p>
                  <p className="text-sm text-gray-500 mt-1">{formatDate(flight.departureDateTime)}</p>
                  <div className="mt-2">
                    <MapPin className="w-4 h-4 text-gray-400 inline mr-1" />
                    <span className="text-xs text-gray-500">Departure</span>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Plane className="w-8 h-8 text-primary-600 mx-auto mb-2 transform rotate-90" />
                    <p className="text-sm text-gray-600">{formatDuration(flight.duration)}</p>
                    <div className="flex items-center mt-2">
                      <div className="flex-1 h-px bg-gray-300"></div>
                    </div>
                  </div>
                </div>
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-gray-900">{flight.arrivalAirport}</p>
                  <p className="text-lg text-gray-600 mt-1">{formatTime(flight.arrivalDateTime)}</p>
                  <p className="text-sm text-gray-500 mt-1">{formatDate(flight.arrivalDateTime)}</p>
                  <div className="mt-2">
                    <MapPin className="w-4 h-4 text-gray-400 inline mr-1" />
                    <span className="text-xs text-gray-500">Arrival</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seat Types */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Select Your Seats</h2>
              <div className="space-y-4">
                {seatTypes.map((seatType) => {
                  const selectedQty = selectedSeatTypes[seatType.type] || 0

                  return (
                    <div key={seatType.type} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-semibold">{seatType.type} Class</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary-600">
                            ${seatType.ticketPrice.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">per person</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => handleSeatTypeChange(seatType.type, Math.max(0, selectedQty - 1))}
                            disabled={selectedQty <= 0}
                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span>-</span>
                          </button>
                          <span className="w-8 text-center font-medium">{selectedQty}</span>
                          <button
                            onClick={() => handleSeatTypeChange(seatType.type, selectedQty + 1)}
                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400"
                          >
                            <span>+</span>
                          </button>
                          <span className="text-sm text-gray-600 ml-2">seat(s)</span>
                        </div>
                        {selectedQty > 0 && (
                          <div className="text-right">
                            <p className="text-lg font-semibold">
                              ${(seatType.ticketPrice * selectedQty).toFixed(2)} total
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Booking Widget */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 bg-white border border-gray-200 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">Reserve</h3>
              
              {/* Date Selection */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Travel Date
                  </label>
                  <input
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="input-field w-full"
                    min={flight.availableFrom ? new Date(flight.availableFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                    max={flight.availableTo ? new Date(flight.availableTo).toISOString().split('T')[0] : undefined}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 inline mr-2" />
                    Passengers
                  </label>
                  <input
                    type="number"
                    value={numberOfPassengers}
                    onChange={(e) => setNumberOfPassengers(parseInt(e.target.value) || 1)}
                    className="input-field w-full"
                    min="1"
                    required
                  />
                </div>
              </div>

              {/* Price Summary */}
              {Object.keys(selectedSeatTypes).some(st => selectedSeatTypes[st] > 0) && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <div className="space-y-2">
                    {Object.entries(selectedSeatTypes)
                      .filter(([_, qty]) => qty > 0)
                      .map(([seatType, quantity]) => {
                        const seatData = seatTypes.find(st => st.type === seatType)
                        if (!seatData) return null
                        const seatTotal = seatData.ticketPrice * quantity
                        return (
                          <div key={seatType} className="flex justify-between text-sm">
                            <span>{quantity}x {seatType}</span>
                            <span>${seatTotal.toFixed(2)}</span>
                          </div>
                        )
                      })}
                  </div>
                  <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary-600">
                      $
                      {Object.entries(selectedSeatTypes)
                        .filter(([_, qty]) => qty > 0)
                        .reduce((sum, [seatType, quantity]) => {
                          const seatData = seatTypes.find(st => st.type === seatType)
                          return sum + (seatData ? seatData.ticketPrice * quantity : 0)
                        }, 0)
                        .toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleAddToCart}
                disabled={!travelDate || Object.keys(selectedSeatTypes).every(st => !selectedSeatTypes[st] || selectedSeatTypes[st] === 0)}
                className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-5 h-5" />
                <span>Add to Cart</span>
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                You won't be charged until checkout
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FlightDetailPage

