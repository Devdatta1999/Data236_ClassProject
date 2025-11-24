import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setPendingListings, setSelectedTab, setAnalytics, setLoading } from '../../store/slices/adminSlice'
import api from '../../services/apiService'
import { CheckCircle, XCircle, Plus, BarChart3, Users, TrendingUp, ListChecks } from 'lucide-react'
import PendingRequestsTab from '../../components/admin/PendingRequestsTab'
import ApprovedListingsTab from '../../components/admin/ApprovedListingsTab'
import CreateListingTab from '../../components/admin/CreateListingTab'
import AdminAnalyticsTab from '../../components/admin/AdminAnalyticsTab'
import HostAnalyticsTab from '../../components/admin/HostAnalyticsTab'

const AdminDashboard = () => {
  const dispatch = useDispatch()
  const { selectedTab, pendingListings, analytics } = useSelector((state) => state.admin)
  const [loading, setLoadingState] = useState(false)

  useEffect(() => {
    fetchPendingListings()
    fetchAnalytics()
  }, [])

  const fetchPendingListings = async () => {
    setLoadingState(true)
    try {
      const response = await api.get('/api/admin/listings/pending')
      const data = response.data.data?.pendingListings || {}
      
      if (data.flights) dispatch(setPendingListings({ type: 'flights', listings: data.flights }))
      if (data.hotels) dispatch(setPendingListings({ type: 'hotels', listings: data.hotels }))
      if (data.cars) dispatch(setPendingListings({ type: 'cars', listings: data.cars }))
    } catch (err) {
      console.error('Error fetching pending listings:', err)
    } finally {
      setLoadingState(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      // Fetch admin analytics
      const adminResponse = await api.get('/api/admin/analytics')
      if (adminResponse.data.data) {
        dispatch(setAnalytics(adminResponse.data.data))
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
    }
  }

  const tabs = [
    { id: 'requests', label: 'Pending Requests', icon: CheckCircle },
    { id: 'approved', label: 'Approved Listings', icon: ListChecks },
    { id: 'create', label: 'Create Listing', icon: Plus },
    { id: 'admin-dashboard', label: 'Admin Dashboard', icon: BarChart3 },
    { id: 'host-dashboard', label: 'Host Dashboard', icon: TrendingUp },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-purple-100">Manage listings, users, and platform analytics</p>
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
                  onClick={() => dispatch(setSelectedTab(tab.id))}
                  className={`flex items-center space-x-2 px-6 py-4 border-b-2 transition-colors ${
                    selectedTab === tab.id
                      ? 'border-purple-600 text-purple-600'
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
        {selectedTab === 'requests' && <PendingRequestsTab onRefresh={fetchPendingListings} />}
        {selectedTab === 'approved' && <ApprovedListingsTab onRefresh={fetchPendingListings} />}
        {selectedTab === 'create' && <CreateListingTab />}
        {selectedTab === 'admin-dashboard' && <AdminAnalyticsTab analytics={analytics} />}
        {selectedTab === 'host-dashboard' && <HostAnalyticsTab />}
      </div>
    </div>
  )
}

export default AdminDashboard

