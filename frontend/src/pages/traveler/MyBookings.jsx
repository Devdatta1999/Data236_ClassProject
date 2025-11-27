import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { setBookings, setLoading, setError } from '../../store/slices/bookingSlice'
import api from '../../services/apiService'
import { Calendar, MapPin, CheckCircle, Clock, XCircle, ArrowLeft, Car, Building2, Star, Plane, Hotel } from 'lucide-react'
import { format } from 'date-fns'
import Notification from '../../components/common/Notification'
import ReviewModal from '../../components/common/ReviewModal'

const MyBookings = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { bookings, loading } = useSelector((state) => state.bookings)
  const { user } = useSelector((state) => state.auth)
  const [bookingsWithDetails, setBookingsWithDetails] = useState([])
  const [notification, setNotification] = useState(null)
  const [reviewModal, setReviewModal] = useState({ isOpen: false, booking: null, listing: null, listingType: null })
  const [userReviews, setUserReviews] = useState([]) // Store user's reviews to check if already reviewed
  const [activeTab, setActiveTab] = useState('flights') // 'flights', 'hotels', 'cars'

  useEffect(() => {
    // Show payment success notification only once and clear state immediately
    if (location.state?.paymentSuccess) {
      setNotification({ 
        type: 'success', 
        message: 'Payment successful! Your bookings have been confirmed.' 
      })
      // Clear the payment success state immediately to prevent it from showing again on refresh
      window.history.replaceState({}, document.title, location.pathname)
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setNotification(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [location.state?.paymentSuccess, location.pathname])

  const fetchBookings = async () => {
    if (!user?.userId) return

    dispatch(setLoading(true))
    try {
      // Fetch user reviews to check if already reviewed
      try {
        const reviewsResponse = await api.get(`/api/users/${user.userId}/reviews`)
        setUserReviews(reviewsResponse.data.data?.reviews || [])
      } catch (err) {
        console.error('Error fetching user reviews:', err)
        setUserReviews([])
      }

      // Fetch all bookings with listing and provider details included (backend handles this now)
      const response = await api.get(`/api/bookings/user/${user.userId}?_t=${Date.now()}`)
      const bookingsData = response.data.data?.bookings || []
      dispatch(setBookings(bookingsData))

      // Backend now includes listing and provider details, so we can use bookings directly
      setBookingsWithDetails(bookingsData)
    } catch (err) {
      dispatch(setError(err.message))
      console.error('Error fetching bookings:', err)
    } finally {
      dispatch(setLoading(false))
    }
  }

  useEffect(() => {
    fetchBookings()
    
    // If payment was just successful, refetch after a delay to ensure new bookings are visible
    // This handles cases where backend cache invalidation might take a moment
    if (location.state?.paymentSuccess) {
      const refetchTimer = setTimeout(() => {
        fetchBookings()
      }, 2000) // Wait 2 seconds for backend to complete and invalidate cache
      return () => clearTimeout(refetchTimer)
    }
  }, [user, dispatch, location.state?.paymentSuccess])

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Confirmed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'Pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      case 'Cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-green-100 text-green-800'
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'Cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleSubmitReview = async ({ rating, review }) => {
    if (!reviewModal.booking || !reviewModal.listing || !user?.userId) return

    try {
      const listingTypeLower = reviewModal.listingType.toLowerCase() + 's'
      const listingId = reviewModal.listing.hotelId || reviewModal.listing.carId || reviewModal.listing.flightId
      
      await api.post(`/api/listings/${listingTypeLower}/${listingId}/reviews`, {
        userId: user.userId,
        bookingId: reviewModal.booking.bookingId, // Add bookingId to the review submission
        rating,
        comment: review
      })

      setNotification({ 
        type: 'success', 
        message: 'Review submitted successfully!' 
      })

      // Refresh bookings (backend already includes listing and provider details)
      const response = await api.get(`/api/bookings/user/${user.userId}?_t=${Date.now()}`)
      const bookingsData = response.data.data?.bookings || []
      dispatch(setBookings(bookingsData))

      // Backend now includes listing and provider details, so we can use bookings directly
      setBookingsWithDetails(bookingsData)

      // Refresh user reviews
      try {
        const reviewsResponse = await api.get(`/api/users/${user.userId}/reviews`)
        setUserReviews(reviewsResponse.data.data?.reviews || [])
      } catch (err) {
        console.error('Error fetching user reviews:', err)
      }
    } catch (error) {
      console.error('Error submitting review:', error)
      throw error
    }
  }

  const openReviewModal = (booking, listing, listingType) => {
    setReviewModal({ isOpen: true, booking, listing, listingType })
  }

  const closeReviewModal = () => {
    setReviewModal({ isOpen: false, booking: null, listing: null, listingType: null })
  }

  const getListingName = (booking, listing) => {
    if (booking.listingType === 'Car' && listing) {
      return `${listing.model || listing.carModel || 'Car'} ${listing.year ? `(${listing.year})` : ''}`
    } else if (booking.listingType === 'Flight' && listing) {
      return `${listing.departureAirport || ''} → ${listing.arrivalAirport || ''}`
    } else if (booking.listingType === 'Hotel' && listing) {
      return listing.hotelName || 'Hotel'
    }
    return 'Listing'
  }

  const hasUserReviewedBooking = (bookingId) => {
    if (!user?.userId || !userReviews || userReviews.length === 0) return false
    return userReviews.some(
      review => review.bookingId === bookingId
    )
  }

  const hasUserReviewedBillingId = (billingId) => {
    if (!user?.userId || !userReviews || userReviews.length === 0) return false
    // Check if any review has a bookingId that belongs to bookings with this billingId
    // We need to check bookingsWithDetails to find bookings with this billingId
    const bookingsForBilling = bookingsWithDetails.filter(b => b.billingId === billingId)
    const bookingIdsForBilling = bookingsForBilling.map(b => b.bookingId)
    return userReviews.some(
      review => bookingIdsForBilling.includes(review.bookingId)
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading bookings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-primary-600 hover:text-primary-700 mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <h2 className="text-3xl font-bold mb-8">My Bookings</h2>

        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Tabs */}
        {bookingsWithDetails.length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            <div className="flex space-x-2">
              {[
                { id: 'flights', label: 'Flights', icon: Plane, count: bookingsWithDetails.filter(b => b.listingType === 'Flight').length },
                { id: 'hotels', label: 'Hotels', icon: Hotel, count: bookingsWithDetails.filter(b => b.listingType === 'Hotel').length },
                { id: 'cars', label: 'Cars', icon: Car, count: bookingsWithDetails.filter(b => b.listingType === 'Car').length },
              ].map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-all ${
                      activeTab === tab.id
                        ? 'bg-primary-600 text-white font-semibold'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5" />}
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        activeTab === tab.id
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {bookingsWithDetails.length === 0 && !loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">You don't have any bookings yet.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary"
            >
              Start Searching
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Filter bookings by active tab
              const typeMap = {
                flights: 'Flight',
                hotels: 'Hotel',
                cars: 'Car'
              }
              const filteredBookings = bookingsWithDetails.filter(b => b.listingType === typeMap[activeTab])

              // Show empty state for filtered tab
              if (filteredBookings.length === 0 && !loading) {
                const tabLabels = {
                  flights: 'flight',
                  hotels: 'hotel',
                  cars: 'car'
                }
                return (
                  <div className="text-center py-12">
                    <p className="text-gray-600 text-lg mb-4">
                      You don't have any {tabLabels[activeTab]} bookings yet.
                    </p>
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="btn-primary"
                    >
                      Start Searching
                    </button>
                  </div>
                )
              }

              // Group hotel bookings by listingId and billingId (same hotel, same checkout = one bill)
              const grouped = {}
              const ungrouped = []
              
              filteredBookings.forEach((booking) => {
                if (booking.listingType === 'Hotel' && booking.billingId) {
                  // Group by billingId (same bill = same checkout)
                  const key = booking.billingId
                  if (!grouped[key]) {
                    grouped[key] = []
                  }
                  grouped[key].push(booking)
                } else {
                  ungrouped.push(booking)
                }
              })
              
              // Render grouped hotel bookings first, then individual bookings
              return [
                ...Object.entries(grouped).map(([billingId, groupBookings]) => {
                  const firstBooking = groupBookings[0]
                  const listing = firstBooking.listing
                  const provider = firstBooking.provider
                  const listingName = listing?.hotelName || 'Hotel'
                  const totalAmount = groupBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0)
                  
                  return (
                    <div 
                      key={billingId} 
                      className="card hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => navigate(`/booking-group/${billingId}`)}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-semibold">{listingName}</h3>
                          </div>
                          
                          {billingId && (
                            <p className="text-sm text-gray-500 mb-2">
                              Billing ID: {billingId}
                            </p>
                          )}
                          
                          {provider && (
                            <p className="text-gray-600 mb-2 flex items-center">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span className="font-medium">Provider:</span> {provider.providerName || provider.name}
                            </p>
                          )}
                          
                          {firstBooking.checkInDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Check-in:</span> {format(new Date(firstBooking.checkInDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                          {firstBooking.checkOutDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Check-out:</span> {format(new Date(firstBooking.checkOutDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right ml-6">
                          <p className="text-2xl font-bold text-primary-600">
                            ${totalAmount.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {groupBookings.length} room type{groupBookings.length > 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Booked on {format(new Date(firstBooking.bookingDate), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                      
                      {/* List all room types */}
                      <div className="border-t pt-4 space-y-2">
                        {groupBookings.map((booking) => (
                          <div 
                            key={booking.bookingId} 
                            className="bg-gray-50 p-3 rounded"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/booking/${booking.bookingId}`)
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <p className="font-medium text-gray-900">
                                    {booking.roomType} Room
                                  </p>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(booking.status)}`}>
                                    {getStatusIcon(booking.status)}
                                    <span>{booking.status}</span>
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  Quantity: {booking.quantity}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Booking ID: {booking.bookingId}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">
                                  ${booking.totalAmount?.toFixed(2) || '0.00'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {firstBooking.status === 'Confirmed' && (() => {
                        // Check if this billing ID has been reviewed
                        // For grouped bookings, we show one review button for the entire billing group
                        const hasReviewed = hasUserReviewedBillingId(billingId)
                        
                        return (
                          <div className="border-t pt-4 mt-4">
                            {hasReviewed ? (
                              <button
                                disabled
                                onClick={(e) => e.stopPropagation()}
                                className="btn-secondary w-full flex items-center justify-center space-x-2 opacity-50 cursor-not-allowed"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>Review Submitted</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openReviewModal(firstBooking, listing, 'Hotel')
                                }}
                                className="btn-primary w-full flex items-center justify-center space-x-2"
                              >
                                <Star className="w-4 h-4" />
                                <span>Submit Review</span>
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                }),
                ...ungrouped.map((booking) => {
                  const listing = booking.listing
                  const provider = booking.provider
                  
                  // Get listing name/title based on type
                  let listingName = ''
                  if (booking.listingType === 'Car' && listing) {
                    listingName = `${listing.model || listing.carModel || 'Car'} ${listing.year ? `(${listing.year})` : ''}`
                  } else if (booking.listingType === 'Flight' && listing) {
                    listingName = `${listing.departureAirport || ''} → ${listing.arrivalAirport || ''}`
                  } else if (booking.listingType === 'Hotel' && listing) {
                    listingName = listing.hotelName || 'Hotel'
                  }

              return (
                <div
                  key={booking.bookingId}
                  className="card hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(`/booking/${booking.bookingId}`)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold">{listingName || booking.bookingId}</h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          <span>{booking.status}</span>
                        </span>
                      </div>
                      
                      {booking.bookingId && (
                        <p className="text-sm text-gray-500 mb-2">
                          Booking ID: {booking.bookingId}
                        </p>
                      )}

                      {/* Provider name */}
                      {provider && (
                        <p className="text-gray-600 mb-2 flex items-center">
                          <Building2 className="w-4 h-4 mr-2" />
                          <span className="font-medium">Provider:</span> {provider.providerName || provider.name}
                        </p>
                      )}

                      {/* Car-specific details */}
                      {booking.listingType === 'Car' && listing && (
                        <div className="mb-2">
                          <p className="text-gray-600 flex items-center">
                            <Car className="w-4 h-4 mr-2" />
                            <span className="font-medium">Car:</span> {listing.carType || listing.type || 'N/A'}
                            {listing.transmissionType && ` • ${listing.transmissionType}`}
                            {listing.numberOfSeats && ` • ${listing.numberOfSeats} seats`}
                          </p>
                          {/* Location for cars */}
                          {(listing.city || listing.state) && (
                            <p className="text-gray-600 flex items-center mt-1">
                              <MapPin className="w-4 h-4 mr-2" />
                              {[listing.neighbourhood, listing.city, listing.state, listing.country]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Dates - use Pickup/Drop-off for cars, Check-in/Check-out for hotels */}
                      {booking.listingType === 'Car' ? (
                        <>
                          {booking.checkInDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Pickup:</span> {format(new Date(booking.checkInDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                          {booking.checkOutDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Drop-off:</span> {format(new Date(booking.checkOutDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                        </>
                      ) : booking.listingType === 'Hotel' ? (
                        <>
                          {booking.checkInDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Check-in:</span> {format(new Date(booking.checkInDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                          {booking.checkOutDate && (
                            <div className="flex items-center text-gray-600 mb-2">
                              <Calendar className="w-4 h-4 mr-2" />
                              <span>
                                <span className="font-medium">Check-out:</span> {format(new Date(booking.checkOutDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        booking.travelDate && (
                          <div className="flex items-center text-gray-600 mb-2">
                            <Calendar className="w-4 h-4 mr-2" />
                            <span>
                              <span className="font-medium">Travel Date:</span> {format(new Date(booking.travelDate), 'MMM dd, yyyy')}
                            </span>
                          </div>
                        )
                      )}

                      <p className="text-sm text-gray-500">
                        Quantity: {booking.quantity}
                      </p>
                      {booking.status === 'Confirmed' && (() => {
                        const hasReviewed = hasUserReviewedBooking(booking.bookingId)
                        
                        return (
                          <div className="mt-4">
                            {hasReviewed ? (
                              <button
                                disabled
                                onClick={(e) => e.stopPropagation()}
                                className="btn-secondary text-sm flex items-center justify-center space-x-2 opacity-50 cursor-not-allowed"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>Review Submitted</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openReviewModal(booking, listing, booking.listingType)
                                }}
                                className="btn-primary text-sm flex items-center space-x-2"
                              >
                                <Star className="w-4 h-4" />
                                <span>Submit Review</span>
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <div className="text-right ml-6">
                      <p className="text-2xl font-bold text-primary-600">
                        ${booking.totalAmount?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Booked on {format(new Date(booking.bookingDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
              ]
            })()}
          </div>
        )}

        {/* Review Modal */}
        <ReviewModal
          isOpen={reviewModal.isOpen}
          onClose={closeReviewModal}
          onSubmit={handleSubmitReview}
          bookingId={reviewModal.booking?.bookingId}
          listingName={reviewModal.booking && reviewModal.listing ? getListingName(reviewModal.booking, reviewModal.listing) : ''}
        />
      </div>
    </div>
  )
}

export default MyBookings

