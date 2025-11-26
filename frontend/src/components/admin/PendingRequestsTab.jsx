import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { removePendingListing } from '../../store/slices/adminSlice'
import api from '../../services/apiService'
import { CheckCircle, XCircle, Plane, Hotel, Car, Star, MapPin, Calendar } from 'lucide-react'
import Notification from '../common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

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
    <div className="space-y-6">
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
        const isHotel = listing.type === 'Hotel'

        return (
          <div key={listingId} className="card overflow-hidden">
            <div className={`flex ${isHotel ? 'flex-col md:flex-row' : 'items-start'} justify-between gap-4`}>
              {/* Hotel Image (if available) */}
              {isHotel && listing.images && listing.images.length > 0 && (
                <div className="md:w-64 h-48 md:h-auto flex-shrink-0">
                  <img
                    src={listing.images[0]?.startsWith('http') ? listing.images[0] : `${API_BASE_URL}${listing.images[0]}`}
                    alt={listing.hotelName || 'Hotel'}
                    className="w-full h-full object-cover rounded-lg"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/400x300?text=Hotel+Image'
                    }}
                  />
                </div>
              )}

              <div className="flex items-start space-x-4 flex-1">
                {!isHotel && (
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <Icon className="w-6 h-6 text-purple-600" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-xl font-semibold">
                      {listing.flightId || listing.hotelName || `${listing.model} (${listing.year})`}
                    </h3>
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      Pending
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-500 mb-3">
                    Provider: <span className="font-medium text-gray-700">{listing.providerName || 'N/A'}</span> | 
                    ID: <span className="font-medium text-gray-700">{listingId}</span>
                  </p>
                  
                  {isHotel ? (
                    <>
                      {/* Hotel-specific details */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{listing.address}, {listing.city}, {listing.state} {listing.zipCode}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          {listing.starRating && (
                            <div className="flex items-center space-x-1">
                              {Array.from({ length: listing.starRating }).map((_, i) => (
                                <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                              ))}
                              <span className="text-sm text-gray-600 ml-1">{listing.starRating} stars</span>
                            </div>
                          )}
                          {listing.hotelRating && (
                            <div className="flex items-center space-x-1 bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                              <Star className="w-3 h-3 fill-current" />
                              <span>{listing.hotelRating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                        {listing.amenities && listing.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {listing.amenities.slice(0, 6).map((amenity, idx) => (
                              <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                {amenity}
                              </span>
                            ))}
                            {listing.amenities.length > 6 && (
                              <span className="text-xs text-gray-500">+{listing.amenities.length - 6} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Room Types */}
                      {listing.roomTypes && listing.roomTypes.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Room Types & Availability</h4>
                          <div className="grid md:grid-cols-3 gap-4">
                            {listing.roomTypes.map((roomType, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="font-medium text-gray-900">{roomType.type}</span>
                                  <span className="text-primary-600 font-semibold">${roomType.pricePerNight}/night</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                  Available: {roomType.availableCount || 0} rooms
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 text-sm text-gray-600">
                            Total Rooms: <span className="font-semibold">{listing.totalRooms || 0}</span> | 
                            Available: <span className="font-semibold">{listing.availableRooms || 0}</span>
                          </div>
                        </div>
                      )}

                      {/* Availability Dates */}
                      {(listing.availableFrom || listing.availableTo) && (
                        <div className="flex items-center space-x-2 text-sm text-gray-600 mt-3">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Available from {listing.availableFrom ? new Date(listing.availableFrom).toLocaleDateString() : 'N/A'} 
                            {' '}to {listing.availableTo ? new Date(listing.availableTo).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Flight Details */}
                      {listing.type === 'Flight' && (
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><strong>Route:</strong> {listing.departureAirport} → {listing.arrivalAirport}</p>
                          <p><strong>Departure:</strong> {listing.departureDateTime ? new Date(listing.departureDateTime).toLocaleString() : 'N/A'}</p>
                          <p><strong>Arrival:</strong> {listing.arrivalDateTime ? new Date(listing.arrivalDateTime).toLocaleString() : 'N/A'}</p>
                          <p><strong>Class:</strong> {listing.flightClass}</p>
                          <p><strong>Price:</strong> ${listing.ticketPrice}</p>
                          <p><strong>Seats:</strong> {listing.availableSeats}/{listing.totalSeats}</p>
                        </div>
                      )}
                      
                      {/* Car Details */}
                      {listing.type === 'Car' && (
                        <div className="text-sm text-gray-600 space-y-1">
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
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col space-y-2 self-start">
                <button
                  onClick={() => handleApprove(listingId, listing.type)}
                  disabled={isProcessing}
                  className="btn-primary flex items-center space-x-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isProcessing === 'approving' ? 'Approving...' : 'Approve'}</span>
                </button>
                <button
                  onClick={() => handleReject(listingId, listing.type)}
                  disabled={isProcessing}
                  className="btn-secondary flex items-center space-x-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{isProcessing === 'rejecting' ? 'Rejecting...' : 'Reject'}</span>
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

