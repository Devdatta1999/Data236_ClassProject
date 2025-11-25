import { Link, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { ShoppingCart, User, LogOut, Menu } from 'lucide-react'
import { useState } from 'react'
import { logout } from '../../store/slices/authSlice'
import { clearCart } from '../../store/slices/cartSlice'

const Navbar = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { isAuthenticated, user, userType } = useSelector((state) => state.auth)
  const { items } = useSelector((state) => state.cart)
  const [showMenu, setShowMenu] = useState(false)

  const handleLogout = () => {
    dispatch(logout())
    dispatch(clearCart())
    navigate('/')
  }

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="text-2xl font-bold text-primary-600">Aerive</div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {!isAuthenticated ? (
              <>
                <Link to="/" className="text-gray-700 hover:text-primary-600 transition-colors">
                  Flights
                </Link>
                <Link to="/" className="text-gray-700 hover:text-primary-600 transition-colors">
                  Hotels
                </Link>
                <Link to="/" className="text-gray-700 hover:text-primary-600 transition-colors">
                  Cars
                </Link>
                <div className="flex items-center space-x-4">
                  <Link
                    to="/login"
                    className="text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    to="/host/register"
                    className="text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    Host Register
                  </Link>
                  <Link
                    to="/admin/register"
                    className="text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    Admin Register
                  </Link>
                  <Link
                    to="/signup"
                    className="btn-primary"
                  >
                    Sign Up
                  </Link>
                </div>
              </>
            ) : (
              <>
                {userType === 'traveler' && (
                  <>
                    <Link
                      to="/dashboard"
                      className="text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      Search
                    </Link>
                    <Link
                      to="/my-bookings"
                      className="text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      My Bookings
                    </Link>
                    <Link
                      to="/checkout"
                      className="relative text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      <ShoppingCart className="w-6 h-6" />
                      {cartCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {cartCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}
                <div className="flex items-center space-x-4">
                  <Link
                    to={userType === 'traveler' ? '/profile' : userType === 'admin' ? '/admin' : '/host'}
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    <User className="w-5 h-5" />
                    <span>{user?.firstName || 'Profile'}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 text-gray-700 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
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
                <Link to="/" className="block text-gray-700 hover:text-primary-600">
                  Flights
                </Link>
                <Link to="/" className="block text-gray-700 hover:text-primary-600">
                  Hotels
                </Link>
                <Link to="/" className="block text-gray-700 hover:text-primary-600">
                  Cars
                </Link>
                <Link to="/login" className="block text-gray-700 hover:text-primary-600">
                  Login
                </Link>
                <Link to="/host/register" className="block text-gray-700 hover:text-primary-600">
                  Host Register
                </Link>
                <Link to="/admin/register" className="block text-gray-700 hover:text-primary-600">
                  Admin Register
                </Link>
                <Link to="/signup" className="block btn-primary text-center">
                  Sign Up
                </Link>
              </>
            ) : (
              <>
                {userType === 'traveler' && (
                  <>
                    <Link to="/dashboard" className="block text-gray-700 hover:text-primary-600">
                      Search
                    </Link>
                    <Link to="/my-bookings" className="block text-gray-700 hover:text-primary-600">
                      My Bookings
                    </Link>
                    <Link to="/checkout" className="block text-gray-700 hover:text-primary-600">
                      Cart ({cartCount})
                    </Link>
                  </>
                )}
                <Link
                  to={userType === 'traveler' ? '/profile' : userType === 'admin' ? '/admin' : '/host'}
                  className="block text-gray-700 hover:text-primary-600"
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="block text-gray-700 hover:text-red-600"
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

