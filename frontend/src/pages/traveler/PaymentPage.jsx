import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { sendEventAndWait } from '../../services/kafkaService'
import { clearCart } from '../../store/slices/cartSlice'
import { setLoading, setError } from '../../store/slices/cartSlice'
import { addBooking } from '../../store/slices/bookingSlice'
import { CreditCard, Lock, ArrowLeft } from 'lucide-react'

const PaymentPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { checkoutId } = useSelector((state) => state.cart)
  const [loading, setLoadingState] = useState(false)
  const [paymentData, setPaymentData] = useState({
    cardNumber: user?.paymentDetails?.cardNumber?.replace(/\d(?=\d{4})/g, '*') || '',
    cardHolderName: user?.paymentDetails?.cardHolderName || '',
    expiryDate: user?.paymentDetails?.expiryDate || '',
    cvv: '',
    billingAddress: user?.paymentDetails?.billingAddress || {
      street: user?.address || '',
      city: user?.city || '',
      state: user?.state || '',
      zipCode: user?.zipCode || '',
    },
  })

  const checkoutData = location.state?.checkoutData

  useEffect(() => {
    if (!checkoutId && !checkoutData) {
      navigate('/checkout')
    }
  }, [checkoutId, checkoutData, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoadingState(true)
    dispatch(setLoading(true))

    try {
      const response = await sendEventAndWait(
        'payment-events',
        {
          eventType: 'payment.complete',
          checkoutId: checkoutId || checkoutData?.checkoutId,
          userId: user.userId,
          bookingIds: checkoutData?.bookings?.map((b) => b.bookingId) || [],
          paymentMethod: 'Credit Card',
        },
        'payment-events-response',
        60000
      )

      // Add bookings to Redux
      if (response.bills) {
        response.bills.forEach((bill) => {
          // Find corresponding booking
          const booking = checkoutData?.bookings?.find(
            (b) => b.bookingId === bill.booking_id?.split('-').pop()
          )
          if (booking) {
            dispatch(addBooking({ ...booking, status: 'Confirmed' }))
          }
        })
      }

      dispatch(clearCart())
      navigate('/my-bookings', { state: { paymentSuccess: true } })
    } catch (err) {
      dispatch(setError(err.message))
      alert('Payment failed: ' + err.message)
    } finally {
      setLoadingState(false)
      dispatch(setLoading(false))
    }
  }

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  const formatExpiryDate = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  const totalAmount = checkoutData?.totalAmount || 0

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/checkout')}
          className="text-primary-600 hover:text-primary-700 mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Checkout</span>
        </button>

        <h2 className="text-3xl font-bold mb-8">Payment</h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit} className="card space-y-6">
              <div className="flex items-center space-x-2 text-primary-600 mb-4">
                <Lock className="w-5 h-5" />
                <span className="font-semibold">Secure Payment</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Number
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    maxLength="19"
                    value={paymentData.cardNumber}
                    onChange={(e) => setPaymentData({
                      ...paymentData,
                      cardNumber: formatCardNumber(e.target.value),
                    })}
                    className="input-field pl-10"
                    placeholder="1234 5678 9012 3456"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Holder Name
                </label>
                <input
                  type="text"
                  value={paymentData.cardHolderName}
                  onChange={(e) => setPaymentData({
                    ...paymentData,
                    cardHolderName: e.target.value,
                  })}
                  className="input-field"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiry Date
                  </label>
                  <input
                    type="text"
                    maxLength="5"
                    value={paymentData.expiryDate}
                    onChange={(e) => setPaymentData({
                      ...paymentData,
                      expiryDate: formatExpiryDate(e.target.value),
                    })}
                    className="input-field"
                    placeholder="MM/YY"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CVV
                  </label>
                  <input
                    type="text"
                    maxLength="4"
                    value={paymentData.cvv}
                    onChange={(e) => setPaymentData({
                      ...paymentData,
                      cvv: e.target.value.replace(/\D/g, ''),
                    })}
                    className="input-field"
                    placeholder="123"
                    required
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Billing Address</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={paymentData.billingAddress.street}
                    onChange={(e) => setPaymentData({
                      ...paymentData,
                      billingAddress: {
                        ...paymentData.billingAddress,
                        street: e.target.value,
                      },
                    })}
                    className="input-field"
                    placeholder="Street Address"
                    required
                  />
                  <div className="grid md:grid-cols-3 gap-4">
                    <input
                      type="text"
                      value={paymentData.billingAddress.city}
                      onChange={(e) => setPaymentData({
                        ...paymentData,
                        billingAddress: {
                          ...paymentData.billingAddress,
                          city: e.target.value,
                        },
                      })}
                      className="input-field"
                      placeholder="City"
                      required
                    />
                    <input
                      type="text"
                      maxLength="2"
                      value={paymentData.billingAddress.state}
                      onChange={(e) => setPaymentData({
                        ...paymentData,
                        billingAddress: {
                          ...paymentData.billingAddress,
                          state: e.target.value.toUpperCase(),
                        },
                      })}
                      className="input-field"
                      placeholder="State"
                      required
                    />
                    <input
                      type="text"
                      value={paymentData.billingAddress.zipCode}
                      onChange={(e) => setPaymentData({
                        ...paymentData,
                        billingAddress: {
                          ...paymentData.billingAddress,
                          zipCode: e.target.value,
                        },
                      })}
                      className="input-field"
                      placeholder="ZIP Code"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Processing Payment...</span>
                  </div>
                ) : (
                  `Pay $${(totalAmount * 1.1).toFixed(2)}`
                )}
              </button>
            </form>
          </div>

          <div className="md:col-span-1">
            <div className="card sticky top-4">
              <h3 className="text-xl font-semibold mb-4">Order Summary</h3>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentPage

