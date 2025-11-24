import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { setBookings, setLoading, setError } from '../../store/slices/bookingSlice'
import api from '../../services/apiService'
import { Calendar, MapPin, CheckCircle, Clock, XCircle, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'

const MyBookings = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { bookings, loading } = useSelector((state) => state.bookings)
  const { user } = useSelector((state) => state.auth)

  useEffect(() => {
    if (location.state?.paymentSuccess) {
      alert('Payment successful! Your bookings have been confirmed.')
    }
  }, [location.state])

  useEffect(() => {
    const fetchBookings = async () => {
      if (!user?.userId) return

      dispatch(setLoading(true))
      try {
        const response = await api.get(`/api/bookings/user/${user.userId}`)
        dispatch(setBookings(response.data.data?.bookings || []))
      } catch (err) {
        dispatch(setError(err.message))
        console.error('Error fetching bookings:', err)
      } finally {
        dispatch(setLoading(false))
      }
    }

    fetchBookings()
  }, [user, dispatch])

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

        {bookings.length === 0 ? (
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
            {bookings.map((booking) => (
              <div
                key={booking.bookingId}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/booking/${booking.bookingId}`)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-semibold">{booking.bookingId}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 ${getStatusColor(booking.status)}`}>
                        {getStatusIcon(booking.status)}
                        <span>{booking.status}</span>
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2">
                      <span className="font-medium">Type:</span> {booking.listingType}
                    </p>
                    <div className="flex items-center text-gray-600 mb-2">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>
                        {booking.travelDate && format(new Date(booking.travelDate), 'MMM dd, yyyy')}
                        {booking.checkInDate && `Check-in: ${format(new Date(booking.checkInDate), 'MMM dd, yyyy')}`}
                      </span>
                    </div>
                    {booking.checkOutDate && (
                      <div className="flex items-center text-gray-600 mb-2">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span>Check-out: {format(new Date(booking.checkOutDate), 'MMM dd, yyyy')}</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-500">
                      Quantity: {booking.quantity}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MyBookings

