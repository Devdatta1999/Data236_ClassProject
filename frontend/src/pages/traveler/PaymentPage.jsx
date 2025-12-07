import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { clearCart } from '../../store/slices/cartSlice'
import { setLoading, setError } from '../../store/slices/cartSlice'
import { addBooking } from '../../store/slices/bookingSlice'
import api from '../../services/apiService'
import { CreditCard, Lock, ArrowLeft, Plus, Check } from 'lucide-react'

const PaymentPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { checkoutId } = useSelector((state) => state.cart)
  const [loading, setLoadingState] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savedCards, setSavedCards] = useState([])
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [useNewCard, setUseNewCard] = useState(false)
  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    cardHolderName: '',
    expiryDate: '',
    cvv: '',
    billingAddress: {
      street: user?.address || '',
      city: user?.city || '',
      state: user?.state || '',
      zipCode: user?.zipCode || '',
    },
  })

  const checkoutData = location.state?.checkoutData
  const [paymentCompleted, setPaymentCompleted] = useState(false)
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  useEffect(() => {
    if (!checkoutId && !checkoutData) {
      navigate('/checkout')
    }
    fetchSavedCards()

    // Only mark bookings as Failed if user explicitly navigates away from the site
    // Don't trigger on component re-renders or page refreshes
    const handleBeforeUnload = (e) => {
      if (!paymentCompleted && checkoutData?.bookings && checkoutData.bookings.length > 0) {
        // Browser is closing or navigating away from site
        const bookingIds = checkoutData.bookings.map(b => b.bookingId)
        const BOOKING_SERVICE_URL = import.meta.env.VITE_BOOKING_SERVICE_URL || 'http://localhost:3003'

        // Use navigator.sendBeacon for reliability during unload
        const blob = new Blob(
          [JSON.stringify({ bookingIds })],
          { type: 'application/json' }
        )
        navigator.sendBeacon(`${BOOKING_SERVICE_URL}/api/bookings/fail`, blob)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [checkoutId, checkoutData, navigate, user, paymentCompleted])

  const fetchSavedCards = async () => {
    if (!user?.userId) return
    try {
      const response = await api.get(`/api/users/${user.userId}/cards`)
      const cards = response.data.data?.cards || []
      setSavedCards(cards)
      // Auto-select first card if available
      if (cards.length > 0 && !useNewCard) {
        setSelectedCardId(cards[0].cardId)
        setUseNewCard(false)
      } else {
        setUseNewCard(true)
      }
    } catch (err) {
      console.error('Error fetching saved cards:', err)
      setUseNewCard(true)
    }
  }

  const validateExpiryDate = (expiry) => {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      return false
    }
    const [month, year] = expiry.split('/')
    const expiryYear = 2000 + parseInt(year)
    const expiryDate = new Date(expiryYear, parseInt(month) - 1)
    const now = new Date()
    return expiryDate >= now
  }

  const validateCVV = (cvv) => {
    return /^\d{3,4}$/.test(cvv)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoadingState(true)
    dispatch(setLoading(true))
    setError('') // Clear previous errors
    setSuccess('') // Clear previous success messages

    try {
      let cardData = {}
      
      if (useNewCard) {
        // Validate new card details
        if (!validateExpiryDate(paymentData.expiryDate)) {
          throw new Error('Invalid or expired expiry date (must be MM/YY format and not expired)')
        }
        if (!validateCVV(paymentData.cvv)) {
          throw new Error('CVV must be 3-4 digits')
        }
        
        cardData = {
          cardNumber: paymentData.cardNumber.replace(/\s+/g, ''),
          cardHolderName: paymentData.cardHolderName,
          expiryDate: paymentData.expiryDate,
          cvv: paymentData.cvv,
          zipCode: paymentData.billingAddress.zipCode, // Include ZIP code for validation
        }
      } else {
        // Get selected saved card (we'll send cardId and server will decrypt)
        if (!selectedCardId) {
          throw new Error('Please select a card or add a new card')
        }
        // For saved cards, we only need cardId and CVV (fresh CVV required for security)
        if (!validateCVV(paymentData.cvv)) {
          throw new Error('CVV must be 3-4 digits')
        }
        
        const selectedCard = savedCards.find(c => c.cardId === selectedCardId)
        if (!selectedCard) {
          throw new Error('Selected card not found')
        }
        
        cardData = {
          cardId: selectedCardId,
          cvv: paymentData.cvv,
          zipCode: paymentData.billingAddress.zipCode, // Include ZIP code for validation (must match saved card)
        }
      }

      // Ensure checkoutId is available (required for billing)
      const finalCheckoutId = checkoutId || checkoutData?.checkoutId
      if (!finalCheckoutId) {
        setError('Checkout session expired. Please start over from checkout.')
        dispatch(setError('Checkout session expired. Please start over from checkout.'))
        setLoadingState(false)
        dispatch(setLoading(false))
        setTimeout(() => {
          navigate('/checkout', { replace: true })
        }, 2000)
        return
      }

      // Use HTTP endpoint instead of Kafka
      const response = await api.post('/api/billing/payment', {
        checkoutId: finalCheckoutId,
        userId: user.userId,
        bookingIds: checkoutData?.bookings?.map((b) => b.bookingId) || [],
        paymentMethod: 'Credit Card',
        cardData, // Include card data
      })

      if (response.data.success) {
        // Add bookings to Redux
        if (response.data.data.bills) {
          response.data.data.bills.forEach((bill) => {
            // Find corresponding booking
            const booking = checkoutData?.bookings?.find(
              (b) => b.bookingId === bill.booking_id?.split('-').pop()
            )
            if (booking) {
              dispatch(addBooking({ ...booking, status: 'Confirmed' }))
            }
          })
        }
      } else {
        throw new Error(response.data.message || 'Payment failed')
      }

      setPaymentCompleted(true) // Mark payment as completed before navigation
      setSuccess('Payment successful! Redirecting to your bookings...')
      dispatch(clearCart())
      setTimeout(() => {
        // Use replace: true to avoid keeping state in history and allow immediate refetch
        navigate('/my-bookings', { 
          state: { paymentSuccess: true },
          replace: true 
        })
      }, 1500)
    } catch (err) {
      const errorMessage = err.message || 'Payment failed. Please try again.'
      // Extract user-friendly error message
      let friendlyMessage = errorMessage
      if (errorMessage.includes('ZIP code')) {
        friendlyMessage = 'Invalid ZIP code. Please check the ZIP code matches your saved card or enter a valid ZIP code.'
      } else if (errorMessage.includes('Invalid card')) {
        friendlyMessage = 'Invalid card information. Please check your card details and try again.'
      } else if (errorMessage.includes('expired')) {
        friendlyMessage = 'Your card has expired. Please use a different card.'
      } else if (errorMessage.includes('CVV')) {
        friendlyMessage = 'Invalid CVV. Please enter a valid 3-4 digit CVV.'
      } else if (errorMessage.includes('checksum')) {
        friendlyMessage = 'Invalid card number. Please check your card number and try again.'
      } else if (errorMessage.includes('not found')) {
        friendlyMessage = 'Booking not found. Your session may have expired. Please try again.'
      } else if (errorMessage.includes('not in pending')) {
        friendlyMessage = 'This booking has already been processed. Please refresh the page.'
      } else if (errorMessage.includes('checkout_id')) {
        friendlyMessage = 'Checkout session expired. Please start over from checkout.'
      }
      
      setError(friendlyMessage)
      dispatch(setError(friendlyMessage))
      
      // On payment failure, mark bookings as Failed immediately and redirect to checkout
      // Backend should mark bookings as Failed via Kafka, but we do it here as a safety measure
      if (checkoutData?.bookings && checkoutData.bookings.length > 0) {
        const bookingIds = checkoutData.bookings.map(b => b.bookingId)
        
        // Mark bookings as Failed immediately via API Gateway (don't wait)
        api.post('/api/bookings/fail', { bookingIds }, {
          timeout: 5000
        }).then(() => {
          console.log('Bookings marked as Failed successfully')
        }).catch(err => {
          console.error('Failed to mark bookings as Failed:', err)
          // Non-critical - backend should have already marked them as Failed via Kafka
        })
      }
      
      // Redirect to checkout page after 3 seconds so user can see error and try again
      setTimeout(() => {
        navigate('/checkout', { replace: true })
      }, 3000)
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
        {/* Warning Banner */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Important:</strong> Please complete your payment now. Do not close this page or navigate away, 
                as your bookings will be cancelled if you leave without completing payment.
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Payment Failed</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError('')}
                  className="inline-flex text-red-400 hover:text-red-600"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog for Back Button */}
        {showBackConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Leave Payment Page?</h3>
              <p className="text-gray-600 mb-6">
                Your bookings will be cancelled if you leave without completing payment. Are you sure you want to go back?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowBackConfirm(false)}
                  className="btn-secondary"
                >
                  Stay on Page
                </button>
                <button
                  onClick={() => {
                    setShowBackConfirm(false)
                    navigate('/checkout')
                  }}
                  className="btn-primary bg-red-600 hover:bg-red-700"
                >
                  Yes, Go Back
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowBackConfirm(true)}
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

              {/* Saved Cards Selection */}
              {savedCards.length > 0 && (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Choose Payment Method
                  </label>
                  
                  <div className="space-y-2">
                    {savedCards.map((card) => (
                      <div
                        key={card.cardId}
                        onClick={() => {
                          setSelectedCardId(card.cardId)
                          setUseNewCard(false)
                        }}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          selectedCardId === card.cardId && !useNewCard
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {selectedCardId === card.cardId && !useNewCard && (
                              <Check className="w-5 h-5 text-primary-600" />
                            )}
                            <CreditCard className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium">{card.cardHolderName}</p>
                              <p className="text-sm text-gray-600">{card.cardNumber}</p>
                              <p className="text-xs text-gray-500">Expires: {card.expiryDate}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    onClick={() => {
                      setUseNewCard(true)
                      setSelectedCardId(null)
                    }}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      useNewCard
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {useNewCard && <Check className="w-5 h-5 text-primary-600" />}
                      <Plus className="w-5 h-5 text-gray-400" />
                      <span className="font-medium">Use New Card</span>
                    </div>
                  </div>
                </div>
              )}

              {/* New Card Form - Only show if no saved cards or user selected "Use New Card" */}
              {useNewCard || savedCards.length === 0 ? (
                <>
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-4">Card Details</h3>
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
                        className="input-field pl-10 text-gray-900"
                        placeholder="1234 5678 9012 3456"
                        required={useNewCard || savedCards.length === 0}
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
                      className="input-field text-gray-900"
                      placeholder="John Doe"
                      required={useNewCard || savedCards.length === 0}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expiry Date (MM/YY)
                      </label>
                      <input
                        type="text"
                        maxLength="5"
                        value={paymentData.expiryDate}
                        onChange={(e) => setPaymentData({
                          ...paymentData,
                          expiryDate: formatExpiryDate(e.target.value),
                        })}
                        className="input-field text-gray-900"
                        placeholder="MM/YY"
                        required={useNewCard || savedCards.length === 0}
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
                        className="input-field text-gray-900"
                        placeholder="123"
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Show only CVV for saved card */
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
                    className="input-field text-gray-900"
                    placeholder="Enter CVV"
                    required
                  />
                </div>
              )}

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

