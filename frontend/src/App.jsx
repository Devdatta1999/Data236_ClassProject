import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
// Kafka proxy handles connection, no need to initialize
import { loginSuccess } from './store/slices/authSlice'

// Layouts
import Navbar from './components/layout/Navbar'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AIChatModal from './components/chat/AIChatModal'
import Notification from './components/common/Notification'
import useRecommendationEvents from './hooks/useRecommendationEvents'

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
                onClose={() => dispatch({ type: 'notifications/removeNotification', payload: n.id })}
                duration={6000}
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

