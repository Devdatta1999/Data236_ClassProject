import { useState, useEffect } from 'react'
import { Plane, Hotel, Car, Trash2, AlertCircle } from 'lucide-react'
import api from '../../services/apiService'

const MyListingsTab = ({ onRefresh }) => {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState({})

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/providers/listings')
      const data = response.data.data?.listings || []
      setListings(data)
    } catch (err) {
      console.error('Error fetching listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (listingId, listingType) => {
    if (!window.confirm(`Are you sure you want to delete this ${listingType.toLowerCase()} listing? This action cannot be undone.`)) {
      return
    }

    setDeleting({ [listingId]: true })
    try {
      await api.delete('/api/providers/listings', {
        data: { listingId, listingType }
      })
      // Remove from local state
      setListings(listings.filter(l => l.listingId !== listingId))
      if (onRefresh) onRefresh()
      alert('Listing deleted successfully!')
    } catch (err) {
      console.error('Error deleting listing:', err)
      alert('Failed to delete listing: ' + (err.response?.data?.error?.message || err.message))
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
      return [
        `Class: ${listing.flightClass}`,
        `Price: $${listing.ticketPrice}`,
        `Seats: ${listing.availableSeats}/${listing.totalSeats}`
      ]
    } else if (listing.listingType === 'Hotel') {
      return [
        `${listing.city}, ${listing.state}`,
        `Rating: ${'⭐'.repeat(listing.starRating)}`,
        `Rooms: ${listing.availableRooms}/${listing.totalRooms}`
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

  // Group listings by status
  const groupedListings = {
    Active: listings.filter(l => l.status === 'Active'),
    Pending: listings.filter(l => l.status === 'Pending'),
    Inactive: listings.filter(l => l.status === 'Inactive')
  }

  return (
    <div className="space-y-6">
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
      <div className="space-y-4">
        {listings.map((listing) => {
          const Icon = getListingIcon(listing.listingType)
          const isDeleting = deleting[listing.listingId]

          return (
            <div key={listing.listingId} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
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
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-semibold">
                        {getListingTitle(listing)}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(listing.status)}`}>
                        {listing.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2">Type: {listing.listingType}</p>
                    <p className="text-sm text-gray-500 mb-2">
                      ID: {listing.listingId}
                    </p>
                    <div className="text-sm text-gray-600 space-y-1">
                      {getListingDetails(listing).map((detail, idx) => (
                        <p key={idx}>{detail}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(listing.listingId, listing.listingType)}
                  disabled={isDeleting}
                  className="btn-secondary text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MyListingsTab

