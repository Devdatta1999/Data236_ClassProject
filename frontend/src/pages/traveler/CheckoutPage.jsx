import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { sendEventAndWait } from '../../services/kafkaService'
import { setCheckoutId, setLoading, setError } from '../../store/slices/cartSlice'
import { Trash2, ArrowRight, Calendar } from 'lucide-react'
import { removeFromCart, updateQuantity } from '../../store/slices/cartSlice'
import { format } from 'date-fns'
import Notification from '../../components/common/Notification'
import api from '../../services/apiService'

const CheckoutPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { items, checkoutId, loading, error } = useSelector((state) => state.cart)
  const { user } = useSelector((state) => state.auth)
  const [notification, setNotification] = useState(null)

  // Mark any pending bookings as Failed when user navigates to checkout
  // This ensures bookings from failed payments are freed up
  useEffect(() => {
    const markFailedBookings = async () => {
      if (!user?.userId) return

      try {
        // Get user's pending bookings
        const response = await api.get(`/api/bookings/user/${user.userId}`)
        const bookings = response.data.data?.bookings || []
        
        // Find pending bookings that might be from a failed payment
        const pendingBookings = bookings.filter(b => b.status === 'Pending')
        
        if (pendingBookings.length > 0) {
          // Mark them as Failed to free up inventory
          const bookingIds = pendingBookings.map(b => b.bookingId)
          
          console.log(`[CheckoutPage] Found ${pendingBookings.length} pending booking(s) from previous session, marking as Failed...`)
          
          await api.post('/api/bookings/fail', { bookingIds }, {
            timeout: 5000
          })
          
          console.log(`[CheckoutPage] Successfully marked ${pendingBookings.length} booking(s) as Failed`)
        }
      } catch (err) {
        console.error('[CheckoutPage] Error marking failed bookings:', err)
        // Don't show error to user - this is a background cleanup
      }
    }

    markFailedBookings()
  }, [user]) // Run when component mounts or user changes

  useEffect(() => {
    if (items.length === 0) {
      navigate('/dashboard')
    }
  }, [items, navigate])

  const handleCheckout = async () => {
    if (!user) {
      navigate('/login')
      return
    }

    dispatch(setLoading(true))

    try {
      const cartItems = items.map((item) => ({
        listingId: item.listingId,
        listingType: item.listingType,
        quantity: item.quantity,
        ...(item.travelDate && { travelDate: item.travelDate }),
        ...(item.checkInDate && { checkInDate: item.checkInDate }),
        ...(item.checkOutDate && { checkOutDate: item.checkOutDate }),
        ...(item.pickupDate && { pickupDate: item.pickupDate }),
        ...(item.returnDate && { returnDate: item.returnDate }),
        ...(item.roomType && { roomType: item.roomType }), // For hotels
      }))

      const response = await sendEventAndWait(
        'checkout-events',
        {
          eventType: 'checkout.initiate',
          userId: user.userId,
          cartItems,
        },
        'checkout-events-response',
        60000
      )

      dispatch(setCheckoutId(response.checkoutId))
      navigate('/payment', { state: { checkoutData: response } })
    } catch (err) {
      const errorMessage = err.message || 'Checkout failed. Please try again.'
      dispatch(setError(errorMessage))
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      dispatch(setLoading(false))
    }
  }

  const totalAmount = items.reduce((sum, item) => {
    if (item.listingType === 'Car' && item.pickupDate && item.returnDate && item.numberOfDays) {
      // For cars, calculate: dailyRentalPrice × numberOfDays
      const price = item.listing?.dailyRentalPrice || 0
      return sum + (price * item.numberOfDays * item.quantity)
    } else if (item.listingType === 'Hotel') {
      // For hotels, calculate: pricePerNight × numberOfNights × quantity
      const price = item.pricePerNight || item.listing?.pricePerNight || 0
      const nights = item.numberOfNights || (item.checkInDate && item.checkOutDate 
        ? Math.ceil((new Date(item.checkOutDate) - new Date(item.checkInDate)) / (1000 * 60 * 60 * 24)) || 1
        : 1)
      return sum + (price * nights * item.quantity)
    } else {
      const price = item.listing?.ticketPrice || item.listing?.pricePerNight || item.listing?.dailyRentalPrice || 0
      return sum + (price * item.quantity)
    }
  }, 0)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-primary-600 hover:text-primary-700 mb-6"
        >
          ← Back to Dashboard
        </button>

        <h2 className="text-3xl font-bold mb-8">Checkout</h2>

        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            {items.map((item, index) => {
              const listing = item.listing
              let price = 0
              let totalPrice = 0
              let priceLabel = ''

              if (item.listingType === 'Car' && item.pickupDate && item.returnDate && item.numberOfDays) {
                // For cars: dailyRentalPrice × numberOfDays
                price = listing?.dailyRentalPrice || 0
                totalPrice = price * item.numberOfDays * item.quantity
                priceLabel = `$${price.toFixed(2)}/day × ${item.numberOfDays} ${item.numberOfDays === 1 ? 'day' : 'days'}`
              } else if (item.listingType === 'Flight') {
                price = listing?.ticketPrice || 0
                totalPrice = price * item.quantity
                priceLabel = `$${price.toFixed(2)} each`
              } else if (item.listingType === 'Hotel') {
                // For hotels, use pricePerNight from cart item (which includes room type price)
                price = item.pricePerNight || listing?.pricePerNight || 0
                const nights = item.numberOfNights || (item.checkInDate && item.checkOutDate 
                  ? Math.ceil((new Date(item.checkOutDate) - new Date(item.checkInDate)) / (1000 * 60 * 60 * 24)) || 1
                  : 1)
                totalPrice = price * nights * item.quantity
                priceLabel = `$${price.toFixed(2)}/night × ${nights} night${nights > 1 ? 's' : ''}`
              } else {
                price = listing?.dailyRentalPrice || 0
                totalPrice = price * item.quantity
                priceLabel = `$${price.toFixed(2)} each`
              }

              return (
                <div key={index} className="card">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">
                        {listing?.flightId || listing?.hotelName || listing?.model || listing?.carModel}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Type: {item.listingType}
                        {item.roomType && ` - ${item.roomType} Room`}
                      </p>
                      {item.listingType === 'Hotel' && item.checkInDate && item.checkOutDate && (
                        <div className="flex items-center space-x-2 mb-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Check-in: {format(new Date(item.checkInDate), 'MMM dd, yyyy')} - 
                            Check-out: {format(new Date(item.checkOutDate), 'MMM dd, yyyy')}
                            {item.numberOfNights && ` (${item.numberOfNights} ${item.numberOfNights === 1 ? 'night' : 'nights'})`}
                          </span>
                        </div>
                      )}
                      {item.listingType === 'Car' && item.pickupDate && item.returnDate && (
                        <div className="flex items-center space-x-2 mb-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {format(new Date(item.pickupDate), 'MMM dd, yyyy')} - {format(new Date(item.returnDate), 'MMM dd, yyyy')}
                            {item.numberOfDays && ` (${item.numberOfDays} ${item.numberOfDays === 1 ? 'day' : 'days'})`}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center space-x-4">
                        <label className="text-sm text-gray-700">
                          {item.listingType === 'Car' ? 'Quantity:' : 'Quantity:'}
                        </label>
                        {item.listingType === 'Car' ? (
                          <input
                            type="number"
                            value="1"
                            readOnly
                            disabled
                            className="w-20 px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-600 cursor-not-allowed"
                          />
                        ) : (
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => dispatch(updateQuantity({
                              listingId: item.listingId,
                              listingType: item.listingType,
                              quantity: parseInt(e.target.value),
                            }))}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-gray-900"
                          />
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-bold text-primary-600">
                        ${totalPrice.toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500">{priceLabel}</p>
                      <button
                        onClick={() => dispatch(removeFromCart({
                          listingId: item.listingId,
                          listingType: item.listingType,
                          pickupDate: item.pickupDate,
                          returnDate: item.returnDate,
                        }))}
                        className="mt-2 text-red-600 hover:text-red-700 text-sm flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="md:col-span-1">
            <div className="card sticky top-4">
              <h3 className="text-xl font-semibold mb-4">Order Summary</h3>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({items.length} items)</span>
                  <span>${totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span>
                  <span>${(totalAmount * 0.1).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${(totalAmount * 1.1).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleCheckout}
                disabled={loading || items.length === 0}
                className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <span>Proceed to Payment</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage

