import { Link, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { ShoppingCart, User, LogOut, Menu, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { logout } from '../../store/slices/authSlice'
import { clearCart } from '../../store/slices/cartSlice'
import api from '../../services/apiService'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source - handles various image path formats
const getImageSrc = (imagePath) => {
  if (!imagePath) return ''
  // If it's already a full URL (http/https), return as is
  if (imagePath.startsWith('http')) return imagePath
  // If it already starts with /api/, prepend API_BASE_URL
  if (imagePath.startsWith('/api/')) {
    return `${API_BASE_URL}${imagePath}`
  }
  // Otherwise, construct the path
  return `${API_BASE_URL}${imagePath}`
}

const Navbar = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { isAuthenticated, user, userType } = useSelector((state) => state.auth)
  const { items } = useSelector((state) => state.cart)
  const [showMenu, setShowMenu] = useState(false)
  const [showSignupDropdown, setShowSignupDropdown] = useState(false)
  const signupDropdownRef = useRef(null)

  const handleLogout = () => {
    dispatch(logout())
    dispatch(clearCart())
    navigate('/')
  }

  // Mark pending bookings as Failed when cart icon is clicked
  // This ensures bookings from failed payments are freed up when user tries to checkout again
  const handleCartClick = async (e) => {
    e.preventDefault()
    
    if (user?.userId && userType === 'traveler') {
      try {
        // Get user's pending bookings
        const response = await api.get(`/api/bookings/user/${user.userId}`)
        const bookings = response.data.data?.bookings || []
        
        const pendingBookings = bookings.filter(b => b.status === 'Pending')
        
        if (pendingBookings.length > 0) {
          const bookingIds = pendingBookings.map(b => b.bookingId)
          
          console.log(`[Navbar] Found ${pendingBookings.length} pending booking(s), marking as Failed...`)
          
          // Mark as Failed in background (don't wait for it)
          api.post('/api/bookings/fail', { bookingIds }, {
            timeout: 5000
          }).then(() => {
            console.log(`[Navbar] Successfully marked ${pendingBookings.length} booking(s) as Failed`)
          }).catch(err => {
            console.error('[Navbar] Error marking bookings as Failed:', err)
          })
        }
      } catch (err) {
        console.error('[Navbar] Error checking bookings:', err)
        // Continue to navigate even if this fails
      }
    }
    
    // Navigate to checkout
    navigate('/checkout')
  }

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (signupDropdownRef.current && !signupDropdownRef.current.contains(event.target)) {
        setShowSignupDropdown(false)
      }
    }

    if (showSignupDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSignupDropdown])

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          {(userType === 'admin' || userType === 'host') ? (
            <div className="flex items-center space-x-2 cursor-default">
              <div className="text-2xl font-bold text-primary-600">Aerive</div>
            </div>
          ) : (
            <Link to="/" className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-primary-600">Aerive</div>
            </Link>
          )}

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {!isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Login
                </Link>
                {/* Sign Up Dropdown */}
                <div className="relative" ref={signupDropdownRef}>
                  <button
                    onClick={() => setShowSignupDropdown(!showSignupDropdown)}
                    className="btn-primary flex items-center space-x-1"
                  >
                    <span>Sign Up</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showSignupDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showSignupDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                      <Link
                        to="/signup"
                        onClick={() => setShowSignupDropdown(false)}
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Traveler
                      </Link>
                      <Link
                        to="/host/register"
                        onClick={() => setShowSignupDropdown(false)}
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Host
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {userType === 'traveler' && (
                  <>
                    <Link
                      to="/dashboard"
                      className="text-gray-700 hover:text-primary-600 transition-colors font-medium"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/checkout"
                      onClick={handleCartClick}
                      className="relative text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      <ShoppingCart className="w-6 h-6" />
                      {cartCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                          {cartCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}
                <div className="flex items-center space-x-4">
                  <Link
                    to={userType === 'traveler' ? '/profile' : userType === 'admin' ? '/admin' : '/host/profile'}
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      {user?.profileImage ? (
                        <img
                          key={`navbar-profile-${user.profileImage}`}
                          src={getImageSrc(user.profileImage)}
                          alt="Profile"
                          className="w-8 h-8 rounded-full object-cover border-2 border-gray-300 absolute"
                          loading="eager"
                          decoding="async"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            const icon = e.target.parentElement.querySelector('.profile-icon-fallback')
                            if (icon) icon.style.display = 'block'
                          }}
                          onLoad={(e) => {
                            e.target.style.opacity = '1'
                            e.target.style.display = 'block'
                          }}
                        />
                      ) : null}
                      <User className={`w-5 h-5 profile-icon-fallback ${user?.profileImage ? 'hidden' : ''} absolute`} />
                    </div>
                    <span>{user?.firstName || user?.providerName || user?.adminName || 'Profile'}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200 border border-transparent hover:border-red-200"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-gray-700"
            onClick={() => setShowMenu(!showMenu)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Menu */}
        {showMenu && (
          <div className="md:hidden py-4 space-y-4">
            {!isAuthenticated ? (
              <>
                <Link 
                  to="/login" 
                  onClick={() => setShowMenu(false)}
                  className="block text-gray-700 hover:text-primary-600"
                >
                  Login
                </Link>
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-500 px-2">Sign Up as:</p>
                  <Link 
                    to="/signup" 
                    onClick={() => setShowMenu(false)}
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    Traveler
                  </Link>
                  <Link 
                    to="/host/register" 
                    onClick={() => setShowMenu(false)}
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    Host
                  </Link>
                </div>
              </>
            ) : (
              <>
                {userType === 'traveler' && (
                  <>
                    <Link to="/dashboard" className="block text-gray-700 hover:text-primary-600">
                      Dashboard
                    </Link>
                    <Link 
                      to="/checkout" 
                      onClick={handleCartClick}
                      className="block text-gray-700 hover:text-primary-600"
                    >
                      Cart ({cartCount})
                    </Link>
                  </>
                )}
                <Link
                  to={userType === 'traveler' ? '/profile' : userType === 'admin' ? '/admin' : '/host/profile'}
                  className="block text-gray-700 hover:text-primary-600"
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200 border border-transparent hover:border-red-200 font-medium"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar

