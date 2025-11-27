import { useState, useEffect } from 'react'
import api from '../../services/apiService'
import { Search, Calendar, FileText, DollarSign, User, CheckCircle, XCircle, Clock, CreditCard, Download } from 'lucide-react'
import Notification from '../common/Notification'
import { format } from 'date-fns'

const BillManagementTab = () => {
  const [searchType, setSearchType] = useState('date') // 'date' or 'month'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1) // 1-12
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [searchResults, setSearchResults] = useState([])
  const [selectedBill, setSelectedBill] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  const handleSearch = async () => {
    setLoading(true)
    setNotification(null)
    setSelectedBill(null)

    try {
      let queryParams = {}
      
      if (searchType === 'date') {
        if (!startDate || !endDate) {
          setNotification({ type: 'error', message: 'Please select both start and end dates' })
          setLoading(false)
          return
        }
        queryParams = { startDate, endDate }
      } else if (searchType === 'month') {
        queryParams = { month: selectedMonth, year: selectedYear }
      }

      const response = await api.get('/api/billing/search', { params: queryParams })
      const bills = response.data.data?.bills || []
      
      setSearchResults(bills)
      
      if (bills.length === 0) {
        setNotification({ type: 'info', message: 'No bills found for the selected criteria' })
      } else {
        setNotification({ type: 'success', message: `Found ${bills.length} bill(s)` })
      }
    } catch (err) {
      console.error('Error searching bills:', err)
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.error?.message || 'Failed to search bills. Please try again.' 
      })
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleViewBill = async (billingId) => {
    setLoading(true)
    setNotification(null)

    try {
      const response = await api.get(`/api/billing/${billingId}`)
      setSelectedBill(response.data.data?.bill)
      setNotification(null) // Clear any previous notifications
    } catch (err) {
      console.error('Error fetching bill details:', err)
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.error?.message || 'Failed to fetch bill details. Please try again.' 
      })
      setSelectedBill(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCloseBillDetails = () => {
    setSelectedBill(null)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'Failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'Pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800'
      case 'Failed':
        return 'bg-red-100 text-red-800'
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ]

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-6">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Search Section */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center space-x-2">
          <Search className="w-6 h-6" />
          <span>Search Bills</span>
        </h2>

        {/* Search Type Toggle */}
        <div className="mb-6">
          <div className="flex space-x-4">
            <button
              onClick={() => {
                setSearchType('date')
                setStartDate('')
                setEndDate('')
                setSearchResults([])
                setSelectedBill(null)
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                searchType === 'date'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Search by Date Range
            </button>
            <button
              onClick={() => {
                setSearchType('month')
                setSearchResults([])
                setSelectedBill(null)
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                searchType === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Search by Month
            </button>
          </div>
        </div>

        {/* Search Form */}
        <div className="space-y-4">
          {searchType === 'date' ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-field"
                  max={endDate || undefined}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-field"
                  min={startDate || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="input-field"
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="input-field"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={loading}
            className="btn-primary flex items-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Search Bills</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && !selectedBill && (
        <div className="card">
          <h3 className="text-xl font-semibold mb-4">
            Search Results ({searchResults.length} bill{searchResults.length !== 1 ? 's' : ''})
          </h3>
          <div className="space-y-3">
            {searchResults.map((bill) => (
              <div
                key={bill.billing_id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewBill(bill.billing_id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-semibold">Bill ID: {bill.billing_id}</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(bill.transaction_status)}`}>
                        {getStatusIcon(bill.transaction_status)}
                        <span>{bill.transaction_status}</span>
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>User ID: {bill.user_id}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(bill.transaction_date), 'MMM dd, yyyy hh:mm a')}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CreditCard className="w-4 h-4" />
                        <span>Payment: {bill.payment_method || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span>Bookings: {bill.booking_count || bill.booking_ids?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary-600">
                      {formatCurrency(bill.total_amount)}
                    </div>
                    <button
                      className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center space-x-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleViewBill(bill.billing_id)
                      }}
                    >
                      <FileText className="w-4 h-4" />
                      <span>View Details</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill Details Modal */}
      {selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold mb-2 flex items-center space-x-2">
                  <FileText className="w-6 h-6" />
                  <span>Bill Details</span>
                </h2>
                <p className="text-gray-600">Bill ID: {selectedBill.billing_id}</p>
              </div>
              <button
                onClick={handleCloseBillDetails}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Bill Summary */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-600">User ID</label>
                  <p className="text-lg font-semibold mt-1">{selectedBill.user_id}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-600">Transaction Date</label>
                  <p className="text-lg font-semibold mt-1">
                    {format(new Date(selectedBill.transaction_date), 'MMM dd, yyyy hh:mm a')}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-600">Payment Method</label>
                  <p className="text-lg font-semibold mt-1">{selectedBill.payment_method || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 ${getStatusColor(selectedBill.transaction_status)}`}>
                    {getStatusIcon(selectedBill.transaction_status)}
                    <span>{selectedBill.transaction_status}</span>
                  </span>
                </div>
                {selectedBill.checkout_id && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="text-sm font-medium text-gray-600">Checkout ID</label>
                    <p className="text-lg font-semibold mt-1">{selectedBill.checkout_id}</p>
                  </div>
                )}
                <div className="bg-primary-50 rounded-lg p-4 border-2 border-primary-200">
                  <label className="text-sm font-medium text-primary-700">Total Amount</label>
                  <p className="text-2xl font-bold text-primary-600 mt-1">
                    {formatCurrency(selectedBill.total_amount)}
                  </p>
                </div>
              </div>

              {/* Bookings */}
              {selectedBill.bookings && selectedBill.bookings.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold mb-4">Associated Bookings ({selectedBill.bookings.length})</h3>
                  <div className="space-y-3">
                    {selectedBill.bookings.map((booking, index) => (
                      <div key={booking.bookingId || index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="font-semibold">Booking ID: {booking.bookingId || 'N/A'}</h4>
                              {booking.listingType && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                  {booking.listingType}
                                </span>
                              )}
                            </div>
                            {booking.listingName && (
                              <p className="text-sm text-gray-600 mb-1">
                                <strong>Listing:</strong> {booking.listingName}
                              </p>
                            )}
                            {booking.quantity && (
                              <p className="text-sm text-gray-600 mb-1">
                                <strong>Quantity:</strong> {booking.quantity}
                              </p>
                            )}
                            {booking.roomType && (
                              <p className="text-sm text-gray-600 mb-1">
                                <strong>Room Type:</strong> {booking.roomType}
                              </p>
                            )}
                            {booking.seatType && (
                              <p className="text-sm text-gray-600 mb-1">
                                <strong>Seat Type:</strong> {booking.seatType}
                              </p>
                            )}
                          </div>
                          {booking.amount && (
                            <div className="text-right">
                              <p className="text-lg font-semibold text-primary-600">
                                {formatCurrency(booking.amount)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoice Details */}
              {selectedBill.invoice_details && (
                <div>
                  <h3 className="text-xl font-semibold mb-4">Invoice Details</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">
                      {JSON.stringify(selectedBill.invoice_details, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex justify-end space-x-3">
              <button
                onClick={handleCloseBillDetails}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BillManagementTab

