import { useState } from 'react'
import api from '../../services/apiService'
import { Plane, Hotel, Car } from 'lucide-react'

const CreateListingRequest = ({ onSuccess }) => {
  const [listingType, setListingType] = useState('Flight')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Submit listing request to provider service
      // This will create a listing with status 'Pending' for admin approval
      // Backend expects: { listingType, listingData: { ...formData } }
      const response = await api.post('/api/providers/listings', {
        listingType,
        listingData: formData
      })
      
      alert('Listing request submitted! It will be reviewed by admin.')
      setFormData({})
      if (onSuccess) onSuccess()
    } catch (err) {
      alert('Failed to submit listing request: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">Create Listing Request</h2>
        <p className="text-gray-600 mb-6">
          Submit a listing request. It will be reviewed and approved by an admin.
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Listing Type
          </label>
          <div className="flex space-x-4">
            {['Flight', 'Hotel', 'Car'].map((type) => (
              <button
                key={type}
                onClick={() => setListingType(type)}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg border-2 transition-colors ${
                  listingType === type
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                {type === 'Flight' && <Plane className="w-5 h-5" />}
                {type === 'Hotel' && <Hotel className="w-5 h-5" />}
                {type === 'Car' && <Car className="w-5 h-5" />}
                <span>{type}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Similar form fields as CreateListingTab but for host submission */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Your listing will be reviewed by an admin before being published.
            </p>
          </div>

          {listingType === 'Flight' && (
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="datetime-local"
                placeholder="Departure Date & Time"
                value={formData.departureDateTime || ''}
                onChange={(e) => setFormData({ ...formData, departureDateTime: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="datetime-local"
                placeholder="Arrival Date & Time"
                value={formData.arrivalDateTime || ''}
                onChange={(e) => setFormData({ ...formData, arrivalDateTime: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="text"
                placeholder="Departure Airport (e.g., SFO)"
                value={formData.departureAirport || ''}
                onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value.toUpperCase() })}
                className="input-field"
                maxLength="3"
                required
              />
              <input
                type="text"
                placeholder="Arrival Airport (e.g., LAX)"
                value={formData.arrivalAirport || ''}
                onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value.toUpperCase() })}
                className="input-field"
                maxLength="3"
                required
              />
              <input
                type="number"
                placeholder="Duration (minutes)"
                value={formData.duration || ''}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                className="input-field"
                min="1"
                required
              />
              <select
                value={formData.flightClass || ''}
                onChange={(e) => setFormData({ ...formData, flightClass: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Select Class</option>
                <option value="Economy">Economy</option>
                <option value="Business">Business</option>
                <option value="First">First</option>
              </select>
              <input
                type="number"
                placeholder="Ticket Price ($)"
                value={formData.ticketPrice || ''}
                onChange={(e) => setFormData({ ...formData, ticketPrice: parseFloat(e.target.value) })}
                className="input-field"
                min="0"
                step="0.01"
                required
              />
              <input
                type="number"
                placeholder="Total Seats"
                value={formData.totalSeats || ''}
                onChange={(e) => setFormData({ ...formData, totalSeats: parseInt(e.target.value), availableSeats: parseInt(e.target.value) })}
                className="input-field"
                min="1"
                required
              />
            </div>
          )}

          {listingType === 'Hotel' && (
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Hotel Name"
                value={formData.hotelName || ''}
                onChange={(e) => setFormData({ ...formData, hotelName: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="text"
                placeholder="Street Address"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="text"
                placeholder="City"
                value={formData.city || ''}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="text"
                placeholder="State (e.g., CA)"
                value={formData.state || ''}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                className="input-field"
                maxLength="2"
                required
              />
              <input
                type="text"
                placeholder="ZIP Code"
                value={formData.zipCode || ''}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                className="input-field"
                required
              />
              <input
                type="number"
                placeholder="Star Rating (1-5)"
                value={formData.starRating || ''}
                onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) })}
                className="input-field"
                min="1"
                max="5"
                required
              />
              <input
                type="number"
                placeholder="Total Rooms"
                value={formData.totalRooms || ''}
                onChange={(e) => {
                  const total = parseInt(e.target.value);
                  setFormData({ 
                    ...formData, 
                    totalRooms: total,
                    availableRooms: total // Initially all rooms are available
                  });
                }}
                className="input-field"
                min="1"
                required
              />
            </div>
          )}

          {listingType === 'Car' && (
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Car Model (e.g., Toyota Camry)"
                value={formData.model || ''}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="input-field"
                required
              />
              <select
                value={formData.carType || ''}
                onChange={(e) => setFormData({ ...formData, carType: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Select Car Type</option>
                <option value="SUV">SUV</option>
                <option value="Sedan">Sedan</option>
                <option value="Compact">Compact</option>
                <option value="Luxury">Luxury</option>
                <option value="Convertible">Convertible</option>
                <option value="Truck">Truck</option>
                <option value="Van">Van</option>
              </select>
              <input
                type="number"
                placeholder="Year (e.g., 2023)"
                value={formData.year || ''}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                className="input-field"
                min="1900"
                max={new Date().getFullYear() + 1}
                required
              />
              <select
                value={formData.transmissionType || ''}
                onChange={(e) => setFormData({ ...formData, transmissionType: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Select Transmission</option>
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
              </select>
              <input
                type="number"
                placeholder="Number of Seats"
                value={formData.numberOfSeats || ''}
                onChange={(e) => setFormData({ ...formData, numberOfSeats: parseInt(e.target.value) })}
                className="input-field"
                min="2"
                max="15"
                required
              />
              <input
                type="number"
                placeholder="Daily Rental Price ($)"
                value={formData.dailyRentalPrice || ''}
                onChange={(e) => setFormData({ ...formData, dailyRentalPrice: parseFloat(e.target.value) })}
                className="input-field"
                min="0"
                step="0.01"
                required
              />
              <input
                type="date"
                placeholder="Available From"
                value={formData.availableFrom || ''}
                onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                className="input-field"
                required
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="date"
                placeholder="Available To"
                value={formData.availableTo || ''}
                onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                className="input-field"
                required
                min={formData.availableFrom || new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Listing Request'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateListingRequest

