import { useState, useEffect, useMemo } from 'react'
import { Plane, Hotel, Car, Trash2, AlertCircle, Star, MapPin, Calendar, Users, Clock, MapPin as MapIcon } from 'lucide-react'
import api from '../../services/apiService'
import Notification from '../common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source - handles various image path formats
const getImageSrc = (imagePath) => {
  if (!imagePath) return ''
  // If it's already a full URL (http/https), return as is
  if (imagePath.startsWith('http')) return imagePath
  // If it already starts with /api/, prepend API_BASE_URL (handles both listings/images and providers/profile-pictures)
  if (imagePath.startsWith('/api/')) {
    return `${API_BASE_URL}${imagePath}`
  }
  // Otherwise, extract filename and construct the path (assume listings/images)
  const filename = imagePath.split('/').pop()
  const encodedFilename = encodeURIComponent(filename)
  return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
}

const MyListingsTab = ({ onRefresh }) => {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState({})
  const [notification, setNotification] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // { listingId, listingType }
  const [imageLoadKey, setImageLoadKey] = useState(0)
  const [listingsReady, setListingsReady] = useState(false)

  useEffect(() => {
    fetchListings()
  }, [])

  // Group listings by status - use useMemo to ensure consistency
  // IMPORTANT: Must be called before any conditional returns to follow Rules of Hooks
  const groupedListings = useMemo(() => ({
    Active: listings.filter(l => l.status === 'Active'),
    Pending: listings.filter(l => l.status === 'Pending'),
    Inactive: listings.filter(l => l.status === 'Inactive')
  }), [listings])

  const fetchListings = async () => {
    setLoading(true)
    setListingsReady(false) // Reset ready state before fetching
    try {
      const response = await api.get('/api/providers/listings')
      const data = response.data.data?.listings || []
      
      // Set listings first
      setListings(data)
      
      // Use requestAnimationFrame to ensure state is updated before setting imageLoadKey
      // This prevents race conditions where images try to render before data is ready
      requestAnimationFrame(() => {
        setImageLoadKey(Date.now()) // Force image re-render
        setListingsReady(true) // Mark listings as ready
      })
    } catch (err) {
      console.error('Error fetching listings:', err)
      setListingsReady(false)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (listingId, listingType) => {
    setConfirmDelete({ listingId, listingType })
  }

  const handleCancelDelete = () => {
    setConfirmDelete(null)
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    
    const { listingId, listingType } = confirmDelete
    setConfirmDelete(null)
    setDeleting({ [listingId]: true })
    try {
      await api.delete('/api/providers/listings', {
        data: { listingId, listingType }
      })
      // Remove from local state
      setListings(listings.filter(l => l.listingId !== listingId))
      if (onRefresh) onRefresh()
      setNotification({ type: 'success', message: 'Listing deleted successfully!' })
    } catch (err) {
      console.error('Error deleting listing:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to delete listing'
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      setDeleting({})
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800'
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'Inactive':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getListingIcon = (type) => {
    switch (type) {
      case 'Flight':
        return Plane
      case 'Hotel':
        return Hotel
      case 'Car':
        return Car
      default:
        return AlertCircle
    }
  }

  const getListingTitle = (listing) => {
    if (listing.listingType === 'Flight') {
      return `${listing.departureAirport} → ${listing.arrivalAirport}`
    } else if (listing.listingType === 'Hotel') {
      return listing.hotelName
    } else if (listing.listingType === 'Car') {
      return `${listing.model} (${listing.year})`
    }
    return listing.listingId
  }

  const getListingDetails = (listing) => {
    if (listing.listingType === 'Flight') {
      // For new flights with seatTypes, show seat type information
      if (listing.seatTypes && listing.seatTypes.length > 0) {
        const totalSeats = listing.seatTypes.reduce((sum, st) => sum + (st.totalSeats || 0), 0)
        const seatInfo = listing.seatTypes.map(st => `${st.type}: ${st.totalSeats} seats @ $${st.ticketPrice || 0}`).join(', ')
        return [
          `Total Seats: ${totalSeats}`,
          `Seat Types: ${seatInfo}`,
          listing.departureTime && listing.arrivalTime ? `${listing.departureTime} → ${listing.arrivalTime}` : '',
          listing.operatingDays && listing.operatingDays.length > 0 ? `Operating: ${listing.operatingDays.join(', ')}` : ''
        ].filter(Boolean)
      } else {
        // Legacy format
        return [
          `Class: ${listing.flightClass || 'N/A'}`,
          `Price: $${listing.ticketPrice || 0}`,
          `Seats: ${listing.availableSeats || 0}/${listing.totalSeats || 0}`
        ]
      }
    } else if (listing.listingType === 'Hotel') {
      return [
        `${listing.city}, ${listing.state}`,
        `Rating: ${'⭐'.repeat(listing.starRating)}`,
        `Rooms: ${listing.availableRooms || 0}/${listing.totalRooms || 0}`
      ]
    } else if (listing.listingType === 'Car') {
      return [
        `${listing.carType} | ${listing.transmissionType}`,
        `Seats: ${listing.numberOfSeats}`,
        `Price: $${listing.dailyRentalPrice}/day`
      ]
    }
    return []
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">Loading your listings...</p>
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">You don't have any listings yet.</p>
        <p className="text-gray-500 text-sm mt-2">Create your first listing to get started!</p>
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

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Listing</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this {confirmDelete.listingType.toLowerCase()} listing? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelDelete}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Listings</h2>
        <button
          onClick={fetchListings}
          className="btn-secondary"
        >
          Refresh
        </button>
      </div>

      {/* Status Summary */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{groupedListings.Active.length}</div>
          <div className="text-sm text-gray-600 mt-1">Active</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-yellow-600">{groupedListings.Pending.length}</div>
          <div className="text-sm text-gray-600 mt-1">Pending</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-600">{groupedListings.Inactive.length}</div>
          <div className="text-sm text-gray-600 mt-1">Inactive</div>
        </div>
      </div>

      {/* All Listings */}
      {listingsReady && imageLoadKey > 0 ? (
        <div className="space-y-6">
          {listings.map((listing) => {
          const Icon = getListingIcon(listing.listingType)
          const isDeleting = deleting[listing.listingId]
          const isHotel = listing.listingType === 'Hotel'

          return (
            <div key={listing.listingId} className="card overflow-hidden">
              <div className={`flex ${isHotel ? 'flex-col md:flex-row' : 'items-start'} justify-between gap-4`}>
                {/* Hotel Image (if available) */}
                {isHotel && listing.images && listing.images.length > 0 && (
                  <div className="md:w-64 h-48 md:h-auto flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                    {(() => {
                      const imageSrc = getImageSrc(listing.images[0])
                      return imageSrc ? (
                        <img
                          key={`img-${listing.listingId}-${imageLoadKey}-${imageSrc}`}
                          src={imageSrc}
                          alt={listing.hotelName || 'Hotel'}
                          className="w-full h-full object-cover"
                          loading="eager"
                          decoding="async"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling?.classList.remove('hidden')
                          }}
                          onLoad={(e) => {
                            e.target.style.opacity = '1'
                            e.target.style.display = 'block'
                          }}
                        />
                      ) : null
                    })()}
                    <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
                      <Hotel className="w-12 h-12" />
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-4 flex-1">
                  {!isHotel && (
                    <>
                      {/* Show provider profile image for flights and cars */}
                      {(() => {
                        const imageSrc = listing.image ? getImageSrc(listing.image) : null
                        return imageSrc ? (
                          <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                            <img
                              key={`img-${listing.listingId}-${imageLoadKey}-${imageSrc}`}
                              src={imageSrc}
                              alt={listing.providerName || 'Provider'}
                              className="w-full h-full object-cover border border-gray-200"
                              loading="eager"
                              decoding="async"
                              onError={(e) => {
                                e.target.style.display = 'none'
                                e.target.nextSibling?.classList.remove('hidden')
                              }}
                              onLoad={(e) => {
                                e.target.style.opacity = '1'
                                e.target.style.display = 'block'
                              }}
                            />
                            <div className={`hidden w-16 h-16 p-3 rounded-lg ${
                              listing.status === 'Active' ? 'bg-green-100' :
                              listing.status === 'Pending' ? 'bg-yellow-100' :
                              'bg-gray-100'
                            } items-center justify-center`}>
                              <Icon className={`w-6 h-6 ${
                                listing.status === 'Active' ? 'text-green-600' :
                                listing.status === 'Pending' ? 'text-yellow-600' :
                                'text-gray-600'
                              }`} />
                            </div>
                          </div>
                        ) : (
                          <div className={`p-3 rounded-lg ${
                            listing.status === 'Active' ? 'bg-green-100' :
                            listing.status === 'Pending' ? 'bg-yellow-100' :
                            'bg-gray-100'
                          }`}>
                            <Icon className={`w-6 h-6 ${
                              listing.status === 'Active' ? 'text-green-600' :
                              listing.status === 'Pending' ? 'text-yellow-600' :
                              'text-gray-600'
                            }`} />
                          </div>
                        )
                      })()}
                    </>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h3 className="text-xl font-semibold">
                        {listing.listingType === 'Flight' 
                          ? `${listing.departureAirport || 'N/A'} → ${listing.arrivalAirport || 'N/A'}`
                          : getListingTitle(listing)
                        }
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(listing.status)}`}>
                        {listing.status}
                      </span>
                      {listing.listingType === 'Flight' && listing.flightId && (
                        <span className="text-xs text-gray-500">ID: {listing.flightId}</span>
                      )}
                    </div>
                    
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
                    ) : listing.listingType === 'Flight' ? (
                      <>
                        {/* Flight-specific details */}
                        <div className="space-y-3 mb-4">
                          <div className="flex items-center space-x-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className="font-semibold text-gray-900">{listing.departureAirport} → {listing.arrivalAirport}</span>
                          </div>
                          
                          {listing.departureTime && listing.arrivalTime && (
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-blue-500" />
                                <span><span className="font-medium">Departure:</span> {listing.departureTime}</span>
                              </div>
                              <span className="text-gray-300">→</span>
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-green-500" />
                                <span><span className="font-medium">Arrival:</span> {listing.arrivalTime}</span>
                              </div>
                              {listing.duration && (
                                <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                  {Math.floor(listing.duration / 60)}h {listing.duration % 60}m
                                </span>
                              )}
                            </div>
                          )}
                          
                          {listing.operatingDays && listing.operatingDays.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs font-medium text-gray-600">Operating Days:</span>
                              {listing.operatingDays.map((day, idx) => (
                                <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  {day}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          {(listing.availableFrom || listing.availableTo) && (
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>
                                Available from {listing.availableFrom ? new Date(listing.availableFrom).toLocaleDateString() : 'N/A'} 
                                {' '}to {listing.availableTo ? new Date(listing.availableTo).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Seat Types */}
                        {listing.seatTypes && listing.seatTypes.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Seat Types & Pricing</h4>
                            <div className="grid md:grid-cols-3 gap-4">
                              {listing.seatTypes.map((seatType, idx) => (
                                <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="font-medium text-gray-900">{seatType.type}</span>
                                    <span className="text-primary-600 font-semibold">${seatType.ticketPrice || 0}</span>
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Total Seats: <span className="font-semibold">{seatType.totalSeats || 0}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 text-sm text-gray-600">
                              Total Seats: <span className="font-semibold">
                                {listing.seatTypes.reduce((sum, st) => sum + (st.totalSeats || 0), 0)}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Legacy format fallback */}
                        {(!listing.seatTypes || listing.seatTypes.length === 0) && (
                          <div className="text-sm text-gray-600 space-y-1">
                            {getListingDetails(listing).map((detail, idx) => (
                              <p key={idx}>{detail}</p>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Car listing details */}
                        <div className="text-sm text-gray-600 space-y-1">
                          {getListingDetails(listing).map((detail, idx) => (
                            <p key={idx}>{detail}</p>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(listing.listingId, listing.listingType)}
                  disabled={isDeleting}
                  className="btn-secondary text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center space-x-2 self-start"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                </button>
              </div>
            </div>
          )
        })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">Preparing listings...</p>
        </div>
      )}
    </div>
  )
}

export default MyListingsTab

