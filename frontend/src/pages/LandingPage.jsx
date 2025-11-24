import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Plane, Hotel, Car, Search, ArrowRight } from 'lucide-react'
import { setSearchType } from '../store/slices/searchSlice'
import SearchBar from '../components/search/SearchBar'

const LandingPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [activeTab, setActiveTab] = useState('flights')

  const handleSearch = (searchParams) => {
    dispatch(setSearchType(activeTab))
    navigate('/search', { state: { searchParams, type: activeTab } })
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 text-white">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Your Journey Starts Here
            </h1>
            <p className="text-xl md:text-2xl mb-12 text-primary-100">
              Search, compare, and book flights, hotels, and cars all in one place
            </p>
          </div>

          {/* Search Tabs */}
          <div className="max-w-4xl mx-auto">
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

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plane className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Best Flight Deals</h3>
            <p className="text-gray-600">
              Compare prices from hundreds of airlines to find the best deals
            </p>
          </div>
          <div className="text-center">
            <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Hotel className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Premium Hotels</h3>
            <p className="text-gray-600">
              Discover amazing hotels with verified reviews and ratings
            </p>
          </div>
          <div className="text-center">
            <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Car className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Car Rentals</h3>
            <p className="text-gray-600">
              Rent a car from trusted providers at competitive prices
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Your Adventure?</h2>
          <p className="text-xl mb-8 text-primary-100">
            Join thousands of travelers who trust Aerive for their bookings
          </p>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/signup')}
              className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors inline-flex items-center space-x-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/host/register')}
              className="bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors inline-flex items-center space-x-2 border-2 border-white"
            >
              <span>Become a Host</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LandingPage

