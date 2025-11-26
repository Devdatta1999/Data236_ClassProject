import { useState, useEffect } from 'react'
import { Plane, Hotel, Car, CheckCircle } from 'lucide-react'
import api from '../../services/apiService'

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
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
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

        return (
          <div key={listingId} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                <div className="bg-green-100 p-3 rounded-lg">
                  <Icon className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">
                    {listing.flightId || listing.hotelName || `${listing.model} (${listing.year})`}
                  </h3>
                  <p className="text-gray-600 mb-2">Type: {listing.type}</p>
                  <p className="text-sm text-gray-500 mb-2">
                    Provider: {listing.providerName || 'N/A'}
                  </p>
                  
                  {/* Flight specific details */}
                  {listing.type === 'Flight' && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Route: {listing.departureAirport} → {listing.arrivalAirport}</p>
                      <p>Class: {listing.flightClass} | Price: ${listing.ticketPrice}</p>
                      <p>Available Seats: {listing.availableSeats} / {listing.totalSeats}</p>
                    </div>
                  )}
                  
                  {/* Hotel specific details */}
                  {listing.type === 'Hotel' && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Location: {listing.city}, {listing.state}</p>
                      <p>Rating: {'⭐'.repeat(listing.starRating)} | Available Rooms: {listing.availableRooms} / {listing.totalRooms}</p>
                    </div>
                  )}
                  
                  {/* Car specific details */}
                  {listing.type === 'Car' && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Type: {listing.carType} | Transmission: {listing.transmissionType}</p>
                      <p>Seats: {listing.numberOfSeats} | Daily Rate: ${listing.dailyRentalPrice}</p>
                      <p>Status: {listing.availabilityStatus}</p>
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p><strong>Location:</strong></p>
                        {listing.neighbourhood && (
                          <p className="ml-4">Neighbourhood: {listing.neighbourhood}</p>
                        )}
                        <p className="ml-4">City: {listing.city || 'N/A'}</p>
                        <p className="ml-4">State: {listing.state || 'N/A'}</p>
                        <p className="ml-4">Country: {listing.country || 'USA'}</p>
                      </div>
                    </div>
                  )}
                  
                  <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>{listing.status}</span>
                  </span>
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

