/**
 * Host Analytics Dashboard
 * Displays analytics for host/provider: clicks, views, reviews, user traces
 */

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { MousePointer, Eye, MessageSquare, Users, DollarSign, Star, TrendingDown } from 'lucide-react';
import api from '../../services/apiService';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const HostAnalyticsTab = () => {
  const { user, userType } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [cohortCity, setCohortCity] = useState('San Jose');
  const [cohortState, setCohortState] = useState('CA');
  
  const [pageClicks, setPageClicks] = useState(null);
  const [listingClicks, setListingClicks] = useState(null);
  const [leastViewed, setLeastViewed] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [profitability, setProfitability] = useState(null);
  const [userTrace, setUserTrace] = useState(null);
  const [cohortData, setCohortData] = useState(null);

  // Get userType from localStorage as fallback
  const currentUserType = userType || localStorage.getItem('userType');

  // Get providerId from Redux user or localStorage as fallback
  const providerId = user?.providerId || (() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
      return storedUser?.providerId || null;
    } catch (e) {
      return null;
    }
  })();

  useEffect(() => {
    if (!providerId) {
      console.error('Provider ID not found in user object. Cannot fetch analytics.');
      console.log('Current user object:', user);
      console.log('LocalStorage user:', JSON.parse(localStorage.getItem('user') || 'null'));
      setLoading(false);
      return;
    }
    fetchAnalytics();
  }, [days, providerId, user]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [pageClicksRes, listingClicksRes, leastViewedRes, reviewsRes, profitRes] = await Promise.all([
        api.get(`/api/analytics/host/${providerId}/page-clicks?days=${days}`),
        api.get(`/api/analytics/host/${providerId}/listing-clicks?days=${days}`),
        api.get(`/api/analytics/host/${providerId}/least-viewed?days=${days}`),
        api.get(`/api/analytics/host/${providerId}/reviews`),
        api.get(`/api/analytics/host/${providerId}/profitability`)
      ]);

      setPageClicks(pageClicksRes.data.data);
      setListingClicks(listingClicksRes.data.data);
      setLeastViewed(leastViewedRes.data.data);
      setReviews(reviewsRes.data.data);
      setProfitability(profitRes.data.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTrace = async () => {
    if (!selectedUserId) return;
    
    try {
      const res = await api.get(`/api/analytics/user-trace/${selectedUserId}?days=${days}`);
      setUserTrace(res.data.data);
    } catch (error) {
      console.error('Failed to fetch user trace:', error);
    }
  };

  const fetchCohort = async () => {
    try {
      const res = await api.get(`/api/analytics/cohort?city=${cohortCity}&state=${cohortState}&days=${days}`);
      setCohortData(res.data.data);
    } catch (error) {
      console.error('Failed to fetch cohort data:', error);
    }
  };

  // Show error if user is not a host or providerId is missing
  if (currentUserType !== 'host') {
    return (
      <div className="card bg-white shadow-md p-8">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-red-600 mb-4">Access Denied</h3>
          <p className="text-gray-600 mb-4">
            Host Analytics is only available for host accounts. You are currently logged in as: <strong>{currentUserType || 'Unknown'}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Please log out and log in with a host account to view analytics.
          </p>
        </div>
      </div>
    );
  }

  if (!providerId) {
    return (
      <div className="card bg-white shadow-md p-8">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-red-600 mb-4">Unable to Load Analytics</h3>
          <p className="text-gray-600 mb-4">
            Provider ID not found. Please log out and log back in as a host to refresh your session.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

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

  // Prepare rating distribution data for pie chart
  const ratingDistData = reviews?.ratingDistribution 
    ? Object.entries(reviews.ratingDistribution).map(([rating, count]) => ({
        name: `${rating} Stars`,
        value: count
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Host Analytics</h2>
          <p className="text-gray-600">Track performance, clicks, and user engagement</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time Period</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="card bg-white shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-800">
                ${(profitability?.totalRevenue || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-purple-500 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card bg-white shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Total Bookings</p>
              <p className="text-3xl font-bold text-gray-800">{profitability?.totalBookings || 0}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card bg-white shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Avg Rating</p>
              <p className="text-3xl font-bold text-gray-800">{profitability?.averageRating || 0}</p>
            </div>
            <div className="bg-yellow-500 p-3 rounded-lg">
              <Star className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card bg-white shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Total Listings</p>
              <p className="text-3xl font-bold text-gray-800">{profitability?.totalListings || 0}</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-lg">
              <Eye className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Page Clicks and Listing Clicks */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Page Clicks */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <MousePointer className="w-5 h-5" />
              Page Clicks (Last {days} days)
            </h3>
            <span className="text-sm text-gray-600">Total: {pageClicks?.totalClicks || 0}</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pageClicks?.pageClicks || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="pageName" angle={-45} textAnchor="end" height={100} fontSize={11} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="clicks" fill="#3b82f6" name="Clicks" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Listing Clicks */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Listing Clicks (Last {days} days)
            </h3>
            <span className="text-sm text-gray-600">Total: {listingClicks?.totalClicks || 0}</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={listingClicks?.listingClicks || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="listingName" angle={-45} textAnchor="end" height={100} fontSize={11} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="clicks" fill="#10b981" name="Clicks" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reviews Analytics */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Reviews Over Time */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Reviews Over Time
            </h3>
            <span className="text-sm text-gray-600">Total: {reviews?.totalReviews || 0}</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={reviews?.reviewTrend || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} name="Reviews" />
              <Line type="monotone" dataKey="avgRating" stroke="#f59e0b" strokeWidth={2} name="Avg Rating" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Rating Distribution */}
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Star className="w-5 h-5" />
              Rating Distribution
            </h3>
            <span className="text-sm text-gray-600">Avg: {reviews?.averageRating || 0}</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={ratingDistData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {ratingDistData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Revenue Trend */}
      {profitability?.monthlyRevenue && profitability.monthlyRevenue.length > 0 && (
        <div className="card bg-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Monthly Revenue Trend
            </h3>
            <span className="text-sm text-gray-600">Revenue and bookings by month</span>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={profitability.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthName" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'Revenue') return `$${value.toLocaleString()}`;
                  return value;
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="revenue" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                name="Revenue ($)" 
                dot={{ r: 5 }}
                activeDot={{ r: 8 }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="bookingCount" 
                stroke="#10b981" 
                strokeWidth={2} 
                name="Bookings" 
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-xs text-gray-600">Total Revenue</p>
              <p className="text-lg font-bold text-blue-600">
                ${profitability.monthlyRevenue.reduce((sum, m) => sum + (m.revenue || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <p className="text-xs text-gray-600">Total Bookings</p>
              <p className="text-lg font-bold text-green-600">
                {profitability.monthlyRevenue.reduce((sum, m) => sum + (m.bookingCount || 0), 0)}
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded">
              <p className="text-xs text-gray-600">Avg per Booking</p>
              <p className="text-lg font-bold text-purple-600">
                ${(
                  profitability.monthlyRevenue.reduce((sum, m) => sum + (m.revenue || 0), 0) /
                  Math.max(profitability.monthlyRevenue.reduce((sum, m) => sum + (m.bookingCount || 0), 0), 1)
                ).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Least Viewed Sections */}
      <div className="card bg-white shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Least Viewed Sections (Last {days} days)
          </h3>
          <span className="text-sm text-gray-600">Areas needing attention</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Views</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(leastViewed?.leastViewedSections || []).map((section, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{section.sectionName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{section.views}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      section.views < 10 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {section.views < 10 ? 'Critical' : 'Low'}
                    </span>
                  </td>
                </tr>
              ))}
              {(!leastViewed?.leastViewedSections || leastViewed.leastViewedSections.length === 0) && (
                <tr>
                  <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">
                    No data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Trace */}
      <div className="card bg-white shadow-md">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          User Journey Trace
        </h3>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="Enter User ID (e.g., 333-44-5555)"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchUserTrace}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Trace User
          </button>
        </div>
        
        {userTrace && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Total Events</p>
                <p className="text-xl font-bold">{userTrace.stats.totalEvents}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Page Views</p>
                <p className="text-xl font-bold">{userTrace.stats.pageViews}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Listing Views</p>
                <p className="text-xl font-bold">{userTrace.stats.listingViews}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Bookings</p>
                <p className="text-xl font-bold">{userTrace.stats.completedBookings}</p>
              </div>
            </div>
            
            <div className="overflow-y-auto max-h-96">
              <div className="space-y-2">
                {userTrace.timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded">
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">
                          {event.type === 'booking' ? 'Booking' : event.eventType}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {event.pageName || event.listingType}
                        {event.listingId && ` - ${event.listingId}`}
                        {event.amount && ` - $${event.amount}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cohort Analysis */}
      <div className="card bg-white shadow-md">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Cohort Analysis
        </h3>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="City (e.g., San Jose)"
            value={cohortCity}
            onChange={(e) => setCohortCity(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="State (e.g., CA)"
            value={cohortState}
            onChange={(e) => setCohortState(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchCohort}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition"
          >
            Analyze Cohort
          </button>
        </div>
        
        {cohortData && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Total Users</p>
                <p className="text-xl font-bold">{cohortData.totalUsers}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Avg Events/User</p>
                <p className="text-xl font-bold">{cohortData.averageEventsPerUser}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Location</p>
                <p className="text-xl font-bold">{cohortData.cohort.city}, {cohortData.cohort.state}</p>
              </div>
            </div>
            
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={Object.entries(cohortData.eventTypeCounts).map(([type, count]) => ({ type, count }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#14b8a6" name="Event Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default HostAnalyticsTab;

