import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '../../services/apiService'
import { Plane, Hotel, Car, ChevronDown } from 'lucide-react'

const CreateListingTab = () => {
  const [listingType, setListingType] = useState('Flight')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({})
  const [providerSuggestions, setProviderSuggestions] = useState([])
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [providerSearchQuery, setProviderSearchQuery] = useState('')
  const providerDropdownRef = useRef(null)

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
        if (listingData.location) {
          // Car model doesn't have location field, remove it
          delete listingData.location
        }
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
        // Hotel requires roomTypes array with valid enum values: 'Single', 'Double', 'Suite', 'Deluxe', 'Presidential'
        if (!listingData.roomTypes || listingData.roomTypes.length === 0) {
          const pricePerNight = listingData.pricePerNight || 100
          const availableCount = listingData.availableRooms || listingData.totalRooms || 1
          const roomType = listingData.roomType || 'Double' // Use selected room type or default to Double
          listingData.roomTypes = [{
            type: roomType, // Valid enum value
            pricePerNight: pricePerNight,
            availableCount: availableCount
          }]
          delete listingData.pricePerNight
          delete listingData.roomType // Remove the form field, we've converted it to roomTypes
        }
        if (listingData.availableRooms && !listingData.totalRooms) {
          listingData.totalRooms = listingData.availableRooms
        }
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
      alert('Listing created successfully!')
      setFormData({})
      setProviderSearchQuery('') // Clear provider search query
    } catch (err) {
      console.error('Create listing error:', err)
      alert('Failed to create listing: ' + (err.response?.data?.error?.message || err.message))
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
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Hotel Name"
                  value={formData.hotelName || ''}
                  onChange={(e) => setFormData({ ...formData, hotelName: e.target.value })}
                  className="input-field"
                  required
                />
                {renderProviderAutocomplete("Provider Name (type to search)")}
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
                <select
                  value={formData.roomType || 'Double'}
                  onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Suite">Suite</option>
                  <option value="Deluxe">Deluxe</option>
                  <option value="Presidential">Presidential</option>
                </select>
                <input
                  type="number"
                  placeholder="Price Per Night ($)"
                  value={formData.pricePerNight || ''}
                  onChange={(e) => setFormData({ ...formData, pricePerNight: parseFloat(e.target.value) })}
                  className="input-field"
                  min="0"
                  step="0.01"
                  required
                />
                <input
                  type="text"
                  placeholder="Amenities (comma-separated, e.g., WiFi, Pool, Gym)"
                  value={formData.amenities || ''}
                  onChange={(e) => {
                    const amenityString = e.target.value
                    setFormData({ 
                      ...formData, 
                      amenities: amenityString ? amenityString.split(',').map(a => a.trim()).filter(a => a) : []
                    })
                  }}
                  className="input-field md:col-span-2"
                />
              </div>
            </>
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

