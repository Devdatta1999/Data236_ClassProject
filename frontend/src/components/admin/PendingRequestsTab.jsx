import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { removePendingListing } from '../../store/slices/adminSlice'
import api from '../../services/apiService'
import { CheckCircle, XCircle, Plane, Hotel, Car } from 'lucide-react'
import Notification from '../common/Notification'

const PendingRequestsTab = ({ onRefresh }) => {
  const dispatch = useDispatch()
  const { pendingListings } = useSelector((state) => state.admin)
  const [processing, setProcessing] = useState({})
  const [notification, setNotification] = useState(null)

  const handleApprove = async (listingId, listingType) => {
    setProcessing({ [listingId]: 'approving' })
    try {
      await api.put(`/api/admin/listings/${listingId}/approve`, { listingType })
      dispatch(removePendingListing({ listingId, listingType }))
      if (onRefresh) onRefresh() // Refresh the list
      setNotification({ type: 'success', message: 'Listing approved successfully!' })
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to approve listing'
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      setProcessing({})
    }
  }

  const handleReject = async (listingId, listingType) => {
    setProcessing({ [listingId]: 'rejecting' })
    try {
      await api.put(`/api/admin/listings/${listingId}/reject`, { listingType })
      dispatch(removePendingListing({ listingId, listingType }))
      if (onRefresh) onRefresh() // Refresh the list
      setNotification({ type: 'success', message: 'Listing rejected successfully.' })
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to reject listing'
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      setProcessing({})
    }
  }

  const allListings = [
    ...pendingListings.flights.map(l => ({ ...l, type: 'Flight', icon: Plane })),
    ...pendingListings.hotels.map(l => ({ ...l, type: 'Hotel', icon: Hotel })),
    ...pendingListings.cars.map(l => ({ ...l, type: 'Car', icon: Car })),
  ]

  if (allListings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">No pending listing requests</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      {allListings.map((listing) => {
        const Icon = listing.icon
        const listingId = listing.flightId || listing.hotelId || listing.carId
        const isProcessing = processing[listingId]

        return (
          <div key={listingId} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Icon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">
                    {listing.flightId || listing.hotelName || `${listing.model} (${listing.year})`}
                  </h3>
                  <p className="text-gray-600 mb-2">Type: {listing.type}</p>
                  <p className="text-sm text-gray-500 mb-2">
                    Provider: {listing.providerName || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-500 mb-2">
                    ID: {listing.flightId || listing.hotelId || listing.carId}
                  </p>
                  
                  {/* Flight Details */}
                  {listing.type === 'Flight' && (
                    <div className="text-sm text-gray-600 space-y-1 mt-2">
                      <p><strong>Route:</strong> {listing.departureAirport} → {listing.arrivalAirport}</p>
                      <p><strong>Departure:</strong> {listing.departureDateTime ? new Date(listing.departureDateTime).toLocaleString() : 'N/A'}</p>
                      <p><strong>Arrival:</strong> {listing.arrivalDateTime ? new Date(listing.arrivalDateTime).toLocaleString() : 'N/A'}</p>
                      <p><strong>Class:</strong> {listing.flightClass}</p>
                      <p><strong>Price:</strong> ${listing.ticketPrice}</p>
                      <p><strong>Seats:</strong> {listing.availableSeats}/{listing.totalSeats}</p>
                    </div>
                  )}
                  
                  {/* Hotel Details */}
                  {listing.type === 'Hotel' && (
                    <div className="text-sm text-gray-600 space-y-1 mt-2">
                      <p><strong>Location:</strong> {listing.city}, {listing.state}</p>
                      <p><strong>Address:</strong> {listing.address}</p>
                      <p><strong>ZIP:</strong> {listing.zipCode}</p>
                      <p><strong>Rating:</strong> {'⭐'.repeat(listing.starRating || 0)}</p>
                      <p><strong>Rooms:</strong> {listing.availableRooms}/{listing.totalRooms}</p>
                      {listing.roomTypes && listing.roomTypes.length > 0 && (
                        <p><strong>Price:</strong> ${listing.roomTypes[0].pricePerNight}/night</p>
                      )}
                    </div>
                  )}
                  
                  {/* Car Details */}
                  {listing.type === 'Car' && (
                    <div className="text-sm text-gray-600 space-y-1 mt-2">
                      <p><strong>Model:</strong> {listing.model} ({listing.year})</p>
                      <p><strong>Type:</strong> {listing.carType}</p>
                      <p><strong>Transmission:</strong> {listing.transmissionType}</p>
                      <p><strong>Seats:</strong> {listing.numberOfSeats}</p>
                      <p><strong>Price:</strong> ${listing.dailyRentalPrice}/day</p>
                      <p><strong>Available From:</strong> {listing.availableFrom ? new Date(listing.availableFrom).toLocaleDateString() : 'N/A'}</p>
                      <p><strong>Available To:</strong> {listing.availableTo ? new Date(listing.availableTo).toLocaleDateString() : 'N/A'}</p>
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p><strong>Location:</strong></p>
                        {listing.neighbourhood && (
                          <p className="ml-4"><strong>Neighbourhood:</strong> {listing.neighbourhood}</p>
                        )}
                        <p className="ml-4"><strong>City:</strong> {listing.city || 'N/A'}</p>
                        <p className="ml-4"><strong>State:</strong> {listing.state || 'N/A'}</p>
                        <p className="ml-4"><strong>Country:</strong> {listing.country || 'USA'}</p>
                      </div>
                    </div>
                  )}
                  
                  {listing.status && (
                    <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                      {listing.status}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleApprove(listingId, listing.type)}
                  disabled={isProcessing}
                  className="btn-primary flex items-center space-x-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => handleReject(listingId, listing.type)}
                  disabled={isProcessing}
                  className="btn-secondary flex items-center space-x-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PendingRequestsTab

