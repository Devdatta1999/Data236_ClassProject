import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Users, TrendingUp, DollarSign, List } from 'lucide-react'

const AdminAnalyticsTab = ({ analytics }) => {
  const data = [
    { name: 'Total Users', value: analytics.totalUsers || 0, icon: Users, color: 'bg-blue-500' },
    { name: 'Total Bookings', value: analytics.totalBookings || 0, icon: TrendingUp, color: 'bg-green-500' },
    { name: 'Total Revenue', value: `$${analytics.totalRevenue || 0}`, icon: DollarSign, color: 'bg-purple-500' },
    { name: 'Active Listings', value: analytics.activeListings || 0, icon: List, color: 'bg-orange-500' },
  ]

  const chartData = [
    { name: 'Users', value: analytics.totalUsers || 0 },
    { name: 'Bookings', value: analytics.totalBookings || 0 },
    { name: 'Listings', value: analytics.activeListings || 0 },
  ]

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-6">
        {data.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.name} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{item.name}</p>
                  <p className="text-2xl font-bold">{item.value}</p>
                </div>
                <div className={`${item.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-xl font-semibold mb-4">Platform Statistics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-xl font-semibold mb-4">Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default AdminAnalyticsTab

