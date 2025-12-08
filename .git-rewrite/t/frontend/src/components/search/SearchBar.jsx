import { useState } from 'react'
import { Calendar, MapPin, Users, Search, Plus, Minus } from 'lucide-react'
import { US_AIRPORTS } from '../../utils/usAirports'

const SearchBar = ({ type, onSearch }) => {
  const [params, setParams] = useState({
    // Flights
    departureAirport: '',
    arrivalAirport: '',
    departureDate: '',
    returnDate: '',
    tripType: 'one-way', // 'one-way' or 'round-trip'
    numberOfPassengers: 1,
    // Hotels
    city: '',
    state: '',
    checkInDate: '',
    checkOutDate: '',
    numberOfRooms: 1,
    numberOfAdults: 2,
    showRoomGuests: false,
    // Cars
    location: '',
    carType: '',
    pickupDate: '',
    returnDate: '',
    // Common
    quantity: 1,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch({ ...params, type })
  }

  if (type === 'flights') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Trip Type Toggle */}
        <div className="flex space-x-2 mb-4">
          <button
            type="button"
            onClick={() => setParams({ ...params, tripType: 'one-way', returnDate: '' })}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              params.tripType === 'one-way'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            One-way
          </button>
          <button
            type="button"
            onClick={() => setParams({ ...params, tripType: 'round-trip' })}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              params.tripType === 'round-trip'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Round-trip
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={params.departureAirport}
                onChange={(e) => setParams({ ...params, departureAirport: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
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
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={params.arrivalAirport}
                onChange={(e) => setParams({ ...params, arrivalAirport: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
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
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Departure Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.departureDate}
                onChange={(e) => setParams({ ...params, departureDate: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {params.tripType === 'round-trip' ? 'Return Date' : 'Travelers'}
            </label>
            {params.tripType === 'round-trip' ? (
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="date"
                  value={params.returnDate}
                  onChange={(e) => setParams({ ...params, returnDate: e.target.value })}
                  className="input-field pl-10 text-gray-900 w-full"
                  required
                  min={params.departureDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            ) : (
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="number"
                  min="1"
                  value={params.numberOfPassengers}
                  onChange={(e) => setParams({ ...params, numberOfPassengers: parseInt(e.target.value) || 1, quantity: parseInt(e.target.value) || 1 })}
                  className="input-field pl-10 text-gray-900 w-full"
                  required
                />
              </div>
            )}
          </div>
        </div>
        {params.tripType === 'round-trip' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1"></div>
            <div className="md:col-span-1"></div>
            <div className="md:col-span-1"></div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Travelers
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="number"
                  min="1"
                  value={params.numberOfPassengers}
                  onChange={(e) => setParams({ ...params, numberOfPassengers: parseInt(e.target.value) || 1, quantity: parseInt(e.target.value) || 1 })}
                  className="input-field pl-10 text-gray-900 w-full"
                  required
                />
              </div>
            </div>
          </div>
        )}
        <button type="submit" className="btn-primary w-full md:w-auto flex items-center justify-center space-x-2">
          <Search className="w-5 h-5" />
          <span>Search Flights</span>
        </button>
      </form>
    )
  }

  if (type === 'hotels') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Location */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="City, State (e.g., San Jose, CA)"
                value={params.city && params.state ? `${params.city}, ${params.state}` : params.city || ''}
                onChange={(e) => {
                  const value = e.target.value
                  // Split by comma if present, otherwise treat entire input as city
                  if (value.includes(',')) {
                    const parts = value.split(',').map(s => s.trim())
                    const newCity = parts[0] || ''
                    const newState = parts[1] ? parts[1].toUpperCase().substring(0, 2) : ''
                    setParams({ 
                      ...params, 
                      city: newCity,
                      state: newState
                    })
                  } else {
                    // No comma - treat entire input as city (allows spaces like "San Jose")
                    setParams({ 
                      ...params, 
                      city: value,
                      state: ''
                    })
                  }
                }}
                className="input-field pl-10 text-gray-900 w-full"
                required
              />
            </div>
          </div>

          {/* Check-in */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-in
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.checkInDate}
                onChange={(e) => setParams({ ...params, checkInDate: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Check-out */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-out
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.checkOutDate}
                onChange={(e) => setParams({ ...params, checkOutDate: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
                required
                min={params.checkInDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Rooms & Guests */}
          <div className="md:col-span-1 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rooms & Guests
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setParams({ ...params, showRoomGuests: !params.showRoomGuests })
              }}
              className="input-field w-full text-left flex items-center justify-between cursor-pointer"
            >
              <span className="truncate">{params.numberOfRooms} {params.numberOfRooms === 1 ? 'room' : 'rooms'} · {params.numberOfAdults} {params.numberOfAdults === 1 ? 'adult' : 'adults'}</span>
              <Users className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
            </button>
            
            {/* Dropdown - Positioned to be fully visible */}
            {params.showRoomGuests && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setParams({ ...params, showRoomGuests: false })}
                ></div>
                <div className="absolute z-50 mt-1 left-0 md:right-0 w-full md:w-[320px] bg-white border border-gray-200 rounded-lg shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-4">
                    {/* Rooms */}
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900">Rooms</p>
                      <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setParams({ ...params, numberOfRooms: Math.max(1, params.numberOfRooms - 1) })
                          }}
                          className="px-4 py-2 text-primary-600 font-semibold hover:bg-gray-50 transition-colors disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          disabled={params.numberOfRooms <= 1}
                        >
                          −
                        </button>
                        <span className="px-6 py-2 text-center font-semibold text-gray-900 border-l border-r border-gray-300 min-w-[3rem] bg-white">{params.numberOfRooms}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setParams({ ...params, numberOfRooms: params.numberOfRooms + 1 })
                          }}
                          className="px-4 py-2 text-primary-600 font-semibold hover:bg-gray-50 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Adults */}
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900">Adults</p>
                      <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setParams({ ...params, numberOfAdults: Math.max(1, params.numberOfAdults - 1) })
                          }}
                          className="px-4 py-2 text-primary-600 font-semibold hover:bg-gray-50 transition-colors disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          disabled={params.numberOfAdults <= 1}
                        >
                          −
                        </button>
                        <span className="px-6 py-2 text-center font-semibold text-gray-900 border-l border-r border-gray-300 min-w-[3rem] bg-white">{params.numberOfAdults}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setParams({ ...params, numberOfAdults: params.numberOfAdults + 1 })
                          }}
                          className="px-4 py-2 text-primary-600 font-semibold hover:bg-gray-50 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Done Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setParams({ ...params, showRoomGuests: false })
                      }}
                      className="w-full bg-primary-600 text-white py-2 rounded-lg font-semibold hover:bg-primary-700 transition-colors text-sm mt-2"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <button type="submit" className="btn-primary w-full md:w-auto flex items-center justify-center space-x-2">
          <Search className="w-5 h-5" />
          <span>Search Hotels</span>
        </button>
      </form>
    )
  }

  if (type === 'cars') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="City, State, or Neighbourhood"
                value={params.location || ''}
                onChange={(e) => setParams({ ...params, location: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Car Type
            </label>
            <select
              value={params.carType}
              onChange={(e) => setParams({ ...params, carType: e.target.value })}
              className="input-field text-gray-900 w-full"
            >
              <option value="">Any</option>
              <option value="SUV">SUV</option>
              <option value="Sedan">Sedan</option>
              <option value="Compact">Compact</option>
              <option value="Luxury">Luxury</option>
              <option value="Convertible">Convertible</option>
              <option value="Truck">Truck</option>
              <option value="Van">Van</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.pickupDate}
                onChange={(e) => setParams({ ...params, pickupDate: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Return Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.returnDate}
                onChange={(e) => setParams({ ...params, returnDate: e.target.value })}
                className="input-field pl-10 text-gray-900 w-full"
                required
                min={params.pickupDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full md:w-auto flex items-center justify-center space-x-2">
          <Search className="w-5 h-5" />
          <span>Search Cars</span>
        </button>
      </form>
    )
  }

  return null
}

export default SearchBar

