import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { setLoading, setError } from '../../store/slices/bookingSlice'
import api from '../../services/apiService'
import { Calendar, MapPin, ArrowLeft, XCircle, Building2, CheckCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import Notification from '../../components/common/Notification'

const BookingGroupDetails = () => {
  const { billingId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { loading } = useSelector((state) => state.bookings)
  const { user } = useSelector((state) => state.auth)
  const [bookings, setBookings] = useState([])
  const [listing, setListing] = useState(null)
  const [provider, setProvider] = useState(null)
  const [notification, setNotification] = useState(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedBookingToCancel, setSelectedBookingToCancel] = useState(null)

  useEffect(() => {
    const fetchBookingGroup = async () => {
      if (!billingId || !user?.userId) return

      dispatch(setLoading(true))
      try {
        // Fetch all bookings for this user
        const response = await api.get(`/api/bookings/user/${user.userId}`)
        const allBookings = response.data.data?.bookings || []
        
        // Filter bookings with matching billingId and listingType === 'Hotel'
        // Only show hotel bookings for this billing group
        const groupBookings = allBookings.filter(b => 
          b.billingId === billingId && b.listingType === 'Hotel'
        )
        
        if (groupBookings.length === 0) {
          setError('No bookings found for this billing ID')
          return
        }

        // Sort by booking date
        groupBookings.sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate))
        setBookings(groupBookings)

        // Backend now includes listing and provider details in booking data
        const firstBooking = groupBookings[0]
        if (firstBooking?.listing) {
          setListing(firstBooking.listing)
        }
        if (firstBooking?.provider) {
          setProvider(firstBooking.provider)
        }
      } catch (err) {
        dispatch(setError(err.message))
        console.error('Error fetching booking group:', err)
      } finally {
        dispatch(setLoading(false))
      }
    }

    fetchBookingGroup()
  }, [billingId, user, dispatch])

  const handleCancelBooking = async () => {
    if (!selectedBookingToCancel) return

    try {
      await api.delete(`/api/bookings/${selectedBookingToCancel.bookingId}`)
      
      setNotification({ 
        type: 'success', 
        message: 'Booking cancelled successfully.' 
      })

      setShowCancelDialog(false)
      setSelectedBookingToCancel(null)

      // Refresh bookings list (backend now includes listing and provider details)
      const response = await api.get(`/api/bookings/user/${user.userId}`)
      const allBookings = response.data.data?.bookings || []
      // Only show hotel bookings for this billing group
      const groupBookings = allBookings.filter(b => 
        b.billingId === billingId && b.listingType === 'Hotel'
      )
      
      if (groupBookings.length === 0) {
        // All bookings cancelled, navigate back
        setTimeout(() => {
          navigate('/my-bookings')
        }, 1500)
      } else {
        groupBookings.sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate))
        setBookings(groupBookings)
        // Update listing and provider from first booking (already included from backend)
        if (groupBookings[0]?.listing) {
          setListing(groupBookings[0].listing)
        }
        if (groupBookings[0]?.provider) {
          setProvider(groupBookings[0].provider)
        }
      }
    } catch (err) {
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.error?.message || 'Failed to cancel booking. Please try again.' 
      })
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading booking details...</p>
        </div>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">No bookings found</p>
          <button onClick={() => navigate('/my-bookings')} className="btn-primary mt-4">
            Back to Bookings
          </button>
        </div>
      </div>
    )
  }

  const listingName = listing?.hotelName || listing?.model || 'Listing'
  const firstBooking = bookings[0]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/my-bookings')}
          className="text-primary-600 hover:text-primary-700 mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Bookings</span>
        </button>

        {/* Header */}
        <div className="card mb-6">
          <h2 className="text-3xl font-bold mb-4">{listingName}</h2>
          
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

          {firstBooking.checkInDate && firstBooking.checkOutDate && (
            <>
              <div className="flex items-center text-gray-600 mb-2">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  <span className="font-medium">Check-in:</span> {format(new Date(firstBooking.checkInDate), 'MMM dd, yyyy')}
                </span>
              </div>
              <div className="flex items-center text-gray-600 mb-2">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  <span className="font-medium">Check-out:</span> {format(new Date(firstBooking.checkOutDate), 'MMM dd, yyyy')}
                </span>
              </div>
            </>
          )}
        </div>

        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Booking Cards */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold mb-4">Bookings ({bookings.length})</h3>
          {bookings.map((booking) => (
            <div key={booking.bookingId} className="card">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold">{booking.bookingId}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 ${getStatusColor(booking.status)}`}>
                      {getStatusIcon(booking.status)}
                      <span>{booking.status}</span>
                    </span>
                  </div>
                  
                  {booking.roomType && (
                    <p className="text-gray-600 mb-2">
                      <span className="font-medium">Room Type:</span> {booking.roomType}
                    </p>
                  )}
                  
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Quantity:</span> {booking.quantity}
                  </p>
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

              {booking.status !== 'Cancelled' && (
                <div className="border-t pt-4 mt-4">
                  <button
                    onClick={() => {
                      setSelectedBookingToCancel(booking)
                      setShowCancelDialog(true)
                    }}
                    className="btn-secondary w-full flex items-center justify-center space-x-2 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel This Booking</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Cancel Confirmation Dialog */}
        {showCancelDialog && selectedBookingToCancel && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Confirm Cancellation</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to cancel this booking? This will cancel all bookings in this reservation (all room types). This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCancelDialog(false)
                    setSelectedBookingToCancel(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                >
                  No, Keep Booking
                </button>
                <button
                  onClick={handleCancelBooking}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Yes, Cancel Booking
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BookingGroupDetails

