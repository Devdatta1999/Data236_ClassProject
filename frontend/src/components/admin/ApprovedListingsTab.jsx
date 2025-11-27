import { useState, useEffect } from 'react'
import { Plane, Hotel, Car, CheckCircle, Star, MapPin, Calendar } from 'lucide-react'
import api from '../../services/apiService'

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

const ApprovedListingsTab = ({ onRefresh }) => {
  const [approvedListings, setApprovedListings] = useState({
    flights: [],
    hotels: [],
    cars: []
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchApprovedListings()
  }, [])

  const fetchApprovedListings = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/admin/listings/approved')
      const data = response.data.data?.approvedListings || {}
      setApprovedListings({
        flights: data.flights || [],
        hotels: data.hotels || [],
        cars: data.cars || []
      })
    } catch (err) {
      console.error('Error fetching approved listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const allListings = [
    ...approvedListings.flights.map(l => ({ ...l, type: 'Flight', icon: Plane })),
    ...approvedListings.hotels.map(l => ({ ...l, type: 'Hotel', icon: Hotel })),
    ...approvedListings.cars.map(l => ({ ...l, type: 'Car', icon: Car })),
  ]

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">Loading approved listings...</p>
      </div>
    )
  }

  if (allListings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">No approved listings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Approved Listings</h2>
        <button
          onClick={fetchApprovedListings}
          className="btn-secondary"
        >
          Refresh
        </button>
      </div>
      
      {allListings.map((listing) => {
        const Icon = listing.icon
        const listingId = listing.flightId || listing.hotelId || listing.carId
        const isHotel = listing.type === 'Hotel'

        return (
          <div key={listingId} className="card overflow-hidden">
            <div className={`flex ${isHotel ? 'flex-col md:flex-row' : 'items-start'} justify-between gap-4`}>
              {/* Listing Image */}
              {(() => {
                let imageSrc = null
                let imageAlt = ''
                
                // Check for hotel images
                if (isHotel && listing.images && listing.images.length > 0 && listing.images[0]) {
                  imageSrc = getImageSrc(listing.images[0])
                  imageAlt = listing.hotelName || 'Hotel'
                } 
                // Check for flight image (can be null, empty string, or URL)
                else if (listing.type === 'Flight' && listing.image && listing.image.trim()) {
                  imageSrc = getImageSrc(listing.image)
                  imageAlt = listing.flightId || 'Flight'
                } 
                // Check for car image
                else if (listing.type === 'Car' && listing.image && listing.image.trim()) {
                  imageSrc = getImageSrc(listing.image)
                  imageAlt = listing.model || listing.carModel || 'Car'
                }
                
                if (imageSrc) {
                  return (
                    <div className="md:w-64 h-48 md:h-auto flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                      <img
                        src={imageSrc}
                        alt={imageAlt}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Image failed to load:', imageSrc)
                          e.target.style.display = 'none'
                          if (e.target.nextSibling) e.target.nextSibling.classList.remove('hidden')
                        }}
                      />
                      <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
                        <Icon className="w-12 h-12" />
                      </div>
                    </div>
                  )
                }
                
                // Show placeholder icon if no image
                return (
                  <div className="md:w-64 h-48 md:h-auto flex-shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-12 h-12 text-green-600" />
                  </div>
                )
              })()}

              <div className="flex items-start space-x-4 flex-1">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-xl font-semibold">
                      {listing.flightId || listing.hotelName || `${listing.model} (${listing.year})`}
                    </h3>
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Active</span>
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
                      {/* Flight specific details */}
                      {listing.type === 'Flight' && (
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><strong>Route:</strong> {listing.departureAirport} → {listing.arrivalAirport}</p>
                          <p><strong>Class:</strong> {listing.flightClass} | <strong>Price:</strong> ${listing.ticketPrice}</p>
                          <p><strong>Available Seats:</strong> {listing.availableSeats} / {listing.totalSeats}</p>
                        </div>
                      )}
                      
                      {/* Car specific details */}
                      {listing.type === 'Car' && (
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><strong>Type:</strong> {listing.carType} | <strong>Transmission:</strong> {listing.transmissionType}</p>
                          <p><strong>Seats:</strong> {listing.numberOfSeats} | <strong>Daily Rate:</strong> ${listing.dailyRentalPrice}</p>
                          <p><strong>Status:</strong> {listing.availabilityStatus}</p>
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
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ApprovedListingsTab

