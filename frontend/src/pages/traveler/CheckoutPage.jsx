import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { sendEventAndWait } from '../../services/kafkaService'
import { setCheckoutId, setLoading, setError } from '../../store/slices/cartSlice'
import { Trash2, ArrowRight } from 'lucide-react'
import { removeFromCart, updateQuantity } from '../../store/slices/cartSlice'

const CheckoutPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { items, checkoutId, loading } = useSelector((state) => state.cart)
  const { user } = useSelector((state) => state.auth)

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
        ...(item.returnDate && { returnDate: item.returnDate }),
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
      dispatch(setError(err.message))
      alert('Checkout failed: ' + err.message)
    } finally {
      dispatch(setLoading(false))
    }
  }

  const totalAmount = items.reduce((sum, item) => {
    const price = item.listing?.ticketPrice || item.listing?.pricePerNight || item.listing?.dailyRentalPrice || 0
    return sum + (price * item.quantity)
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

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            {items.map((item, index) => {
              const listing = item.listing
              const price = listing?.ticketPrice || listing?.pricePerNight || listing?.dailyRentalPrice || 0

              return (
                <div key={index} className="card">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">
                        {listing?.flightId || listing?.hotelName || listing?.carModel}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Type: {item.listingType}
                      </p>
                      <div className="flex items-center space-x-4">
                        <label className="text-sm text-gray-700">Quantity:</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => dispatch(updateQuantity({
                            listingId: item.listingId,
                            listingType: item.listingType,
                            quantity: parseInt(e.target.value),
                          }))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-bold text-primary-600">
                        ${(price * item.quantity).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500">${price.toFixed(2)} each</p>
                      <button
                        onClick={() => dispatch(removeFromCart({
                          listingId: item.listingId,
                          listingType: item.listingType,
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

