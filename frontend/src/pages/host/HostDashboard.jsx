import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setProvider, setListings, setProfitability } from '../../store/slices/hostSlice'
import api from '../../services/apiService'
import { Plus, TrendingUp, DollarSign, List, Star, BarChart3, Package } from 'lucide-react'
import CreateListingRequest from '../../components/host/CreateListingRequest'
import HostAnalyticsTab from '../../components/host/HostAnalyticsTab'
import MyListingsTab from '../../components/host/MyListingsTab'

const HostDashboard = () => {
  const dispatch = useDispatch()
  const { provider, listings, profitability } = useSelector((state) => state.host)
  const { user } = useSelector((state) => state.auth)
  // Use lazy initialization for useState to ensure localStorage is read on mount
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('hostDashboardTab') || 'overview'
    } catch (e) {
      return 'overview'
    }
  })

  useEffect(() => {
    fetchProviderData()
    fetchListings()
    fetchProfitability()
    
    // Restore tab from localStorage on mount
    try {
      const savedTab = localStorage.getItem('hostDashboardTab')
      if (savedTab && ['overview', 'listings', 'create', 'profitability'].includes(savedTab)) {
        setActiveTab(savedTab)
      }
    } catch (e) {
      console.error('Failed to read tab from localStorage:', e)
    }
  }, [])

  const fetchProviderData = async () => {
    try {
      // Fetch provider data based on logged-in user
      // This would typically use the user's email or providerId
      const response = await api.get('/api/providers/me')
      if (response.data.data) {
        dispatch(setProvider(response.data.data.provider))
      }
    } catch (err) {
      console.error('Error fetching provider data:', err)
    }
  }

  const fetchListings = async () => {
    try {
      const response = await api.get('/api/providers/listings')
      if (response.data.data) {
        dispatch(setListings(response.data.data.listings || []))
      }
    } catch (err) {
      console.error('Error fetching listings:', err)
    }
  }

  const fetchProfitability = async () => {
    try {
      // Fetch profitability data
      dispatch(setProfitability({
        totalRevenue: 125000,
        totalListings: listings.length || 0,
        averageRating: 4.5,
        bookingsCount: 320,
      }))
    } catch (err) {
      console.error('Error fetching profitability:', err)
    }
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'listings', label: 'My Listings', icon: Package },
    { id: 'create', label: 'Create Listing Request', icon: Plus },
    { id: 'profitability', label: 'Profitability', icon: TrendingUp },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-2">Host Dashboard</h1>
          <p className="text-blue-100">Manage your listings and track your success</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    const newTab = tab.id
                    setActiveTab(newTab)
                    // Persist to localStorage
                    try {
                      localStorage.setItem('hostDashboardTab', newTab)
                    } catch (e) {
                      console.error('Failed to save tab to localStorage:', e)
                    }
                  }}
                  className={`flex items-center space-x-2 px-6 py-4 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-4 gap-6">
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold">${profitability.totalRevenue?.toLocaleString() || 0}</p>
                  </div>
                  <div className="bg-green-500 p-3 rounded-lg">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Total Listings</p>
                    <p className="text-2xl font-bold">{profitability.totalListings || 0}</p>
                  </div>
                  <div className="bg-blue-500 p-3 rounded-lg">
                    <List className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Average Rating</p>
                    <p className="text-2xl font-bold">{profitability.averageRating || 0}</p>
                  </div>
                  <div className="bg-yellow-500 p-3 rounded-lg">
                    <Star className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Total Bookings</p>
                    <p className="text-2xl font-bold">{profitability.bookingsCount || 0}</p>
                  </div>
                  <div className="bg-purple-500 p-3 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="text-xl font-semibold mb-4">Why List on Aerive?</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-blue-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Reach More Travelers</h4>
                  <p className="text-gray-600 text-sm">
                    Access thousands of potential customers looking for travel options
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-8 h-8 text-green-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Increase Revenue</h4>
                  <p className="text-gray-600 text-sm">
                    Boost your bookings and revenue with our platform
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Star className="w-8 h-8 text-purple-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Build Reputation</h4>
                  <p className="text-gray-600 text-sm">
                    Get reviews and ratings to build trust with travelers
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'listings' && <MyListingsTab onRefresh={fetchListings} />}
        {activeTab === 'create' && <CreateListingRequest onSuccess={fetchListings} />}
        {activeTab === 'profitability' && <HostAnalyticsTab />}
      </div>
    </div>
  )
}

export default HostDashboard

