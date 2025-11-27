import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { addToCart } from '../../store/slices/cartSlice'
import api from '../../services/apiService'
import { 
  Star, MapPin, Calendar, Users, ShoppingCart, ArrowLeft, 
  Wifi, Car, Utensils, Dumbbell, Waves, Coffee, Building2,
  CheckCircle, XCircle, ChevronLeft, ChevronRight
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import Notification from '../../components/common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

const HotelDetailPage = () => {
  const { hotelId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const [hotel, setHotel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notification, setNotification] = useState(null)
  const [selectedRoomTypes, setSelectedRoomTypes] = useState({}) // { roomType: quantity }
  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  const [numberOfAdults, setNumberOfAdults] = useState(2)
  const [numberOfRooms, setNumberOfRooms] = useState(1)
  const [selectedImageIndex, setSelectedImageIndex] = useState(null)

  useEffect(() => {
    const fetchHotel = async () => {
      try {
        // If hotel data is passed from search results, use it
        if (location.state?.hotel) {
          console.log('Hotel from location.state:', location.state.hotel)
          console.log('Hotel images:', location.state.hotel.images)
          setHotel(location.state.hotel)
          setCheckInDate(location.state.searchParams?.checkInDate || '')
          setCheckOutDate(location.state.searchParams?.checkOutDate || '')
          setNumberOfAdults(location.state.searchParams?.numberOfAdults || 2)
          setNumberOfRooms(location.state.searchParams?.numberOfRooms || 1)
          setLoading(false)
          return
        }

        // Otherwise fetch from API
        const response = await api.get(`/api/listings/hotels/${hotelId}`)
        setHotel(response.data.data?.hotel)
        setCheckInDate(location.state?.searchParams?.checkInDate || '')
        setCheckOutDate(location.state?.searchParams?.checkOutDate || '')
        setNumberOfAdults(location.state?.searchParams?.numberOfAdults || 2)
        setNumberOfRooms(location.state?.searchParams?.numberOfRooms || 1)
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load hotel details')
        console.error('Error fetching hotel:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchHotel()
  }, [hotelId, location.state])

  // Calculate availability for each room type
  useEffect(() => {
    if (hotel && checkInDate && checkOutDate) {
      // Recalculate availability based on selected dates
      // This would ideally be done via API, but for now we use the data from search
      // In a real implementation, you'd call an API endpoint to get real-time availability
    }
  }, [hotel, checkInDate, checkOutDate])

  const handleRoomTypeChange = (roomType, quantity) => {
    setSelectedRoomTypes(prev => ({
      ...prev,
      [roomType]: quantity > 0 ? quantity : undefined
    }))
  }

  const handleAddToCart = () => {
    if (!checkInDate || !checkOutDate) {
      setNotification({ type: 'error', message: 'Please select check-in and check-out dates' })
      return
    }

    const selectedRooms = Object.entries(selectedRoomTypes)
      .filter(([_, qty]) => qty > 0)
      .map(([roomType, quantity]) => ({ roomType, quantity }))

    if (selectedRooms.length === 0) {
      setNotification({ type: 'error', message: 'Please select at least one room type' })
      return
    }

    const nights = differenceInDays(new Date(checkOutDate), new Date(checkInDate)) || 1
    let addedCount = 0

    // Add each selected room type as a separate cart item
    selectedRooms.forEach((room) => {
      const roomTypeData = hotel.roomAvailability?.find(rt => rt.type === room.roomType) 
        || hotel.roomTypes?.find(rt => rt.type === room.roomType)
      
      if (!roomTypeData) {
        console.error(`Room type ${room.roomType} not found`)
        return
      }

      const totalPrice = roomTypeData.pricePerNight * nights * room.quantity

      const cartItem = {
        listingId: hotel.hotelId,
        listingType: 'Hotel',
        listingName: hotel.hotelName,
        listing: hotel, // Include full hotel object for checkout
        roomType: room.roomType,
        quantity: room.quantity,
        pricePerNight: roomTypeData.pricePerNight,
        totalPrice,
        checkInDate,
        checkOutDate,
        numberOfNights: nights,
        image: hotel.images && hotel.images.length > 0 ? hotel.images[0] : null,
        address: `${hotel.address}, ${hotel.city}, ${hotel.state}`,
      }

      dispatch(addToCart(cartItem))
      addedCount++
    })

    if (addedCount > 0) {
      setNotification({ 
        type: 'success', 
        message: `Added ${addedCount} room type${addedCount > 1 ? 's' : ''} to cart!` 
      })
    }
  }

  const getAmenityIcon = (amenity) => {
    const iconMap = {
      'WiFi': Wifi,
      'Parking': Car,
      'Restaurant': Utensils,
      'Gym': Dumbbell,
      'Pool': Waves,
      'Breakfast Included': Coffee,
      'Business Center': Building2,
    }
    return iconMap[amenity] || CheckCircle
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading hotel details...</p>
        </div>
      </div>
    )
  }

  if (error || !hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error || 'Hotel not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const nights = checkInDate && checkOutDate 
    ? differenceInDays(new Date(checkOutDate), new Date(checkInDate)) || 1
    : 1

  const roomAvailability = hotel.roomAvailability || hotel.roomTypes || []

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
                    type: 'hotels'
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
          <h1 className="text-3xl font-bold">{hotel.hotelName}</h1>
          <div className="flex items-center space-x-4 mt-2">
            {(() => {
              // Calculate average rating from reviews array only (not starRating from host/admin)
              const avgRating = hotel.reviews && hotel.reviews.length > 0
                ? (hotel.reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / hotel.reviews.length).toFixed(1)
                : hotel.hotelRating?.toFixed(1) || 0
              
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
                    {hotel.reviews && hotel.reviews.length > 0 && (
                      <span className="ml-2">({hotel.reviews.length} review{hotel.reviews.length > 1 ? 's' : ''})</span>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="flex items-center text-gray-600">
              <MapPin className="w-4 h-4 mr-1" />
              <span>{hotel.address}, {hotel.city}, {hotel.state} {hotel.zipCode}</span>
            </div>
          </div>
          {/* Latest Review */}
          {hotel.reviews && hotel.reviews.length > 0 && (() => {
            // Sort reviews by date (newest first) and get the latest
            const sortedReviews = [...hotel.reviews].sort((a, b) => new Date(b.date) - new Date(a.date))
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
            {/* Image Gallery - Airbnb Style */}
            {hotel.images && hotel.images.length > 0 ? (
              <div className="relative">
                <div className="grid grid-cols-2 gap-2 h-96 rounded-lg overflow-hidden">
                  {/* Main large image */}
                  <div className="col-span-2 relative group cursor-pointer bg-gray-200" onClick={() => setSelectedImageIndex(0)}>
                    <img
                      src={(() => {
                        const imagePath = hotel.images[0]
                        if (!imagePath) return ''
                        if (imagePath.startsWith('http')) return imagePath
                        // Extract just the filename from the path and encode it properly
                        const filename = imagePath.split('/').pop()
                        // Encode the filename to handle spaces and special characters
                        const encodedFilename = encodeURIComponent(filename)
                        return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
                      })()}
                      alt={hotel.hotelName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('Image load error:', e.target.src)
                        e.target.style.display = 'none'
                        const placeholder = e.target.parentElement?.querySelector('.image-placeholder')
                        if (placeholder) placeholder.classList.remove('hidden')
                      }}
                      onLoad={() => console.log('Image loaded successfully:', hotel.images[0])}
                    />
                    {/* Placeholder for when image fails to load */}
                    <div className="image-placeholder hidden absolute inset-0 flex items-center justify-center bg-gray-200">
                      <Building2 className="w-16 h-16 text-gray-400" />
                    </div>
                    {hotel.images.length > 1 && (
                      <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                        View all {hotel.images.length} photos
                      </div>
                    )}
                  </div>
                  {/* Thumbnail grid */}
                  {hotel.images.length > 1 && (
                    <>
                      {hotel.images.slice(1, 5).map((image, idx) => (
                        <div 
                          key={idx} 
                          className="relative group cursor-pointer overflow-hidden"
                          onClick={() => setSelectedImageIndex(idx + 1)}
                        >
                          <img
                            src={(() => {
                              if (!image) return ''
                              if (image.startsWith('http')) return image
                              const filename = image.split('/').pop()
                              // Encode the filename to handle spaces and special characters
                              const encodedFilename = encodeURIComponent(filename)
                              return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
                            })()}
                            alt={`${hotel.hotelName} ${idx + 2}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                          {idx === 3 && hotel.images.length > 5 && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white font-semibold">
                              +{hotel.images.length - 5} more
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
                
                {/* Full Image Gallery Modal */}
                {selectedImageIndex !== null && (
                  <div 
                    className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedImageIndex(null)}
                  >
                    <div className="relative max-w-6xl max-h-full">
                      <button
                        onClick={() => setSelectedImageIndex(null)}
                        className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
                      >
                        <XCircle className="w-8 h-8" />
                      </button>
                      {hotel.images.length > 1 && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : hotel.images.length - 1))
                            }}
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedImageIndex((prev) => (prev < hotel.images.length - 1 ? prev + 1 : 0))
                            }}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </>
                      )}
                      <img
                        src={(() => {
                          const imagePath = hotel.images[selectedImageIndex]
                          if (!imagePath) return ''
                          if (imagePath.startsWith('http')) return imagePath
                          const filename = imagePath.split('/').pop()
                          // Encode the filename to handle spaces and special characters
                          const encodedFilename = encodeURIComponent(filename)
                          return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
                        })()}
                        alt={`${hotel.hotelName} ${selectedImageIndex + 1}`}
                        className="max-w-full max-h-[90vh] object-contain"
                        onClick={(e) => e.stopPropagation()}
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                      {hotel.images.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm">
                          {selectedImageIndex + 1} / {hotel.images.length}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-96 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                <Building2 className="w-16 h-16 text-gray-400" />
              </div>
            )}

            {/* Amenities */}
            {hotel.amenities && hotel.amenities.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">Amenities</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {hotel.amenities.map((amenity, idx) => {
                    const Icon = getAmenityIcon(amenity)
                    return (
                      <div key={idx} className="flex items-center space-x-3">
                        <Icon className="w-5 h-5 text-primary-600" />
                        <span>{amenity}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Room Types */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Select Your Rooms</h2>
              <div className="space-y-4">
                {roomAvailability.map((roomType) => {
                  const available = roomType.available !== undefined 
                    ? roomType.available 
                    : roomType.availableCount || 0
                  const selectedQty = selectedRoomTypes[roomType.type] || 0
                  const nights = checkInDate && checkOutDate 
                    ? differenceInDays(new Date(checkOutDate), new Date(checkInDate)) || 1
                    : 1
                  const totalPrice = roomType.pricePerNight * nights * selectedQty

                  return (
                    <div key={roomType.type} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-semibold">{roomType.type} Room</h3>
                          <p className="text-gray-600 mt-1">
                            {available > 0 ? (
                              <span className="text-green-600 font-medium">Available</span>
                            ) : (
                              <span className="text-red-600 font-medium">Sold out</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary-600">
                            ${roomType.pricePerNight.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">per night</p>
                        </div>
                      </div>

                      {available > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => handleRoomTypeChange(roomType.type, Math.max(0, selectedQty - 1))}
                              disabled={selectedQty <= 0}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span>-</span>
                            </button>
                            <span className="w-8 text-center font-medium">{selectedQty}</span>
                            <button
                              onClick={() => handleRoomTypeChange(roomType.type, Math.min(available, selectedQty + 1))}
                              disabled={selectedQty >= available}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span>+</span>
                            </button>
                            <span className="text-sm text-gray-600 ml-2">room(s)</span>
                          </div>
                          {selectedQty > 0 && (
                            <div className="text-right">
                              <p className="text-lg font-semibold">
                                ${totalPrice.toFixed(2)} for {nights} night{nights > 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
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
                    Check-in
                  </label>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="input-field w-full"
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Check-out
                  </label>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="input-field w-full"
                    min={checkInDate || new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 inline mr-2" />
                    Guests
                  </label>
                  <input
                    type="number"
                    value={numberOfAdults}
                    onChange={(e) => setNumberOfAdults(parseInt(e.target.value) || 1)}
                    className="input-field w-full"
                    min="1"
                    required
                  />
                </div>
              </div>

              {/* Price Summary */}
              {Object.keys(selectedRoomTypes).some(rt => selectedRoomTypes[rt] > 0) && checkInDate && checkOutDate && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <div className="space-y-2">
                    {Object.entries(selectedRoomTypes)
                      .filter(([_, qty]) => qty > 0)
                      .map(([roomType, quantity]) => {
                        const roomData = roomAvailability.find(rt => rt.type === roomType)
                        if (!roomData) return null
                        const roomTotal = roomData.pricePerNight * nights * quantity
                        return (
                          <div key={roomType} className="flex justify-between text-sm">
                            <span>{quantity}x {roomType} × {nights} night{nights > 1 ? 's' : ''}</span>
                            <span>${roomTotal.toFixed(2)}</span>
                          </div>
                        )
                      })}
                  </div>
                  <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary-600">
                      $
                      {Object.entries(selectedRoomTypes)
                        .filter(([_, qty]) => qty > 0)
                        .reduce((sum, [roomType, quantity]) => {
                          const roomData = roomAvailability.find(rt => rt.type === roomType)
                          return sum + (roomData ? roomData.pricePerNight * nights * quantity : 0)
                        }, 0)
                        .toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleAddToCart}
                disabled={!checkInDate || !checkOutDate || Object.keys(selectedRoomTypes).every(rt => !selectedRoomTypes[rt] || selectedRoomTypes[rt] === 0)}
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

export default HotelDetailPage

