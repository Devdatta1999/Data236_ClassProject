import { useEffect, useState } from 'react'
import api from '../../services/apiService'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { TrendingUp, DollarSign, List, Star } from 'lucide-react'

const HostAnalyticsTab = () => {
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    totalListings: 0,
    averageRating: 0,
    bookingsCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHostAnalytics()
  }, [])

  const fetchHostAnalytics = async () => {
    try {
      // This would fetch aggregated host/provider analytics
      // For now, using placeholder data
      setAnalytics({
        totalRevenue: 125000,
        totalListings: 45,
        averageRating: 4.5,
        bookingsCount: 320,
      })
    } catch (err) {
      console.error('Error fetching host analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const revenueData = [
    { month: 'Jan', revenue: 10000 },
    { month: 'Feb', revenue: 15000 },
    { month: 'Mar', revenue: 12000 },
    { month: 'Apr', revenue: 18000 },
    { month: 'May', revenue: 20000 },
    { month: 'Jun', revenue: 25000 },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading analytics...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Total Revenue</p>
              <p className="text-2xl font-bold">${analytics.totalRevenue.toLocaleString()}</p>
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
              <p className="text-2xl font-bold">{analytics.totalListings}</p>
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
              <p className="text-2xl font-bold">{analytics.averageRating}</p>
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
              <p className="text-2xl font-bold">{analytics.bookingsCount}</p>
            </div>
            <div className="bg-purple-500 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-xl font-semibold mb-4">Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default HostAnalyticsTab

