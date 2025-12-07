import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
// Kafka proxy handles connection, no need to initialize
import { loginSuccess } from './store/slices/authSlice'
import { clearCart, addToCart } from './store/slices/cartSlice'

// Layouts
import Navbar from './components/layout/Navbar'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AIChatModal from './components/chat/AIChatModal'
import Notification from './components/common/Notification'
import useRecommendationEvents from './hooks/useRecommendationEvents'
import { removeNotification } from './store/slices/notificationSlice'
import { selectBundle } from './services/chatService'
import { differenceInDays } from 'date-fns'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import HostSignupPage from './pages/HostSignupPage'
import AdminSignupPage from './pages/AdminSignupPage'
import TravelerDashboard from './pages/traveler/TravelerDashboard'
import SearchResults from './pages/traveler/SearchResults'
import BookingDetails from './pages/traveler/BookingDetails'
import BookingGroupDetails from './pages/traveler/BookingGroupDetails'
import HotelDetailPage from './pages/traveler/HotelDetailPage'
import FlightDetailPage from './pages/traveler/FlightDetailPage'
import CarDetailPage from './pages/traveler/CarDetailPage'
import CheckoutPage from './pages/traveler/CheckoutPage'
import PaymentPage from './pages/traveler/PaymentPage'
import AIPaymentQuotePage from './pages/traveler/AIPaymentQuotePage'
import MyBookings from './pages/traveler/MyBookings'
import ProfilePage from './pages/traveler/ProfilePage'
import AdminDashboard from './pages/admin/AdminDashboard'
import EditUserPage from './pages/admin/EditUserPage'
import HostDashboard from './pages/host/HostDashboard'
import HostProfilePage from './pages/host/HostProfilePage'

