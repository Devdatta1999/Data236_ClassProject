import { useState } from 'react'
import { Calendar, MapPin, Users, Search, Plus, Minus } from 'lucide-react'

const SearchBar = ({ type, onSearch }) => {
  const [params, setParams] = useState({
    // Flights
    departureAirport: '',
    arrivalAirport: '',
    departureDate: '',
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
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Departure airport"
                value={params.departureAirport}
                onChange={(e) => setParams({ ...params, departureAirport: e.target.value })}
                className="input-field pl-10"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Arrival airport"
                value={params.arrivalAirport}
                onChange={(e) => setParams({ ...params, arrivalAirport: e.target.value })}
                className="input-field pl-10"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Departure Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.departureDate}
                onChange={(e) => setParams({ ...params, departureDate: e.target.value })}
                className="input-field pl-10"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Travelers
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="number"
                min="1"
                value={params.quantity}
                onChange={(e) => setParams({ ...params, quantity: parseInt(e.target.value) })}
                className="input-field pl-10"
                required
              />
            </div>
          </div>
        </div>
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
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="City"
                value={params.city}
                onChange={(e) => setParams({ ...params, city: e.target.value })}
                className="input-field pl-10"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <input
              type="text"
              placeholder="State (e.g., NY)"
              value={params.state}
              onChange={(e) => setParams({ ...params, state: e.target.value.toUpperCase() })}
              className="input-field"
              maxLength="2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-in
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.checkInDate}
                onChange={(e) => setParams({ ...params, checkInDate: e.target.value })}
                className="input-field pl-10"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-out
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.checkOutDate}
                onChange={(e) => setParams({ ...params, checkOutDate: e.target.value })}
                className="input-field pl-10"
                required
                min={params.checkInDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rooms & Guests
            </label>
            <button
              type="button"
              onClick={() => setParams({ ...params, showRoomGuests: !params.showRoomGuests })}
              className="input-field w-full text-left flex items-center justify-between cursor-pointer"
            >
              <span>{params.numberOfRooms} room{params.numberOfRooms > 1 ? 's' : ''}, {params.numberOfAdults} guest{params.numberOfAdults > 1 ? 's' : ''}</span>
              <Users className="w-5 h-5 text-gray-400" />
            </button>
            {params.showRoomGuests && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Rooms</p>
                      <p className="text-sm text-gray-500">Each room accommodates 2 guests</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setParams({ ...params, numberOfRooms: Math.max(1, params.numberOfRooms - 1) })}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400"
                        disabled={params.numberOfRooms <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center">{params.numberOfRooms}</span>
                      <button
                        type="button"
                        onClick={() => setParams({ ...params, numberOfRooms: params.numberOfRooms + 1 })}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Adults</p>
                      <p className="text-sm text-gray-500">Ages 13+</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setParams({ ...params, numberOfAdults: Math.max(1, params.numberOfAdults - 1) })}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400"
                        disabled={params.numberOfAdults <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center">{params.numberOfAdults}</span>
                      <button
                        type="button"
                        onClick={() => setParams({ ...params, numberOfAdults: params.numberOfAdults + 1 })}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParams({ ...params, showRoomGuests: false })}
                    className="w-full btn-primary"
                  >
                    Done
                  </button>
                </div>
              </div>
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
        <div className="grid md:grid-cols-4 gap-4">
          <div>
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
                className="input-field pl-10 text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Car Type
            </label>
            <select
              value={params.carType}
              onChange={(e) => setParams({ ...params, carType: e.target.value })}
              className="input-field text-gray-900"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.pickupDate}
                onChange={(e) => setParams({ ...params, pickupDate: e.target.value })}
                className="input-field pl-10 text-gray-900"
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Return Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="date"
                value={params.returnDate}
                onChange={(e) => setParams({ ...params, returnDate: e.target.value })}
                className="input-field pl-10 text-gray-900"
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

