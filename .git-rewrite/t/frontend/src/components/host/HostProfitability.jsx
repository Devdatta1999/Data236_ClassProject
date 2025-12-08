import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const HostProfitability = ({ profitability }) => {
  const revenueData = [
    { month: 'Jan', revenue: 10000, bookings: 25 },
    { month: 'Feb', revenue: 15000, bookings: 35 },
    { month: 'Mar', revenue: 12000, bookings: 30 },
    { month: 'Apr', revenue: 18000, bookings: 45 },
    { month: 'May', revenue: 20000, bookings: 50 },
    { month: 'Jun', revenue: 25000, bookings: 60 },
  ]

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-xl font-semibold mb-4">Revenue Trend</h3>
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
      </div>

      <div className="card">
        <h3 className="text-xl font-semibold mb-4">Bookings Trend</h3>
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

