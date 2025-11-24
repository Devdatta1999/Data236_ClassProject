import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { setSelectedBooking, setLoading, setError } from '../../store/slices/bookingSlice'
import api from '../../services/apiService'
import { Calendar, MapPin, ArrowLeft, XCircle } from 'lucide-react'
import { format } from 'date-fns'

const BookingDetails = () => {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { selectedBooking, loading } = useSelector((state) => state.bookings)

  useEffect(() => {
    const fetchBooking = async () => {
      dispatch(setLoading(true))
      try {
        const response = await api.get(`/api/bookings/${bookingId}`)
        dispatch(setSelectedBooking(response.data.data?.booking))
      } catch (err) {
        dispatch(setError(err.message))
        console.error('Error fetching booking:', err)
      } finally {
        dispatch(setLoading(false))
      }
    }

    fetchBooking()
  }, [bookingId, dispatch])

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return
    }

    try {
      // This would use Kafka booking.cancel event
      // For now, using HTTP
      await api.delete(`/api/bookings/${bookingId}`)
      navigate('/my-bookings')
    } catch (err) {
      alert('Failed to cancel booking: ' + err.message)
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

  if (!selectedBooking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Booking not found</p>
          <button onClick={() => navigate('/my-bookings')} className="btn-primary mt-4">
            Back to Bookings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/my-bookings')}
          className="text-primary-600 hover:text-primary-700 mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Bookings</span>
        </button>

        <div className="card">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">{selectedBooking.bookingId}</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                selectedBooking.status === 'Confirmed' ? 'bg-green-100 text-green-800' :
                selectedBooking.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {selectedBooking.status}
              </span>
            </div>
            {selectedBooking.status !== 'Cancelled' && (
              <button
                onClick={handleCancel}
                className="btn-secondary flex items-center space-x-2 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancel Booking</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Booking Information</h3>
              <div className="grid md:grid-cols-2 gap-4 text-gray-600">
                <div>
                  <p className="font-medium">Type:</p>
                  <p>{selectedBooking.listingType}</p>
                </div>
                <div>
                  <p className="font-medium">Quantity:</p>
                  <p>{selectedBooking.quantity}</p>
                </div>
                {selectedBooking.travelDate && (
                  <div>
                    <p className="font-medium flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Travel Date:
                    </p>
                    <p>{format(new Date(selectedBooking.travelDate), 'MMM dd, yyyy')}</p>
                  </div>
                )}
                {selectedBooking.checkInDate && (
                  <div>
                    <p className="font-medium flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Check-in:
                    </p>
                    <p>{format(new Date(selectedBooking.checkInDate), 'MMM dd, yyyy')}</p>
                  </div>
                )}
                {selectedBooking.checkOutDate && (
                  <div>
                    <p className="font-medium flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Check-out:
                    </p>
                    <p>{format(new Date(selectedBooking.checkOutDate), 'MMM dd, yyyy')}</p>
                  </div>
                )}
                <div>
                  <p className="font-medium">Booking Date:</p>
                  <p>{format(new Date(selectedBooking.bookingDate), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-2">Payment Information</h3>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Amount:</span>
                <span className="text-2xl font-bold text-primary-600">
                  ${selectedBooking.totalAmount?.toFixed(2) || '0.00'}
                </span>
              </div>
              {selectedBooking.billingId && (
                <p className="text-sm text-gray-500 mt-2">Billing ID: {selectedBooking.billingId}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookingDetails

