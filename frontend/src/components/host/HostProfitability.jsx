import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../../services/apiService'

const HostProfitability = ({ profitability }) => {
  const { user } = useSelector((state) => state.auth)
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)

  // Get providerId from user
  const providerId = user?.providerId || (() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      return storedUser?.providerId || null
    } catch (e) {
      return null
    }
  })()

  useEffect(() => {
    if (providerId) {
      fetchProfitabilityData()
    } else {
      setLoading(false)
    }
  }, [providerId])

  const fetchProfitabilityData = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/api/analytics/host/${providerId}/profitability`)
      if (response?.data?.success && response.data.data?.monthlyRevenue) {
        // Transform monthlyRevenue to chart format
        const chartData = response.data.data.monthlyRevenue.map(item => ({
          month: item.monthName,
          revenue: item.revenue || 0,
          bookings: item.bookingCount || 0
        }))
        setMonthlyData(chartData)
      } else {
        // Fallback to empty data
        setMonthlyData([])
      }
    } catch (error) {
      console.error('Failed to fetch profitability data:', error)
      setMonthlyData([])
    } finally {
      setLoading(false)
    }
  }

  // Use real data if available, otherwise show empty
  const revenueData = monthlyData.length > 0 ? monthlyData : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profitability data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-xl font-semibold mb-4">Revenue Trend</h3>
        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue ($)" />
          </LineChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>No revenue data available</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-xl font-semibold mb-4">Bookings Trend</h3>
        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="bookings" fill="#10b981" name="Bookings" />
          </BarChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>No bookings data available</p>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Revenue:</span>
              <span className="font-semibold">${profitability.totalRevenue?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Listings:</span>
              <span className="font-semibold">{profitability.totalListings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Average Rating:</span>
              <span className="font-semibold">{profitability.averageRating || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Bookings:</span>
              <span className="font-semibold">{profitability.bookingsCount || 0}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Performance Insights</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Your listings are performing well! You've seen a steady increase in bookings over the past few months.
            </p>
            <p>
              Consider adding more listings to increase your revenue potential.
            </p>
            <p>
              Your average rating of {profitability.averageRating || 0} stars shows that travelers are satisfied with your offerings.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HostProfitability

