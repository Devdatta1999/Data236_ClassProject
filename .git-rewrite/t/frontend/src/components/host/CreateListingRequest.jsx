import { useState } from 'react'
import api from '../../services/apiService'
import { Plane, Hotel, Car, Plus, X, Star } from 'lucide-react'
import { US_STATES } from '../../utils/usStates'
import { US_AIRPORTS } from '../../utils/usAirports'
import Notification from '../common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

const HOTEL_AMENITIES = [
  'WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service', 
  'Parking', 'Airport Shuttle', 'Business Center', 'Pet Friendly', 
  'Breakfast Included', 'Laundry', 'Concierge', 'Beach Access'
]

const CreateListingRequest = ({ onSuccess }) => {
  const [listingType, setListingType] = useState('Flight')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ country: 'USA' }) // Always default to USA
  const [notification, setNotification] = useState(null)
  const [hotelRoomTypes, setHotelRoomTypes] = useState([
    { type: 'Standard', availableCount: 0, pricePerNight: 0 },
    { type: 'Suite', availableCount: 0, pricePerNight: 0 },
    { type: 'Deluxe', availableCount: 0, pricePerNight: 0 }
  ])
  const [flightSeatTypes, setFlightSeatTypes] = useState([
    { type: 'Economy', totalSeats: 0, ticketPrice: 0 },
    { type: 'Business', totalSeats: 0, ticketPrice: 0 },
    { type: 'First', totalSeats: 0, ticketPrice: 0 }
  ])
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [customAmenity, setCustomAmenity] = useState('')
  const [hotelImages, setHotelImages] = useState([]) // Array of image URLs (from uploads)
  const [uploadingImages, setUploadingImages] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Ensure country is always set to USA
      let submitData = {
        ...formData,
        country: 'USA'
      }
      
      // For hotels, process room types and calculate total rooms
      if (listingType === 'Hotel') {
        // Calculate total rooms from room types
        const totalRooms = hotelRoomTypes.reduce((sum, rt) => sum + (rt.availableCount || 0), 0)
        const availableRooms = totalRooms
        
        submitData = {
          ...submitData,
          roomTypes: hotelRoomTypes.filter(rt => rt.availableCount > 0),
          totalRooms,
          availableRooms,
          amenities: selectedAmenities,
          images: hotelImages.filter(img => img.trim() !== '')
        }
        
        // Validate hotel data
        if (totalRooms === 0) {
          setNotification({ type: 'error', message: 'Please add at least one room type with availability' })
          setLoading(false)
          return
        }
        
        if (!submitData.availableFrom || !submitData.availableTo) {
          setNotification({ type: 'error', message: 'Please select available from and to dates' })
          setLoading(false)
          return
        }
      }
      
      // For flights, process seat types
      if (listingType === 'Flight') {
        // Validate operating days
        if (!submitData.operatingDays || submitData.operatingDays.length === 0) {
          setNotification({ type: 'error', message: 'Please select at least one operating day' })
          setLoading(false)
          return
        }
        
        // Calculate duration from departure and arrival times if not already set
        if (!submitData.duration && submitData.departureTime && submitData.arrivalTime) {
          const [depHours, depMins] = submitData.departureTime.split(':').map(Number)
          const [arrHours, arrMins] = submitData.arrivalTime.split(':').map(Number)
          const depMinutes = depHours * 60 + depMins
          const arrMinutes = arrHours * 60 + arrMins
          submitData.duration = arrMinutes >= depMinutes 
            ? arrMinutes - depMinutes 
            : (24 * 60) - depMinutes + arrMinutes
        }
        
        submitData = {
          ...submitData,
          departureTime: submitData.departureTime,
          arrivalTime: submitData.arrivalTime,
          operatingDays: submitData.operatingDays,
          seatTypes: flightSeatTypes.filter(st => st.totalSeats > 0).map(st => ({
            type: st.type,
            ticketPrice: st.ticketPrice,
            totalSeats: st.totalSeats,
            availableSeats: st.totalSeats // Backend will use this as initial capacity
          }))
        }
        
        // Validate flight data
        const totalSeats = flightSeatTypes.reduce((sum, st) => sum + (st.totalSeats || 0), 0)
        if (totalSeats === 0) {
          setNotification({ type: 'error', message: 'Please add at least one seat type with seats' })
          setLoading(false)
          return
        }
        
        if (!submitData.availableFrom || !submitData.availableTo) {
          setNotification({ type: 'error', message: 'Please select available from and to dates' })
          setLoading(false)
          return
        }
        
        if (!submitData.departureTime || !submitData.arrivalTime) {
          setNotification({ type: 'error', message: 'Please select departure and arrival times' })
          setLoading(false)
          return
        }
      }
      
      // Submit listing request to provider service
      // This will create a listing with status 'Pending' for admin approval
      // Backend expects: { listingType, listingData: { ...formData } }
      const response = await api.post('/api/providers/listings', {
        listingType,
        listingData: submitData
      })
      
      setNotification({ type: 'success', message: 'Listing request submitted! It will be reviewed by admin.' })
      // Reset all form data
      setFormData({ country: 'USA' }) // Reset form but keep country as USA
      if (listingType === 'Hotel') {
        setHotelRoomTypes([
          { type: 'Standard', availableCount: 0, pricePerNight: 0 },
          { type: 'Suite', availableCount: 0, pricePerNight: 0 },
          { type: 'Deluxe', availableCount: 0, pricePerNight: 0 }
        ])
        setSelectedAmenities([])
        setCustomAmenity('')
        setHotelImages([]) // Reset to empty array, not ['']
      }
      if (listingType === 'Flight') {
        setFlightSeatTypes([
          { type: 'Economy', totalSeats: 0, ticketPrice: 0 },
          { type: 'Business', totalSeats: 0, ticketPrice: 0 },
          { type: 'First', totalSeats: 0, ticketPrice: 0 }
        ])
      }
      // Small delay to show success message before callback
      setTimeout(() => {
        if (onSuccess) onSuccess()
      }, 1500)
    } catch (err) {
      const errorMessage = err.message || err.response?.data?.error?.message || 'Failed to submit listing request'
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">Create Listing Request</h2>
        
        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}
        
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
            <div className="space-y-6">
              {/* Basic Flight Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Flight Information</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Flight ID *</label>
                    <input
                      type="text"
                      placeholder="e.g., AA123"
                      value={formData.flightId || ''}
                      onChange={(e) => setFormData({ ...formData, flightId: e.target.value.toUpperCase() })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Departure Airport *</label>
                    <select
                      value={formData.departureAirport || ''}
                      onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="">Select Departure Airport</option>
                      {US_AIRPORTS.map((airport) => (
                        <option key={airport.code} value={airport.code}>
                          {airport.code} - {airport.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Arrival Airport *</label>
                    <select
                      value={formData.arrivalAirport || ''}
                      onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="">Select Arrival Airport</option>
                      {US_AIRPORTS.map((airport) => (
                        <option key={airport.code} value={airport.code}>
                          {airport.code} - {airport.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Departure Time *</label>
                    <input
                      type="time"
                      value={formData.departureTime || ''}
                      onChange={(e) => {
                        const depTime = e.target.value
                        setFormData({ ...formData, departureTime: depTime })
                        // Auto-calculate duration if arrival time is set
                        if (formData.arrivalTime && depTime) {
                          const [depHours, depMins] = depTime.split(':').map(Number)
                          const [arrHours, arrMins] = formData.arrivalTime.split(':').map(Number)
                          const depMinutes = depHours * 60 + depMins
                          const arrMinutes = arrHours * 60 + arrMins
                          const duration = arrMinutes >= depMinutes 
                            ? arrMinutes - depMinutes 
                            : (24 * 60) - depMinutes + arrMinutes
                          setFormData(prev => ({ ...prev, departureTime: depTime, duration }))
                        }
                      }}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Arrival Time *</label>
                    <input
                      type="time"
                      value={formData.arrivalTime || ''}
                      onChange={(e) => {
                        const arrTime = e.target.value
                        setFormData({ ...formData, arrivalTime: arrTime })
                        // Auto-calculate duration if departure time is set
                        if (formData.departureTime && arrTime) {
                          const [depHours, depMins] = formData.departureTime.split(':').map(Number)
                          const [arrHours, arrMins] = arrTime.split(':').map(Number)
                          const depMinutes = depHours * 60 + depMins
                          const arrMinutes = arrHours * 60 + arrMins
                          const duration = arrMinutes >= depMinutes 
                            ? arrMinutes - depMinutes 
                            : (24 * 60) - depMinutes + arrMinutes
                          setFormData(prev => ({ ...prev, arrivalTime: arrTime, duration }))
                        }
                      }}
                      className="input-field"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Operating Days *</label>
                    <div className="flex flex-wrap gap-3">
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                        <label key={day} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.operatingDays?.includes(day) || false}
                            onChange={(e) => {
                              const currentDays = formData.operatingDays || []
                              if (e.target.checked) {
                                setFormData({ ...formData, operatingDays: [...currentDays, day] })
                              } else {
                                setFormData({ ...formData, operatingDays: currentDays.filter(d => d !== day) })
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{day}</span>
                        </label>
                      ))}
                    </div>
                    {formData.operatingDays && formData.operatingDays.length === 0 && (
                      <p className="text-red-500 text-xs mt-1">Please select at least one operating day</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Availability Dates */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Availability Period</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Available From *</label>
                    <input
                      type="date"
                      value={formData.availableFrom || ''}
                      onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                      className="input-field"
                      required
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Available To *</label>
                    <input
                      type="date"
                      value={formData.availableTo || ''}
                      onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                      className="input-field"
                      required
                      min={formData.availableFrom || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              {/* Seat Types & Pricing */}
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Seat Types & Pricing
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Total Seats: {flightSeatTypes.reduce((sum, st) => sum + (st.totalSeats || 0), 0)})
                  </span>
                </h3>
                <div className="space-y-4">
                  {flightSeatTypes.map((seatType, index) => (
                    <div key={index} className="grid md:grid-cols-3 gap-4 p-4 border border-gray-200 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Seat Type</label>
                        <input
                          type="text"
                          value={seatType.type}
                          readOnly
                          className="input-field bg-gray-50 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Total Seats</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={seatType.totalSeats || ''}
                          onChange={(e) => {
                            const updated = [...flightSeatTypes]
                            updated[index].totalSeats = parseInt(e.target.value) || 0
                            setFlightSeatTypes(updated)
                          }}
                          className="input-field"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Ticket Price ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={seatType.ticketPrice || ''}
                          onChange={(e) => {
                            const updated = [...flightSeatTypes]
                            updated[index].ticketPrice = parseFloat(e.target.value) || 0
                            setFlightSeatTypes(updated)
                          }}
                          className="input-field"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {listingType === 'Hotel' && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hotel Name *</label>
                    <input
                      type="text"
                      placeholder="Hotel Name"
                      value={formData.hotelName || ''}
                      onChange={(e) => setFormData({ ...formData, hotelName: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Star Rating *</label>
                    <select
                      value={formData.starRating || ''}
                      onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) })}
                      className="input-field"
                      required
                    >
                      <option value="">Select Rating</option>
                      {[1, 2, 3, 4, 5].map(rating => (
                        <option key={rating} value={rating}>
                          {rating} {rating === 1 ? 'Star' : 'Stars'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Street Address *</label>
                    <input
                      type="text"
                      placeholder="Street Address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                    <input
                      type="text"
                      placeholder="City"
                      value={formData.city || ''}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                    <select
                      value={formData.state || ''}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="">Select State</option>
                      {US_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.code} - {state.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code *</label>
                    <input
                      type="text"
                      placeholder="ZIP Code"
                      value={formData.zipCode || ''}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                    <input
                      type="text"
                      value="USA"
                      readOnly
                      className="input-field bg-gray-50 cursor-not-allowed"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Availability Dates */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Availability</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Available From *</label>
                    <input
                      type="date"
                      value={formData.availableFrom || ''}
                      onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                      className="input-field"
                      required
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Available To *</label>
                    <input
                      type="date"
                      value={formData.availableTo || ''}
                      onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                      className="input-field"
                      required
                      min={formData.availableFrom || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              {/* Room Types */}
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Room Types & Pricing
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Total Rooms: {hotelRoomTypes.reduce((sum, rt) => sum + (rt.availableCount || 0), 0)})
                  </span>
                </h3>
                <div className="space-y-4">
                  {hotelRoomTypes.map((roomType, index) => (
                    <div key={index} className="grid md:grid-cols-3 gap-4 p-4 border border-gray-200 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Room Type</label>
                        <input
                          type="text"
                          value={roomType.type}
                          readOnly
                          className="input-field bg-gray-50 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Available Count</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={roomType.availableCount || ''}
                          onChange={(e) => {
                            const updated = [...hotelRoomTypes]
                            updated[index].availableCount = parseInt(e.target.value) || 0
                            setHotelRoomTypes(updated)
                          }}
                          className="input-field"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Price Per Night ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={roomType.pricePerNight || ''}
                          onChange={(e) => {
                            const updated = [...hotelRoomTypes]
                            updated[index].pricePerNight = parseFloat(e.target.value) || 0
                            setHotelRoomTypes(updated)
                          }}
                          className="input-field"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amenities */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Amenities</h3>
                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  {HOTEL_AMENITIES.map((amenity) => (
                    <label key={amenity} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAmenities.includes(amenity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAmenities([...selectedAmenities, amenity])
                          } else {
                            setSelectedAmenities(selectedAmenities.filter(a => a !== amenity))
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{amenity}</span>
                    </label>
                  ))}
                </div>
                {/* Custom Amenity Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom amenity (e.g., Rooftop Bar)"
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && customAmenity.trim()) {
                        e.preventDefault()
                        if (!selectedAmenities.includes(customAmenity.trim())) {
                          setSelectedAmenities([...selectedAmenities, customAmenity.trim()])
                        }
                        setCustomAmenity('')
                      }
                    }}
                    className="input-field flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customAmenity.trim() && !selectedAmenities.includes(customAmenity.trim())) {
                        setSelectedAmenities([...selectedAmenities, customAmenity.trim()])
                        setCustomAmenity('')
                      }
                    }}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>
                {/* Selected Custom Amenities */}
                {selectedAmenities.filter(a => !HOTEL_AMENITIES.includes(a)).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedAmenities.filter(a => !HOTEL_AMENITIES.includes(a)).map((amenity, idx) => (
                      <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                        {amenity}
                        <button
                          type="button"
                          onClick={() => setSelectedAmenities(selectedAmenities.filter(a => a !== amenity))}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Images */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Hotel Images</h3>
                <div className="space-y-4">
                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Images (JPG, PNG, GIF, WebP - Max 5MB each)
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files)
                        if (files.length === 0) return

                        setUploadingImages(true)
                        try {
                          const formData = new FormData()
                          files.forEach(file => {
                            formData.append('images', file)
                          })

                          const response = await api.post('/api/listings/upload/images', formData, {
                            headers: {
                              'Content-Type': 'multipart/form-data',
                            },
                          })

                          const uploadedUrls = response.data.data.images.map(img => img.imageUrl)
                          setHotelImages([...hotelImages, ...uploadedUrls])
                          setNotification({ type: 'success', message: `Successfully uploaded ${files.length} image(s)` })
                        } catch (err) {
                          console.error('Image upload error:', err)
                          const errorMessage = err.response?.data?.error?.message 
                            || err.response?.data?.message 
                            || err.message 
                            || 'Failed to upload images. Please check file size (max 5MB) and format (JPG, PNG, GIF, WebP).'
                          setNotification({ 
                            type: 'error', 
                            message: errorMessage
                          })
                        } finally {
                          setUploadingImages(false)
                          // Reset file input
                          e.target.value = ''
                        }
                      }}
                      className="input-field"
                      disabled={uploadingImages}
                    />
                    {uploadingImages && (
                      <p className="text-sm text-gray-500 mt-2">Uploading images...</p>
                    )}
                  </div>

                  {/* Image Preview Gallery */}
                  {hotelImages.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Uploaded Images ({hotelImages.length})
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {hotelImages.map((imageUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={imageUrl.startsWith('http') ? imageUrl : `${API_BASE_URL}${imageUrl}`}
                              alt={`Hotel image ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border border-gray-200"
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/300x200?text=Image+Error'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setHotelImages(hotelImages.filter((_, i) => i !== index))}
                              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
              <input
                type="text"
                placeholder="Neighbourhood (e.g., Manhattan)"
                value={formData.neighbourhood || ''}
                onChange={(e) => setFormData({ ...formData, neighbourhood: e.target.value })}
                className="input-field"
              />
              <input
                type="text"
                placeholder="City (e.g., New York)"
                value={formData.city || ''}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="input-field"
                required
              />
              <select
                value={formData.state || ''}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Select State</option>
                {US_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} - {state.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Country"
                value="USA"
                readOnly
                className="input-field bg-gray-50 cursor-not-allowed"
                required
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

