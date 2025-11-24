import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { removePendingListing } from '../../store/slices/adminSlice'
import api from '../../services/apiService'
import { CheckCircle, XCircle, Plane, Hotel, Car } from 'lucide-react'

const PendingRequestsTab = ({ onRefresh }) => {
  const dispatch = useDispatch()
  const { pendingListings } = useSelector((state) => state.admin)
  const [processing, setProcessing] = useState({})

  const handleApprove = async (listingId, listingType) => {
    setProcessing({ [listingId]: 'approving' })
    try {
      await api.put(`/api/admin/listings/${listingId}/approve`, { listingType })
      dispatch(removePendingListing({ listingId, listingType }))
      if (onRefresh) onRefresh() // Refresh the list
      alert('Listing approved successfully!')
    } catch (err) {
      alert('Failed to approve listing: ' + (err.response?.data?.error?.message || err.message))
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
      alert('Listing rejected')
    } catch (err) {
      alert('Failed to reject listing: ' + (err.response?.data?.error?.message || err.message))
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
                    {listing.flightId || listing.hotelName || listing.carModel}
                  </h3>
                  <p className="text-gray-600 mb-2">Type: {listing.type}</p>
                  <p className="text-sm text-gray-500">
                    Provider: {listing.providerName || 'N/A'}
                  </p>
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

