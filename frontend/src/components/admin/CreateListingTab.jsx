import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '../../services/apiService'
import { Plane, Hotel, Car, ChevronDown, Plus, X } from 'lucide-react'
import { US_STATES } from '../../utils/usStates'
import Notification from '../common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

const HOTEL_AMENITIES = [
  'WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service', 
  'Parking', 'Airport Shuttle', 'Business Center', 'Pet Friendly', 
  'Breakfast Included', 'Laundry', 'Concierge', 'Beach Access'
]

const CreateListingTab = () => {
  const [listingType, setListingType] = useState('Flight')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ country: 'USA' }) // Always default to USA
  const [providerSuggestions, setProviderSuggestions] = useState([])
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [providerSearchQuery, setProviderSearchQuery] = useState('')
  const providerDropdownRef = useRef(null)
  const [notification, setNotification] = useState(null)
  const [hotelRoomTypes, setHotelRoomTypes] = useState([
    { type: 'Standard', availableCount: 0, pricePerNight: 0 },
    { type: 'Suite', availableCount: 0, pricePerNight: 0 },
    { type: 'Deluxe', availableCount: 0, pricePerNight: 0 }
  ])
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [customAmenity, setCustomAmenity] = useState('')
  const [hotelImages, setHotelImages] = useState([]) // Array of image URLs (from uploads)
  const [uploadingImages, setUploadingImages] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = `/api/listings/${listingType.toLowerCase()}s`
      
      // Prepare data based on listing type
      let listingData = { ...formData }
      
      // Auto-generate IDs if not provided
      if (listingType === 'Flight' && !listingData.flightId) {
        listingData.flightId = `FLT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      } else if (listingType === 'Hotel' && !listingData.hotelId) {
        listingData.hotelId = `HTL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      } else if (listingType === 'Car' && !listingData.carId) {
        listingData.carId = `CAR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      }
      
      // Fix field names for Car
      if (listingType === 'Car') {
        if (listingData.carModel) {
          listingData.model = listingData.carModel
          delete listingData.carModel
        }
        if (listingData.seats) {
          listingData.numberOfSeats = listingData.seats
          delete listingData.seats
        }
        if (listingData.availableCars) {
          // Car model doesn't have availableCars, remove it
          delete listingData.availableCars
        }
        // Location fields (neighbourhood, city, state, country) are now part of the Car model
        // Always set country to 'USA' (fixed for this app)
        listingData.country = 'USA'
        // Add required fields
        if (!listingData.year) {
          listingData.year = new Date().getFullYear()
        }
        // Provider ID should be set when provider is selected via autocomplete
        // If not set, throw error (admin must select a provider)
        if (!listingData.providerId) {
          throw new Error('Please select a provider from the dropdown')
        }
        // Ensure availableFrom and availableTo are Date objects
        if (listingData.availableFrom) {
          listingData.availableFrom = new Date(listingData.availableFrom).toISOString()
        } else {
          // Default to today if not provided
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          listingData.availableFrom = today.toISOString()
        }
        if (listingData.availableTo) {
          listingData.availableTo = new Date(listingData.availableTo).toISOString()
        } else {
          // Default to 1 year from today if not provided
          const oneYearFromNow = new Date()
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
          oneYearFromNow.setHours(23, 59, 59, 999)
          listingData.availableTo = oneYearFromNow.toISOString()
        }
      }
      
      // Fix field names for Hotel
      if (listingType === 'Hotel') {
        // Calculate total rooms from room types
        const totalRooms = hotelRoomTypes.reduce((sum, rt) => sum + (rt.availableCount || 0), 0)
        const availableRooms = totalRooms
        
        listingData.roomTypes = hotelRoomTypes.filter(rt => rt.availableCount > 0)
        listingData.totalRooms = totalRooms
        listingData.availableRooms = availableRooms
        listingData.amenities = selectedAmenities
        listingData.images = hotelImages.filter(img => img && img.trim() !== '')
        
        // Validate hotel data
        if (totalRooms === 0) {
          setNotification({ type: 'error', message: 'Please add at least one room type with availability' })
          setLoading(false)
          return
        }
        
        if (!listingData.availableFrom || !listingData.availableTo) {
          setNotification({ type: 'error', message: 'Please select available from and to dates' })
          setLoading(false)
          return
        }
        
        // Remove old fields
        delete listingData.roomType
        delete listingData.pricePerNight
        if (!listingData.zipCode) {
          listingData.zipCode = '00000' // Default if not provided
        }
        // Provider ID should be set when provider is selected via autocomplete
        // If not set, throw error (admin must select a provider)
        if (!listingData.providerId) {
          throw new Error('Please select a provider from the dropdown')
        }
      }
      
      // Fix field names for Flight
      if (listingType === 'Flight') {
        // Provider ID should be set when provider is selected via autocomplete
        // If not set, throw error (admin must select a provider)
        if (!listingData.providerId) {
          throw new Error('Please select a provider from the dropdown')
        }
        // Ensure flightId is uppercase
        if (listingData.flightId) {
          listingData.flightId = listingData.flightId.toUpperCase()
        }
        // Ensure dates are in correct format
        if (listingData.departureDateTime && typeof listingData.departureDateTime === 'string') {
          listingData.departureDateTime = new Date(listingData.departureDateTime).toISOString()
        }
        if (listingData.arrivalDateTime && typeof listingData.arrivalDateTime === 'string') {
          listingData.arrivalDateTime = new Date(listingData.arrivalDateTime).toISOString()
        }
        // Ensure airports are uppercase
        if (listingData.departureAirport) {
          listingData.departureAirport = listingData.departureAirport.toUpperCase()
        }
        if (listingData.arrivalAirport) {
          listingData.arrivalAirport = listingData.arrivalAirport.toUpperCase()
        }
      }
      
      // Set status to Active (auto-approved for admin)
      listingData.status = 'Active'
      
      await api.post(endpoint, listingData)
      setNotification({ type: 'success', message: 'Listing created successfully!' })
      setFormData({ country: 'USA' }) // Reset form but keep country as USA
      setProviderSearchQuery('') // Clear provider search query
    } catch (err) {
      console.error('Create listing error:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to create listing'
      setNotification({ type: 'error', message: errorMessage })
    } finally {
      setLoading(false)
    }
  }

  // Fetch provider suggestions for autocomplete
  useEffect(() => {
    const fetchProviders = async () => {
      if (providerSearchQuery.trim().length >= 2) {
        try {
          const response = await api.get(`/api/providers/search?q=${encodeURIComponent(providerSearchQuery)}`)
          setProviderSuggestions(response.data.data?.providers || [])
          setShowProviderDropdown(true)
        } catch (err) {
          console.error('Error fetching providers:', err)
          setProviderSuggestions([])
        }
      } else {
        setProviderSuggestions([])
        setShowProviderDropdown(false)
      }
    }

    const debounceTimer = setTimeout(fetchProviders, 300) // Debounce for 300ms
    return () => clearTimeout(debounceTimer)
  }, [providerSearchQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
        setShowProviderDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const inputRef = useRef(null)

  const handleProviderSelect = useCallback((provider) => {
    setFormData(prev => ({ ...prev, providerName: provider.providerName, providerId: provider.providerId }))
    setProviderSearchQuery(provider.providerName)
    setShowProviderDropdown(false)
  }, [])

  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value
    // Only update providerSearchQuery to avoid double renders that cause focus loss
    setProviderSearchQuery(newValue)
    // Don't close dropdown immediately when typing
    if (newValue.length >= 2) {
      setShowProviderDropdown(true)
    } else {
      setShowProviderDropdown(false)
      setProviderSuggestions([])
    }
  }, [])
  
  // Sync providerSearchQuery to formData when it changes (but only if providerId is not set)
  useEffect(() => {
    if (providerSearchQuery && !formData.providerId) {
      setFormData(prev => ({ ...prev, providerName: providerSearchQuery }))
    }
  }, [providerSearchQuery, formData.providerId])

  const handleInputFocus = useCallback(() => {
    if (providerSuggestions.length > 0) {
      setShowProviderDropdown(true)
    }
  }, [providerSuggestions.length])

  const handleInputBlur = useCallback((e) => {
    // Delay closing dropdown to allow click events
    // Check if the related target (the element receiving focus) is inside the dropdown
    const relatedTarget = e.relatedTarget || document.activeElement
    setTimeout(() => {
      // Only close if clicking outside the dropdown container
      if (!providerDropdownRef.current?.contains(relatedTarget)) {
        setShowProviderDropdown(false)
      }
    }, 200)
  }, [])

  // Render provider autocomplete input
  const renderProviderAutocomplete = (placeholder) => (
    <div className="relative" ref={providerDropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={providerSearchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="input-field pr-10"
          required
          autoComplete="off"
        />
        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
      </div>
      {showProviderDropdown && providerSuggestions.length > 0 && (
        <div 
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking dropdown
        >
          {providerSuggestions.map((provider) => (
            <div
              key={provider.providerId}
              onMouseDown={(e) => {
                e.preventDefault()
                handleProviderSelect(provider)
                inputRef.current?.blur()
              }}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900">{provider.providerName}</div>
              <div className="text-sm text-gray-500">{provider.email}</div>
            </div>
          ))}
        </div>
      )}
      {showProviderDropdown && providerSearchQuery.length >= 2 && providerSuggestions.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
          No providers found
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">Create New Listing</h2>
        
        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

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
                    ? 'border-purple-600 bg-purple-50 text-purple-600'
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
          {listingType === 'Flight' && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {renderProviderAutocomplete("Provider Name (type to search)")}
                <input
                  type="text"
                  placeholder="Provider ID (auto-filled when provider selected)"
                  value={formData.providerId || ''}
                  readOnly
                  className="input-field bg-gray-50 cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder="Departure Airport"
                  value={formData.departureAirport || ''}
                  onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="text"
                  placeholder="Arrival Airport"
                  value={formData.arrivalAirport || ''}
                  onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="datetime-local"
                  placeholder="Departure Date/Time"
                  value={formData.departureDateTime || ''}
                  onChange={(e) => setFormData({ ...formData, departureDateTime: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="datetime-local"
                  placeholder="Arrival Date/Time"
                  value={formData.arrivalDateTime || ''}
                  onChange={(e) => setFormData({ ...formData, arrivalDateTime: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="number"
                  placeholder="Duration (minutes)"
                  value={formData.duration || ''}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  className="input-field"
                  required
                />
                <select
                  value={formData.flightClass || 'Economy'}
                  onChange={(e) => setFormData({ ...formData, flightClass: e.target.value })}
                  className="input-field"
                >
                  <option value="Economy">Economy</option>
                  <option value="Business">Business</option>
                  <option value="First">First</option>
                </select>
                <input
                  type="number"
                  placeholder="Ticket Price"
                  value={formData.ticketPrice || ''}
                  onChange={(e) => setFormData({ ...formData, ticketPrice: parseFloat(e.target.value) })}
                  className="input-field"
                  required
                />
                <input
                  type="number"
                  placeholder="Total Seats"
                  value={formData.totalSeats || ''}
                  onChange={(e) => setFormData({ ...formData, totalSeats: parseInt(e.target.value), availableSeats: parseInt(e.target.value) })}
                  className="input-field"
                  required
                />
              </div>
            </>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Provider Name *</label>
                    {renderProviderAutocomplete("Provider Name (type to search)")}
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
                <div className="grid md:grid-cols-3 gap-3">
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
              </div>

              {/* Images */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Hotel Images (URLs)</h3>
                <div className="space-y-2">
                  {hotelImages.map((image, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        value={image}
                        onChange={(e) => {
                          const updated = [...hotelImages]
                          updated[index] = e.target.value
                          setHotelImages(updated)
                        }}
                        className="input-field flex-1"
                      />
                      {hotelImages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setHotelImages(hotelImages.filter((_, i) => i !== index))}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setHotelImages([...hotelImages, ''])}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Image URL</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {listingType === 'Car' && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Car Model (e.g., Toyota Camry)"
                  value={formData.carModel || ''}
                  onChange={(e) => setFormData({ ...formData, carModel: e.target.value })}
                  className="input-field"
                  required
                />
                {renderProviderAutocomplete("Provider Name (type to search)")}
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
                  <option value="">Transmission Type</option>
                  <option value="Automatic">Automatic</option>
                  <option value="Manual">Manual</option>
                </select>
                <input
                  type="number"
                  placeholder="Number of Seats"
                  value={formData.seats || ''}
                  onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) })}
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
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
                <input
                  type="date"
                  placeholder="Available To"
                  value={formData.availableTo || ''}
                  onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                  className="input-field"
                  min={formData.availableFrom || new Date().toISOString().split('T')[0]}
                  required
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
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Listing'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateListingTab

