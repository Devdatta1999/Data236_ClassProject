import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Plane, Hotel, Car, Search } from 'lucide-react'
import { setSearchType } from '../../store/slices/searchSlice'
import SearchBar from '../../components/search/SearchBar'

const TravelerDashboard = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [activeTab, setActiveTab] = useState('flights')

  const handleSearch = (searchParams) => {
    dispatch(setSearchType(activeTab))
    navigate('/search', { state: { searchParams, type: activeTab } })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Welcome back!</h1>
          <p className="text-xl text-primary-100 mb-8">
            Search and book your next adventure
          </p>

          {/* Search Tabs */}
          <div className="max-w-4xl">
            <div className="flex space-x-4 mb-6 bg-white/10 backdrop-blur-sm rounded-t-lg p-2">
              <button
                onClick={() => setActiveTab('flights')}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-6 rounded-lg transition-all ${
                  activeTab === 'flights'
                    ? 'bg-white text-primary-600 font-semibold'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <Plane className="w-5 h-5" />
                <span>Flights</span>
              </button>
              <button
                onClick={() => setActiveTab('hotels')}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-6 rounded-lg transition-all ${
                  activeTab === 'hotels'
                    ? 'bg-white text-primary-600 font-semibold'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <Hotel className="w-5 h-5" />
                <span>Hotels</span>
              </button>
              <button
                onClick={() => setActiveTab('cars')}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-6 rounded-lg transition-all ${
                  activeTab === 'cars'
                    ? 'bg-white text-primary-600 font-semibold'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <Car className="w-5 h-5" />
                <span>Cars</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-b-lg shadow-2xl p-6">
              <SearchBar type={activeTab} onSearch={handleSearch} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="card hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/my-bookings')}>
            <h3 className="text-xl font-semibold mb-2">My Bookings</h3>
            <p className="text-gray-600">View and manage your bookings</p>
          </div>
          <div className="card hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/profile')}>
            <h3 className="text-xl font-semibold mb-2">Profile</h3>
            <p className="text-gray-600">Update your profile and preferences</p>
          </div>
          <div className="card hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/checkout')}>
            <h3 className="text-xl font-semibold mb-2">Cart</h3>
            <p className="text-gray-600">Review items in your cart</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TravelerDashboard