function App() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isAuthenticated, userType } = useSelector((state) => state.auth)
  const notifications = useSelector((state) => state.notifications.items)

  useRecommendationEvents()

  useEffect(() => {
    // Restore auth state from localStorage
    const token = localStorage.getItem('token')
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const userType = localStorage.getItem('userType')

    if (token && user && userType) {
      dispatch(loginSuccess({ token, user, userType }))
    }
  }, [dispatch])

  const handleNotificationAction = async (notification) => {
    // If this is a price drop notification, refresh the quote with new prices
    if (notification.metadata?.shouldRefreshQuote && notification.metadata?.bundleId && notification.metadata?.sessionId) {
      try {
        // Fetch the updated bundle quote with discounted price
        console.log('[Price Drop] Fetching bundle:', {
          sessionId: notification.metadata.sessionId,
          bundleId: notification.metadata.bundleId
        })
        const response = await selectBundle(notification.metadata.sessionId, notification.metadata.bundleId)
        console.log('[Price Drop] selectBundle response:', response)

        if (response.success && response.quote) {
          const quote = response.quote
          console.log('[Price Drop] Quote details:', {
            flights: quote.flights,
            hotels: quote.hotels,
            travel_dates: quote.travel_dates,
            travelers: quote.travelers,
            total_price: quote.total_price_usd
          })

          // Clear cart and wait a bit to ensure it's cleared
          dispatch(clearCart())
          // Also force-clear localStorage to ensure no stale data
          localStorage.removeItem('cart')
          console.log('[Price Drop] Cart cleared, localStorage removed')

          // Small delay to ensure clearCart completes before adding new items
          await new Promise(resolve => setTimeout(resolve, 100))

          const departureDateStr = quote.travel_dates?.departure_date || null
          const returnDateStr = quote.travel_dates?.return_date || null

          // Add flights to cart
          for (const flight of quote.flights || []) {
            const travelers = Math.max(quote.travelers || 1, 1)
            const pricePerPerson = Number(flight.price_usd || 0)  // This is already per-person price
            const totalFlightPrice = pricePerPerson * travelers

            const flightCartItem = {
              listingId: flight.external_id,
              listingType: 'Flight',
              listingName: `${flight.origin} → ${flight.destination}`,
              roomType: 'Economy',
              quantity: travelers,
              price: pricePerPerson,  // Price per person
              totalPrice: totalFlightPrice,  // Total for all travelers
              travelDate: flight.departure_date,
              returnDate: flight.return_date,
              address: `${flight.origin} → ${flight.destination}`,
            }
            console.log('[Price Drop] Adding flight to cart:', flightCartItem)
            dispatch(addToCart(flightCartItem))
          }

          // Add hotels to cart
          for (const hotel of quote.hotels || []) {
            const checkIn = departureDateStr ? new Date(departureDateStr) : new Date(hotel.check_in_date)
            const checkOut = returnDateStr ? new Date(returnDateStr) : new Date(hotel.check_out_date)
            const nights = Math.max(differenceInDays(checkOut, checkIn), 1)
            const totalHotelPrice = Number(hotel.total_price_usd || 0)
            const pricePerNight = nights > 0 ? totalHotelPrice / nights : totalHotelPrice
            // Default to 1 room to match the bundle pricing
            // Users can manually adjust quantity in cart if needed
            const quantity = 1

            const hotelCartItem = {
              listingId: hotel.external_id,
              listingType: 'Hotel',
              listingName: hotel.hotel_name,
              roomType: 'Standard',
              quantity,
              pricePerNight: Number(pricePerNight.toFixed(2)),
              totalPrice: totalHotelPrice,
              checkInDate: checkIn.toISOString(),
              checkOutDate: checkOut.toISOString(),
              numberOfNights: nights,
              address: hotel.city,
            }
            console.log('[Price Drop] Adding hotel to cart:', {
              ...hotelCartItem,
              checkIn: checkIn.toISOString(),
              checkOut: checkOut.toISOString(),
              departureDateStr,
              returnDateStr,
              nights
            })
            dispatch(addToCart(hotelCartItem))
          }

          console.log('[Price Drop] All items added to cart, waiting before navigation')

          // Wait for Redux state to update before navigating
          // Use setTimeout to ensure cart state is fully updated
          setTimeout(() => {
            console.log('[Price Drop] Navigating to:', notification.actionPath)
            if (notification.actionPath) {
              navigate(notification.actionPath)
            }
            dispatch(removeNotification(notification.id))
          }, 150)
          return  // Exit early to prevent double navigation/removal
        }
      } catch (error) {
        console.error('Error refreshing quote:', error)
      }
    }

    // Navigate to the action path (for non-price-drop notifications)
    if (notification.actionPath) {
      navigate(notification.actionPath)
    }

    dispatch(removeNotification(notification.id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {/* Global notification bar (top of app) */}
      {notifications && notifications.length > 0 && (
        <div className="fixed top-16 left-0 right-0 z-40 flex flex-col items-center px-4">
          <div className="w-full max-w-3xl">
            {notifications.map((n) => (
              <Notification
                key={n.id}
                type={n.type}
                message={n.message}
                onClose={() => dispatch(removeNotification(n.id))}
                duration={n.actionLabel ? null : 6000}
                actionLabel={n.actionLabel}
                onAction={n.actionPath ? () => handleNotificationAction(n) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated && (userType === 'admin' || userType === 'host') ? (
              <Navigate to={userType === 'admin' ? '/admin' : '/host'} replace />
            ) : (
              <LandingPage />
            )
          } 
        />
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" />} />
        <Route path="/signup" element={!isAuthenticated ? <SignupPage /> : <Navigate to="/dashboard" />} />
        <Route path="/host/register" element={!isAuthenticated ? <HostSignupPage /> : <Navigate to="/host" />} />
        <Route path="/admin/register" element={!isAuthenticated ? <AdminSignupPage /> : <Navigate to="/admin" />} />
        
        {/* Traveler Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute userType="traveler">
              <TravelerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute userType="traveler">
              <SearchResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/booking/:bookingId"
          element={
            <ProtectedRoute userType="traveler">
              <BookingDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/booking-group/:billingId"
          element={
            <ProtectedRoute userType="traveler">
              <BookingGroupDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/:hotelId"
          element={
            <ProtectedRoute userType="traveler">
              <HotelDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/flight/:flightId"
          element={
            <ProtectedRoute userType="traveler">
              <FlightDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/car/:carId"
          element={
            <ProtectedRoute userType="traveler">
              <CarDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute userType="traveler">
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <ProtectedRoute userType="traveler">
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai/quote/:quoteId"
          element={
            <ProtectedRoute userType="traveler">
              <AIPaymentQuotePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <ProtectedRoute userType="traveler">
              <MyBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute userType="traveler">
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        
        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute userType="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:userId/edit"
          element={
            <ProtectedRoute userType="admin">
              <EditUserPage />
            </ProtectedRoute>
          }
        />
        
        {/* Host Routes */}
        <Route
          path="/host"
          element={
            <ProtectedRoute userType="host">
              <HostDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/host/profile"
          element={
            <ProtectedRoute userType="host">
              <HostProfilePage />
            </ProtectedRoute>
          }
        />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <AIChatModal />
    </div>
  )
}

export default App

