import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { addToCart } from '../../store/slices/cartSlice'
import api from '../../services/apiService'
import { 
  Star, MapPin, Calendar, ShoppingCart, ArrowLeft, 
  Car as CarIcon, CheckCircle, XCircle
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import Notification from '../../components/common/Notification'

const CarDetailPage = () => {
  const { carId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notification, setNotification] = useState(null)
  const [pickupDate, setPickupDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [quantity, setQuantity] = useState(1) // For cars, quantity is always 1

  useEffect(() => {
    const fetchCar = async () => {
      try {
        // If car data is passed from search results, use it
        if (location.state?.car) {
          setCar(location.state.car)
          setPickupDate(location.state.searchParams?.pickupDate || '')
          setReturnDate(location.state.searchParams?.returnDate || '')
          setLoading(false)
          return
        }

        // Otherwise fetch from API
        const response = await api.get(`/api/listings/cars/${carId}`)
        setCar(response.data.data?.car)
        setPickupDate(location.state?.searchParams?.pickupDate || '')
        setReturnDate(location.state?.searchParams?.returnDate || '')
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load car details')
        console.error('Error fetching car:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCar()
  }, [carId, location.state])

  const handleAddToCart = () => {
    if (!pickupDate || !returnDate) {
      setNotification({ type: 'error', message: 'Please select pickup and return dates' })
      return
    }

    const pickup = new Date(pickupDate)
    const returnDateObj = new Date(returnDate)
    
    if (returnDateObj <= pickup) {
      setNotification({ type: 'error', message: 'Return date must be after pickup date' })
      return
    }

    const numberOfDays = differenceInDays(returnDateObj, pickup) || 1
    const totalPrice = (car.dailyRentalPrice || 0) * numberOfDays

    const cartItem = {
      listingId: car.carId,
      listingType: 'Car',
      listingName: car.model || car.carModel,
      listing: car,
      quantity: 1, // Cars are always quantity 1
      pickupDate,
      returnDate,
      numberOfDays,
      dailyRentalPrice: car.dailyRentalPrice,
      totalPrice,
      image: car.image || (car.images && car.images.length > 0 ? car.images[0] : null),
      address: `${car.neighbourhood || ''}${car.neighbourhood ? ', ' : ''}${car.city}${car.state ? `, ${car.state}` : ''}${car.country ? `, ${car.country}` : ''}`,
    }

    dispatch(addToCart(cartItem))
    setNotification({ 
      type: 'success', 
      message: 'Car added to cart!' 
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading car details...</p>
        </div>
      </div>
    )
  }

  if (error || !car) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error || 'Car not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const numberOfDays = pickupDate && returnDate 
    ? differenceInDays(new Date(returnDate), new Date(pickupDate)) || 1
    : 1
  const totalPrice = (car.dailyRentalPrice || 0) * numberOfDays

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
              // Navigate back to search results, preserving search params
              if (location.state?.searchParams) {
                navigate('/search', { 
                  state: { 
                    searchParams: location.state.searchParams,
                    type: 'cars'
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
          <div className="flex items-center space-x-4">
            {car.image && (
              <img
                src={`${import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'}${car.image}`}
                alt={car.providerName || car.model || car.carModel}
                className="w-24 h-24 rounded-lg object-cover border border-gray-200"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            )}
            <div>
              <h1 className="text-3xl font-bold">{car.model || car.carModel}</h1>
              {car.providerName && (
                <span className="text-gray-600 text-sm">{car.providerName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4 mt-2">
            {(() => {
              // Calculate average rating from reviews array
              const avgRating = car.reviews && car.reviews.length > 0
                ? (car.reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / car.reviews.length).toFixed(1)
                : car.carRating?.toFixed(1) || 0
              
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
                    {car.reviews && car.reviews.length > 0 && (
                      <span className="ml-2">({car.reviews.length} review{car.reviews.length > 1 ? 's' : ''})</span>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="flex items-center text-gray-600">
              <MapPin className="w-4 h-4 mr-1" />
              <span>
                {car.neighbourhood && `${car.neighbourhood}, `}
                {car.city}
                {car.state && `, ${car.state}`}
                {car.country && `, ${car.country}`}
              </span>
            </div>
          </div>
          {/* Latest Review */}
          {car.reviews && car.reviews.length > 0 && (() => {
            // Sort reviews by date (newest first) and get the latest
            const sortedReviews = [...car.reviews].sort((a, b) => new Date(b.date) - new Date(a.date))
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
            {/* Car Image */}
            {car.images && car.images.length > 0 ? (
              <div className="relative h-96 rounded-lg overflow-hidden bg-gray-200">
                <img
                  src={car.images[0].startsWith('http') 
                    ? car.images[0] 
                    : `${import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'}/api/listings/images/${encodeURIComponent(car.images[0].split('/').pop())}`}
                  alt={car.model || car.carModel}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    const placeholder = e.target.parentElement?.querySelector('.image-placeholder')
                    if (placeholder) placeholder.classList.remove('hidden')
                  }}
                />
                <div className="image-placeholder hidden absolute inset-0 flex items-center justify-center bg-gray-200">
                  <CarIcon className="w-16 h-16 text-gray-400" />
                </div>
              </div>
            ) : (
              <div className="h-96 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                <CarIcon className="w-16 h-16 text-gray-400" />
              </div>
            )}

            {/* Car Details */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Car Details</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Type</h3>
                  <p className="text-gray-600">{car.carType || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Transmission</h3>
                  <p className="text-gray-600">{car.transmissionType || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Seats</h3>
                  <p className="text-gray-600">{car.numberOfSeats || car.seats || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Availability Period</h3>
                  <p className="text-gray-600">
                    {car.availableFrom && car.availableTo
                      ? `${format(new Date(car.availableFrom), 'MMM dd, yyyy')} - ${format(new Date(car.availableTo), 'MMM dd, yyyy')}`
                      : 'N/A'}
                  </p>
                </div>
                {car.providerName && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Provider</h3>
                    <p className="text-gray-600">{car.providerName}</p>
                  </div>
                )}
                {car.fuelType && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Fuel Type</h3>
                    <p className="text-gray-600">{car.fuelType}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {car.description && (
              <div>
                <h2 className="text-2xl font-bold mb-4">Description</h2>
                <p className="text-gray-600 whitespace-pre-line">{car.description}</p>
              </div>
            )}
          </div>

          {/* Booking Widget */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 bg-white border border-gray-200 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">Reserve</h3>
              
              {/* Price Display */}
              <div className="mb-6">
                <p className="text-3xl font-bold text-primary-600">
                  ${car.dailyRentalPrice?.toFixed(2) || '0.00'}
                </p>
                <p className="text-sm text-gray-500">per day</p>
              </div>

              {/* Date Selection */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Pickup Date
                  </label>
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="input-field w-full"
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Return Date
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="input-field w-full"
                    min={pickupDate || new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
              </div>

              {/* Price Summary */}
              {pickupDate && returnDate && numberOfDays > 0 && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{numberOfDays} {numberOfDays === 1 ? 'day' : 'days'}</span>
                      <span>${(car.dailyRentalPrice || 0).toFixed(2)}/day</span>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary-600">
                      ${totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleAddToCart}
                disabled={!pickupDate || !returnDate || numberOfDays <= 0}
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

export default CarDetailPage

