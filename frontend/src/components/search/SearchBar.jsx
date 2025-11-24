import { useState } from 'react'
import { Calendar, MapPin, Users, Search } from 'lucide-react'

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
    // Cars
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
              Car Type
            </label>
            <select
              value={params.carType}
              onChange={(e) => setParams({ ...params, carType: e.target.value })}
              className="input-field"
            >
              <option value="">Any</option>
              <option value="Sedan">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="Hatchback">Hatchback</option>
              <option value="Convertible">Convertible</option>
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
                className="input-field pl-10"
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
                className="input-field pl-10"
                required
                min={params.pickupDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={params.quantity}
              onChange={(e) => setParams({ ...params, quantity: parseInt(e.target.value) })}
              className="input-field"
              required
            />
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

