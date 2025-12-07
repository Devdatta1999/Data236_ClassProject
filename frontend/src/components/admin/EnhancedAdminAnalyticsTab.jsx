/**
 * Enhanced Admin Analytics Dashboard
 * Displays comprehensive analytics with real data from backend
 */

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Users, TrendingUp, DollarSign, List, Calendar, Package } from 'lucide-react';
import api from '../../services/apiService';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const EnhancedAdminAnalyticsTab = () => {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState(null);
  
  const [overview, setOverview] = useState(null);
  const [topProperties, setTopProperties] = useState([]);
  const [cityRevenue, setCityRevenue] = useState([]);
  const [topProviders, setTopProviders] = useState([]);
  const [revenueTrend, setRevenueTrend] = useState([]);

  // Fetch providers list on mount
  useEffect(() => {
    fetchProviders();
  }, []);

  // Fetch all analytics data
  useEffect(() => {
    fetchAnalytics();
  }, [selectedYear, selectedMonth, selectedProviderId]);

  const fetchProviders = async () => {
    try {
      const response = await api.get('/api/analytics/admin/providers');
      if (response?.data?.success) {
        setProviders(response.data.data.providers || []);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const providerParam = selectedProviderId ? `&providerId=${selectedProviderId}` : '';
      const [overviewRes, topPropsRes, cityRevRes, topProvsRes, trendRes] = await Promise.allSettled([
        api.get(`/api/analytics/admin/overview${selectedProviderId ? `?providerId=${selectedProviderId}` : ''}`),
        api.get(`/api/analytics/admin/top-properties?year=${selectedYear}${providerParam}`),
        api.get(`/api/analytics/admin/city-revenue?year=${selectedYear}${providerParam}`),
        api.get(`/api/analytics/admin/top-providers?month=${selectedMonth}&year=${selectedYear}${providerParam}`),
        api.get(`/api/analytics/admin/revenue-trend?year=${selectedYear}${providerParam}`)
      ]);

      // Handle overview
      if (overviewRes.status === 'fulfilled' && overviewRes.value?.data?.success) {
        setOverview(overviewRes.value.data.data);
      } else {
        console.error('Failed to fetch overview:', overviewRes.reason || overviewRes.value?.data);
        setOverview({ totalUsers: 0, totalBookings: 0, totalRevenue: 0, activeListings: 0, pendingListings: 0, recentBookings: 0, breakdown: { flights: 0, hotels: 0, cars: 0 } });
      }

      // Handle top properties
      if (topPropsRes.status === 'fulfilled' && topPropsRes.value?.data?.success) {
        setTopProperties(topPropsRes.value.data.data?.topProperties || []);
      } else {
        console.error('Failed to fetch top properties:', topPropsRes.reason || topPropsRes.value?.data);
        setTopProperties([]);
      }

      // Handle city revenue
      if (cityRevRes.status === 'fulfilled' && cityRevRes.value?.data?.success) {
        setCityRevenue(cityRevRes.value.data.data?.cityRevenue || []);
      } else {
        console.error('Failed to fetch city revenue:', cityRevRes.reason || cityRevRes.value?.data);
        setCityRevenue([]);
      }

      // Handle top providers
      if (topProvsRes.status === 'fulfilled' && topProvsRes.value?.data?.success) {
        setTopProviders(topProvsRes.value.data.data?.topProviders || []);
      } else {
        console.error('Failed to fetch top providers:', topProvsRes.reason || topProvsRes.value?.data);
        setTopProviders([]);
      }

      // Handle revenue trend
      if (trendRes.status === 'fulfilled' && trendRes.value?.data?.success) {
        setRevenueTrend(trendRes.value.data.data?.monthlyRevenue || []);
      } else {
        console.error('Failed to fetch revenue trend:', trendRes.reason || trendRes.value?.data);
        setRevenueTrend([]);
      }

      // Check if all requests failed
      const allFailed = [overviewRes, topPropsRes, cityRevRes, topProvsRes, trendRes].every(
        res => res.status === 'rejected' || !res.value?.data?.success
      );
      
      if (allFailed) {
        setError('Failed to load analytics data. Please check your connection and try again.');
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setError(error.response?.data?.error?.message || error.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const overviewCards = [
    { 
      name: 'Total Users', 
      value: overview?.totalUsers || 0, 
      icon: Users, 
      color: 'bg-blue-500',
      change: '+12% from last month'
    },
    { 
      name: 'Total Bookings', 
      value: overview?.totalBookings || 0, 
      icon: TrendingUp, 
      color: 'bg-green-500',
      change: `${overview?.recentBookings || 0} in last 30 days`
    },
    { 
      name: 'Total Revenue', 
      value: `$${(overview?.totalRevenue || 0).toLocaleString('en-US', {maximumFractionDigits: 2})}`, 
      icon: DollarSign, 
      color: 'bg-purple-500',
      change: '+18% from last month'
    },
    { 
      name: 'Active Listings', 
      value: overview?.activeListings || 0, 
      icon: List, 
      color: 'bg-orange-500',
      change: `${overview?.pendingListings || 0} pending approval`
    },
  ];

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}
          >
            <span className="text-red-700">×</span>
          </button>
        </div>
      )}

      {/* Header with Filters */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h2>
          <p className="text-gray-600">
            {selectedProviderId 
              ? `Viewing analytics for: ${providers.find(p => p.providerId === selectedProviderId)?.providerName || selectedProviderId}`
              : 'Comprehensive platform insights and metrics'}
          </p>
        </div>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Host</label>
            <select
              value={selectedProviderId}
              onChange={(e) => {
                setSelectedProviderId(e.target.value);
                setLoading(true); // Show loading when filter changes
              }}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            >
              <option value="">All Hosts</option>
              {providers.map(provider => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.providerName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[2025, 2024, 2023].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        {overviewCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.name} className="card bg-white shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{item.name}</p>
                  <p className="text-3xl font-bold text-gray-800">{item.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.change}</p>
                </div>
                <div className={`${item.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue Trend */}
      <div className="card bg-white shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Revenue Trend {selectedYear}
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={300} key={`revenue-trend-${selectedProviderId}-${selectedYear}`}>
          <LineChart data={revenueTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="monthName" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue ($)" />
            <Line type="monotone" dataKey="bookingCount" stroke="#10b981" strokeWidth={2} name="Bookings" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Properties and City Revenue */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top 10 Hotel Properties by Revenue */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top 10 Properties by Revenue ({selectedYear})
            </h3>
            <span className="text-sm text-gray-600">Hotels, Flights & Cars</span>
          </div>
          {topProperties && topProperties.length > 0 ? (
            <ResponsiveContainer width="100%" height={400} key={`top-properties-${selectedProviderId}-${selectedYear}`}>
              <BarChart data={topProperties.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="listingName" width={150} fontSize={12} />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'Revenue ($)') return `$${value.toLocaleString()}`;
                    return value;
                  }}
                  labelFormatter={(label) => `Hotel: ${label}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue ($)" />
                <Bar dataKey="bookingCount" fill="#10b981" name="Bookings" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No hotel properties data</p>
                <p className="text-sm">No hotel bookings found for {selectedYear}</p>
              </div>
            </div>
          )}
        </div>

        {/* City-wise Revenue */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-5 h-5" />
              City-wise Revenue ({selectedYear})
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={400} key={`city-revenue-${selectedProviderId}-${selectedYear}`}>
            <PieChart>
              <Pie
                data={cityRevenue.slice(0, 10)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ city, revenue }) => `${city}: $${Math.round(revenue)}`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="revenue"
              >
                {cityRevenue.slice(0, 10).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Providers */}
      <div className="card bg-white shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Top 10 Providers/Hosts - {new Date(2000, selectedMonth - 1, 1).toLocaleString('default', { month: 'long' })} {selectedYear}
          </h3>
        </div>
        {topProviders && topProviders.length > 0 ? (
          <ResponsiveContainer width="100%" height={350} key={`top-providers-${selectedProviderId}-${selectedMonth}-${selectedYear}`}>
            <BarChart data={topProviders.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="providerName" angle={-45} textAnchor="end" height={100} fontSize={11} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue ($)" />
              <Bar dataKey="bookingCount" fill="#f59e0b" name="Bookings" />
              <Bar dataKey="listingsSoldCount" fill="#3b82f6" name="Properties Sold" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">No data available</p>
              <p className="text-sm">No provider sales data found for {new Date(2000, selectedMonth - 1, 1).toLocaleString('default', { month: 'long' })} {selectedYear}</p>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown Table */}
      <div className="card bg-white shadow-md">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Platform Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Flights</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{overview?.breakdown?.flights || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {overview?.activeListings > 0 
                    ? ((overview.breakdown.flights / overview.activeListings) * 100).toFixed(1) 
                    : 0}%
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Hotels</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{overview?.breakdown?.hotels || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {overview?.activeListings > 0 
                    ? ((overview.breakdown.hotels / overview.activeListings) * 100).toFixed(1) 
                    : 0}%
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Cars</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{overview?.breakdown?.cars || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {overview?.activeListings > 0 
                    ? ((overview.breakdown.cars / overview.activeListings) * 100).toFixed(1) 
                    : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EnhancedAdminAnalyticsTab;

