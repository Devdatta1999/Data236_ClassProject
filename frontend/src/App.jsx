import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
// Kafka proxy handles connection, no need to initialize
import { loginSuccess } from './store/slices/authSlice'

// Layouts
import Navbar from './components/layout/Navbar'
import ProtectedRoute from './components/auth/ProtectedRoute'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import HostSignupPage from './pages/HostSignupPage'
import AdminSignupPage from './pages/AdminSignupPage'
import TravelerDashboard from './pages/traveler/TravelerDashboard'
import SearchResults from './pages/traveler/SearchResults'
import BookingDetails from './pages/traveler/BookingDetails'
import HotelDetailPage from './pages/traveler/HotelDetailPage'
import FlightDetailPage from './pages/traveler/FlightDetailPage'
import CheckoutPage from './pages/traveler/CheckoutPage'
import PaymentPage from './pages/traveler/PaymentPage'
import MyBookings from './pages/traveler/MyBookings'
import ProfilePage from './pages/traveler/ProfilePage'
import AdminDashboard from './pages/admin/AdminDashboard'
import HostDashboard from './pages/host/HostDashboard'

function App() {
  const dispatch = useDispatch()
  const { isAuthenticated } = useSelector((state) => state.auth)

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
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
        
        {/* Host Routes */}
        <Route
          path="/host"
          element={
            <ProtectedRoute userType="host">
              <HostDashboard />
            </ProtectedRoute>
          }
        />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}

export default App

