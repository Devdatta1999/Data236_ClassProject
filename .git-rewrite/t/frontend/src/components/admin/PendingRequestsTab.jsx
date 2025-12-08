import { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { removePendingListing } from '../../store/slices/adminSlice'
import api from '../../services/apiService'
import { CheckCircle, XCircle, Plane, Hotel, Car, Star, MapPin, Calendar, Clock, Building2 } from 'lucide-react'
import Notification from '../common/Notification'
import Pagination from '../common/Pagination'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source
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

const PendingRequestsTab = ({ onRefresh }) => {
  const dispatch = useDispatch()
  const { pendingListings } = useSelector((state) => state.admin)
  const [processing, setProcessing] = useState({})
  const [notification, setNotification] = useState(null)
  const [imageLoadKey, setImageLoadKey] = useState(0)
  const [listingsReady, setListingsReady] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

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

  // Compute all listings first
  const allListings = useMemo(() => [
    ...pendingListings.flights.map(l => ({ ...l, type: 'Flight', icon: Plane })),
    ...pendingListings.hotels.map(l => ({ ...l, type: 'Hotel', icon: Hotel })),
    ...pendingListings.cars.map(l => ({ ...l, type: 'Car', icon: Car })),
  ], [pendingListings.flights, pendingListings.hotels, pendingListings.cars])

  // Track image data signatures to detect when listing images actually change
  const imageDataSignature = useMemo(() => {
    return allListings.map(l => {
      const id = l.flightId || l.hotelId || l.carId
      const image = l.type === 'Hotel' ? (l.images?.[0] || '') : (l.image || '')
      return `${id}:${image}`
    }).join('|')
  }, [allListings])

  // Force image reload when listings actually change - ensure listings are ready before rendering images
  // This prevents race conditions where images try to render before listing data is fully populated
  useEffect(() => {
    setListingsReady(false) // Reset ready state when listings change
    
    const totalListings = allListings.length
    
    if (totalListings > 0) {
      // Use double requestAnimationFrame to ensure DOM is ready and state is fully propagated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Update key whenever listings are available to force image re-render
          setImageLoadKey(Date.now())
          setListingsReady(true) // Mark listings as ready for image rendering
        })
      })
    } else {
      // No listings, mark as ready anyway to show empty state
      setListingsReady(true)
    }
  }, [allListings.length, imageDataSignature])

  // Pagination logic
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return {
      items: allListings.slice(start, end),
      totalPages: Math.ceil(allListings.length / itemsPerPage),
      totalItems: allListings.length
    }
  }, [allListings, currentPage, itemsPerPage])

  // Reset to page 1 when listings change
  useEffect(() => {
    setCurrentPage(1)
  }, [allListings.length])

  if (!listingsReady) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">Loading listings...</p>
      </div>
    )
  }

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
      {paginatedListings.items.map((listing) => {
        const Icon = listing.icon
        const listingId = listing.flightId || listing.hotelId || listing.carId
        const isProcessing = processing[listingId]
        const isHotel = listing.type === 'Hotel'

        return (
          <div key={listingId} className="card overflow-hidden">
            <div className={`flex ${isHotel ? 'flex-col md:flex-row' : 'items-start'} justify-between gap-4`}>
              {/* Listing Image */}
              {(() => {
                // Compute image source outside of conditional rendering to ensure consistency
                let imageSrc = null
                let imageAlt = ''
                
                // Check for hotel images
                if (isHotel && listing.images && listing.images.length > 0 && listing.images[0]) {
                  const rawImage = listing.images[0]
                  imageSrc = rawImage ? getImageSrc(rawImage) : null
                  imageAlt = listing.hotelName || 'Hotel'
                } 
                // Check for flight image (can be null, empty string, or URL)
                else if (listing.type === 'Flight' && listing.image && listing.image.trim()) {
                  const rawImage = listing.image.trim()
                  imageSrc = rawImage ? getImageSrc(rawImage) : null
                  imageAlt = listing.flightId || 'Flight'
                } 
                // Check for car image
                else if (listing.type === 'Car' && listing.image && listing.image.trim()) {
                  const rawImage = listing.image.trim()
                  imageSrc = rawImage ? getImageSrc(rawImage) : null
                  imageAlt = listing.model || listing.carModel || 'Car'
                }
                
                // Always render the container for consistent layout
                const imageKey = `${listingId}-${imageSrc || 'placeholder'}-${imageLoadKey}`
                
                return (
                  <div key={`img-container-${imageKey}`} className="md:w-64 h-48 md:h-auto flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                    {imageSrc ? (
                      <img
                        key={`img-${imageKey}`}
                        src={imageSrc}
                        alt={imageAlt}
                        className="w-full h-full object-cover"
                        loading="eager"
                        decoding="async"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          console.error('Image failed to load:', imageSrc, 'for listing:', listingId)
                          e.target.style.display = 'none'
                          const placeholder = e.target.parentElement.querySelector('.image-placeholder')
                          if (placeholder) placeholder.classList.remove('hidden')
                        }}
                        onLoad={(e) => {
                          // Ensure image is visible when loaded
                          e.target.style.opacity = '1'
                          e.target.style.display = 'block'
                          const placeholder = e.target.parentElement.querySelector('.image-placeholder')
                          if (placeholder) placeholder.classList.add('hidden')
                        }}
                      />
                    ) : null}
                    <div className={`image-placeholder w-full h-full flex items-center justify-center text-gray-400 ${imageSrc ? 'hidden' : ''}`}>
                      <Icon className="w-12 h-12" />
                    </div>
                  </div>
                )
              })()}

              <div className="flex items-start space-x-4 flex-1">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-xl font-semibold">
                      {listing.type === 'Flight' 
                        ? `${listing.departureAirport || 'N/A'} → ${listing.arrivalAirport || 'N/A'}`
                        : listing.flightId || listing.hotelName || `${listing.model} (${listing.year})`
                      }
                    </h3>
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      Pending
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-3 space-y-1">
                    <p>
                      <span className="font-medium">Provider:</span> {listing.providerName || 'N/A'}
                    </p>
                    {listing.type === 'Flight' && listing.flightId && (
                      <p>
                        <span className="font-medium">Flight ID:</span> {listing.flightId}
                      </p>
                    )}
                    {listing.type !== 'Flight' && (
                      <p>
                        <span className="font-medium">ID:</span> {listingId}
                      </p>
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
                  ) : (
                    <>
                      {/* Flight Details */}
                      {listing.type === 'Flight' && (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2 text-gray-700">
                            <Icon className="w-5 h-5 text-purple-600" />
                            <span className="text-lg font-semibold">{listing.departureAirport} → {listing.arrivalAirport}</span>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4 text-sm">
                            <div className="space-y-2">
                              <p className="text-gray-600"><strong>Flight ID:</strong> {listing.flightId || listingId}</p>
                              {listing.departureTime && listing.arrivalTime && (
                                <div className="space-y-2 pt-2 border-t border-gray-200">
                                  <div className="flex items-center space-x-2 text-gray-600">
                                    <Clock className="w-4 h-4 text-blue-500" />
                                    <span><strong>Departure:</strong> {listing.departureTime}</span>
                                  </div>
                                  <div className="flex items-center space-x-2 text-gray-600">
                                    <Clock className="w-4 h-4 text-green-500" />
                                    <span><strong>Arrival:</strong> {listing.arrivalTime}</span>
                                  </div>
                                  {listing.duration && (
                                    <div className="flex items-center space-x-2 text-gray-600">
                                      <Clock className="w-4 h-4 text-purple-500" />
                                      <span><strong>Duration:</strong> {Math.floor(listing.duration / 60)}h {listing.duration % 60}m</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div>
                              {(listing.availableFrom || listing.availableTo) && (
                                <div className="flex items-start space-x-2 text-sm text-gray-600 mb-2">
                                  <Calendar className="w-4 h-4 mt-0.5" />
                                  <span>
                                    Available from {listing.availableFrom ? new Date(listing.availableFrom).toLocaleDateString() : 'N/A'} 
                                    {' '}to {listing.availableTo ? new Date(listing.availableTo).toLocaleDateString() : 'N/A'}
                                  </span>
                                </div>
                              )}
                              {listing.operatingDays && listing.operatingDays.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-gray-600 mb-1"><strong>Operating Days:</strong></p>
                                  <div className="flex flex-wrap gap-2">
                                    {listing.operatingDays.map((day, idx) => (
                                      <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                        {day}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Seat Types */}
                          {listing.seatTypes && listing.seatTypes.length > 0 ? (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Seat Types & Pricing</h4>
                              <div className="grid md:grid-cols-3 gap-4">
                                {listing.seatTypes.map((seatType, idx) => (
                                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
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
                          ) : (
                            <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                              <p><strong>Class:</strong> {listing.flightClass || 'N/A'}</p>
                              <p><strong>Price:</strong> ${listing.ticketPrice || 0}</p>
                              <p><strong>Seats:</strong> {listing.availableSeats || 0}/{listing.totalSeats || 0}</p>
                            </div>
                          )}
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

      {/* Pagination */}
      {paginatedListings.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={paginatedListings.totalPages}
          totalItems={paginatedListings.totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  )
}

export default PendingRequestsTab

