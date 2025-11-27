import { useState, useEffect, useRef, useMemo } from 'react'
import { Plane, Hotel, Car, Search, Edit2, X, MapPin, Clock, Calendar, CheckCircle, Star, Trash2 } from 'lucide-react'
import api from '../../services/apiService'
import { US_AIRPORTS } from '../../utils/usAirports'
import { US_STATES } from '../../utils/usStates'
import Notification from '../common/Notification'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source
const getImageSrc = (imagePath) => {
  if (!imagePath) return ''
  if (imagePath.startsWith('http')) return imagePath
  if (imagePath.startsWith('/api/')) {
    return `${API_BASE_URL}${imagePath}`
  }
  const filename = imagePath.split('/').pop()
  const encodedFilename = encodeURIComponent(filename)
  return `${API_BASE_URL}/api/listings/images/${encodedFilename}`
}

// Helper function to get initial tab from localStorage
const getInitialListingTab = () => {
  try {
    return localStorage.getItem('adminApprovedListingsTab') || 'flights'
  } catch (e) {
    return 'flights'
  }
}

const ApprovedListingsTab = ({ onRefresh }) => {
  // Use lazy initialization for useState to ensure localStorage is read on mount
  const [activeListingTab, setActiveListingTab] = useState(() => {
    try {
      return localStorage.getItem('adminApprovedListingsTab') || 'flights'
    } catch (e) {
      return 'flights'
    }
  }) // 'flights', 'hotels', 'cars'
  const [approvedListings, setApprovedListings] = useState({
    flights: [],
    hotels: [],
    cars: []
  })
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [imageLoadKey, setImageLoadKey] = useState(0)
  const [listingsReady, setListingsReady] = useState(false)
  
  // Flight search filters
  const [showFlightSearch, setShowFlightSearch] = useState(false)
  const [departureAirport, setDepartureAirport] = useState('')
  const [arrivalAirport, setArrivalAirport] = useState('')
  const [providerSearchQuery, setProviderSearchQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [providerSuggestions, setProviderSuggestions] = useState([])
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const providerDropdownRef = useRef(null)
  const [searchActive, setSearchActive] = useState(false)
  
  // Hotel search filters
  const [showHotelSearch, setShowHotelSearch] = useState(false)
  const [hotelSearchQuery, setHotelSearchQuery] = useState('')
  const [hotelProviderSearchQuery, setHotelProviderSearchQuery] = useState('')
  const [selectedHotelProvider, setSelectedHotelProvider] = useState(null)
  const [hotelProviderSuggestions, setHotelProviderSuggestions] = useState([])
  const [showHotelProviderDropdown, setShowHotelProviderDropdown] = useState(false)
  const hotelProviderDropdownRef = useRef(null)
  
  // Car search filters
  const [showCarSearch, setShowCarSearch] = useState(false)
  const [carSearchQuery, setCarSearchQuery] = useState('')
  const [carProviderSearchQuery, setCarProviderSearchQuery] = useState('')
  const [selectedCarProvider, setSelectedCarProvider] = useState(null)
  const [carProviderSuggestions, setCarProviderSuggestions] = useState([])
  const [showCarProviderDropdown, setShowCarProviderDropdown] = useState(false)
  const carProviderDropdownRef = useRef(null)
  
  // Edit modal state
  const [editModal, setEditModal] = useState({ isOpen: false, listing: null, listingType: null })
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, listing: null, listingType: null })

  useEffect(() => {
    fetchApprovedListings()
    
    // Restore tab from localStorage on mount
    try {
      const savedTab = localStorage.getItem('adminApprovedListingsTab')
      if (savedTab && ['flights', 'hotels', 'cars'].includes(savedTab)) {
        setActiveListingTab(savedTab)
      }
    } catch (e) {
      console.error('Failed to read tab from localStorage:', e)
    }
  }, [])

  // Use useMemo to compute filtered listings to avoid race conditions
  // This ensures filteredListings is always in sync with approvedListings and activeListingTab
  // Also applies search filters when search is active
  const filteredListings = useMemo(() => {
    let listings = []
    if (activeListingTab === 'flights') {
      listings = approvedListings.flights || []
    } else if (activeListingTab === 'hotels') {
      listings = approvedListings.hotels || []
    } else {
      listings = approvedListings.cars || []
    }

    // Apply search filters based on active tab
    if (searchActive) {
      let results = [...listings]
      
      if (activeListingTab === 'flights') {
        // Filter by departure airport
        if (departureAirport) {
          results = results.filter(f => 
            f.departureAirport?.toUpperCase() === departureAirport.toUpperCase()
          )
        }
        
        // Filter by arrival airport
        if (arrivalAirport) {
          results = results.filter(f => 
            f.arrivalAirport?.toUpperCase() === arrivalAirport.toUpperCase()
          )
        }
        
        // Filter by provider name
        if (selectedProvider) {
          results = results.filter(f => 
            f.providerId === selectedProvider.providerId || 
            f.providerName === selectedProvider.providerName
          )
        }
      } else if (activeListingTab === 'hotels') {
        // Filter by hotel name or provider name
        if (hotelSearchQuery.trim()) {
          results = results.filter(h => 
            h.hotelName?.toLowerCase().includes(hotelSearchQuery.toLowerCase())
          )
        }
        
        if (selectedHotelProvider) {
          results = results.filter(h => 
            h.providerId === selectedHotelProvider.providerId || 
            h.providerName === selectedHotelProvider.providerName
          )
        }
      } else if (activeListingTab === 'cars') {
        // Filter by car name (model) or provider name
        if (carSearchQuery.trim()) {
          results = results.filter(c => 
            c.model?.toLowerCase().includes(carSearchQuery.toLowerCase()) ||
            c.carModel?.toLowerCase().includes(carSearchQuery.toLowerCase())
          )
        }
        
        if (selectedCarProvider) {
          results = results.filter(c => 
            c.providerId === selectedCarProvider.providerId || 
            c.providerName === selectedCarProvider.providerName
          )
        }
      }
      
      return results
    }

    return listings
  }, [
    activeListingTab, 
    approvedListings.flights, 
    approvedListings.hotels, 
    approvedListings.cars, 
    searchActive, 
    departureAirport, 
    arrivalAirport, 
    selectedProvider,
    hotelSearchQuery,
    selectedHotelProvider,
    carSearchQuery,
    selectedCarProvider
  ])

  // Close provider dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
        setShowProviderDropdown(false)
      }
      if (hotelProviderDropdownRef.current && !hotelProviderDropdownRef.current.contains(event.target)) {
        setShowHotelProviderDropdown(false)
      }
      if (carProviderDropdownRef.current && !carProviderDropdownRef.current.contains(event.target)) {
        setShowCarProviderDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch provider suggestions for flights
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

    const debounceTimer = setTimeout(fetchProviders, 300)
    return () => clearTimeout(debounceTimer)
  }, [providerSearchQuery])

  // Fetch provider suggestions for hotels
  useEffect(() => {
    const fetchProviders = async () => {
      if (hotelProviderSearchQuery.trim().length >= 2) {
        try {
          const response = await api.get(`/api/providers/search?q=${encodeURIComponent(hotelProviderSearchQuery)}`)
          setHotelProviderSuggestions(response.data.data?.providers || [])
          setShowHotelProviderDropdown(true)
        } catch (err) {
          console.error('Error fetching providers:', err)
          setHotelProviderSuggestions([])
        }
      } else {
        setHotelProviderSuggestions([])
        setShowHotelProviderDropdown(false)
      }
    }

    const debounceTimer = setTimeout(fetchProviders, 300)
    return () => clearTimeout(debounceTimer)
  }, [hotelProviderSearchQuery])

  // Fetch provider suggestions for cars
  useEffect(() => {
    const fetchProviders = async () => {
      if (carProviderSearchQuery.trim().length >= 2) {
        try {
          const response = await api.get(`/api/providers/search?q=${encodeURIComponent(carProviderSearchQuery)}`)
          setCarProviderSuggestions(response.data.data?.providers || [])
          setShowCarProviderDropdown(true)
        } catch (err) {
          console.error('Error fetching providers:', err)
          setCarProviderSuggestions([])
        }
      } else {
        setCarProviderSuggestions([])
        setShowCarProviderDropdown(false)
      }
    }

    const debounceTimer = setTimeout(fetchProviders, 300)
    return () => clearTimeout(debounceTimer)
  }, [carProviderSearchQuery])

  const fetchApprovedListings = async () => {
    setLoading(true)
    setListingsReady(false) // Reset ready state before fetching
    try {
      const response = await api.get('/api/admin/listings/approved')
      const data = response.data.data?.approvedListings || {}
      const listings = {
        flights: data.flights || [],
        hotels: data.hotels || [],
        cars: data.cars || []
      }
      
      // Set listings first
      setApprovedListings(listings)
      
      // Use requestAnimationFrame to ensure state is updated before setting imageLoadKey
      // This prevents race conditions where images try to render before data is ready
      requestAnimationFrame(() => {
        setImageLoadKey(Date.now())
        setListingsReady(true)
      })
    } catch (err) {
      console.error('Error fetching approved listings:', err)
      setNotification({ type: 'error', message: 'Failed to fetch approved listings' })
      setListingsReady(false)
    } finally {
      setLoading(false)
    }
  }

  const handleFlightSearch = () => {
    if (activeListingTab !== 'flights') return
    
    setSearchActive(true)
    // filteredListings will be recomputed automatically via useMemo
    
    const results = filteredListings
    setNotification({ 
      type: results.length > 0 ? 'success' : 'info', 
      message: `Found ${results.length} flight(s)` 
    })
  }

  const handleResetSearch = () => {
    if (activeListingTab === 'flights') {
      setDepartureAirport('')
      setArrivalAirport('')
      setProviderSearchQuery('')
      setSelectedProvider(null)
    } else if (activeListingTab === 'hotels') {
      setHotelSearchQuery('')
      setHotelProviderSearchQuery('')
      setSelectedHotelProvider(null)
    } else if (activeListingTab === 'cars') {
      setCarSearchQuery('')
      setCarProviderSearchQuery('')
      setSelectedCarProvider(null)
    }
    setSearchActive(false)
    // filteredListings will be recomputed automatically via useMemo
  }

  const handleHotelSearch = () => {
    if (activeListingTab !== 'hotels') return
    
    setSearchActive(true)
    // Compute results directly to show notification immediately
    let results = approvedListings.hotels || []
    
    if (hotelSearchQuery.trim()) {
      results = results.filter(h => 
        h.hotelName?.toLowerCase().includes(hotelSearchQuery.toLowerCase())
      )
    }
    
    if (selectedHotelProvider) {
      results = results.filter(h => 
        h.providerId === selectedHotelProvider.providerId || 
        h.providerName === selectedHotelProvider.providerName
      )
    }
    
    setNotification({ 
      type: results.length > 0 ? 'success' : 'info', 
      message: `Found ${results.length} hotel(s)` 
    })
  }

  const handleCarSearch = () => {
    if (activeListingTab !== 'cars') return
    
    setSearchActive(true)
    // Compute results directly to show notification immediately
    let results = approvedListings.cars || []
    
    if (carSearchQuery.trim()) {
      results = results.filter(c => 
        c.model?.toLowerCase().includes(carSearchQuery.toLowerCase()) ||
        c.carModel?.toLowerCase().includes(carSearchQuery.toLowerCase())
      )
    }
    
    if (selectedCarProvider) {
      results = results.filter(c => 
        c.providerId === selectedCarProvider.providerId || 
        c.providerName === selectedCarProvider.providerName
      )
    }
    
    setNotification({ 
      type: results.length > 0 ? 'success' : 'info', 
      message: `Found ${results.length} car(s)` 
    })
  }

  const handleEdit = (listing, listingType) => {
    setEditModal({ isOpen: true, listing, listingType })
  }

  const handleCloseEdit = () => {
    setEditModal({ isOpen: false, listing: null, listingType: null })
  }

  const handleDeleteClick = (listing, listingType) => {
    setDeleteModal({ isOpen: true, listing, listingType })
  }

  const handleCloseDeleteModal = () => {
    setDeleteModal({ isOpen: false, listing: null, listingType: null })
  }

  const handleConfirmDelete = async () => {
    const { listing, listingType } = deleteModal
    
    if (!listing || !listingType) return

    try {
      const listingId = listing.flightId || listing.hotelId || listing.carId
      const endpoint = `/api/listings/${listingType.toLowerCase()}s/${listingId}`
      
      await api.delete(endpoint)
      
      setNotification({ 
        type: 'success', 
        message: `${listingType} deleted successfully!` 
      })
      
      // Close modal
      handleCloseDeleteModal()
      
      // Refresh listings after deletion
      fetchApprovedListings()
    } catch (err) {
      console.error('Error deleting listing:', err)
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.error?.message || 'Failed to delete listing' 
      })
    }
  }

  const handleSaveEdit = async (updatedData) => {
    try {
      const { listing, listingType } = editModal
      const endpoint = `/api/listings/${listingType.toLowerCase()}s/${listing[`${listingType.toLowerCase()}Id`] || listing.listingId}`
      
      await api.put(endpoint, updatedData)
      setNotification({ type: 'success', message: 'Listing updated successfully!' })
      handleCloseEdit()
      fetchApprovedListings()
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Error updating listing:', err)
      setNotification({ 
        type: 'error', 
        message: err.response?.data?.error?.message || 'Failed to update listing' 
      })
    }
  }

  return (
    <div className="space-y-6">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Approved Listings</h2>
        <button
          onClick={fetchApprovedListings}
          className="btn-secondary"
        >
          Refresh
        </button>
      </div>

      {/* Listing Type Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => {
              const newTab = 'flights'
              setActiveListingTab(newTab)
              setShowFlightSearch(false)
              setSearchActive(false)
              // Persist to localStorage
              try {
                localStorage.setItem('adminApprovedListingsTab', newTab)
              } catch (e) {
                console.error('Failed to save tab to localStorage:', e)
              }
            }}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 transition-colors ${
              activeListingTab === 'flights'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Plane className="w-5 h-5" />
            <span>Flights</span>
            {approvedListings.flights && approvedListings.flights.length > 0 && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                {approvedListings.flights.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              const newTab = 'hotels'
              setActiveListingTab(newTab)
              setShowHotelSearch(false)
              setSearchActive(false)
              // Persist to localStorage
              try {
                localStorage.setItem('adminApprovedListingsTab', newTab)
              } catch (e) {
                console.error('Failed to save tab to localStorage:', e)
              }
            }}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 transition-colors ${
              activeListingTab === 'hotels'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Hotel className="w-5 h-5" />
            <span>Hotels</span>
            {approvedListings.hotels && approvedListings.hotels.length > 0 && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                {approvedListings.hotels.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              const newTab = 'cars'
              setActiveListingTab(newTab)
              setShowCarSearch(false)
              setSearchActive(false)
              // Persist to localStorage
              try {
                localStorage.setItem('adminApprovedListingsTab', newTab)
              } catch (e) {
                console.error('Failed to save tab to localStorage:', e)
              }
            }}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 transition-colors ${
              activeListingTab === 'cars'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Car className="w-5 h-5" />
            <span>Cars</span>
            {approvedListings.cars && approvedListings.cars.length > 0 && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                {approvedListings.cars.length}
              </span>
            )}
          </button>
        </div>

        {/* Flight Search */}
        {activeListingTab === 'flights' && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowFlightSearch(!showFlightSearch)}
              className="flex items-center space-x-2 text-purple-600 hover:text-purple-700 font-medium"
            >
              <Search className="w-4 h-4" />
              <span>{showFlightSearch ? 'Hide Search' : 'Show Search'}</span>
            </button>

            {showFlightSearch && (
              <div className="mt-4 grid md:grid-cols-3 gap-4">
                {/* Departure Airport */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Departure Airport
                  </label>
                  <select
                    value={departureAirport}
                    onChange={(e) => setDepartureAirport(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">All Airports</option>
                    {US_AIRPORTS.map(airport => (
                      <option key={airport.code} value={airport.code}>
                        {airport.code} - {airport.city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Arrival Airport */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Arrival Airport
                  </label>
                  <select
                    value={arrivalAirport}
                    onChange={(e) => setArrivalAirport(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">All Airports</option>
                    {US_AIRPORTS.map(airport => (
                      <option key={airport.code} value={airport.code}>
                        {airport.code} - {airport.city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Provider Name */}
                <div className="relative" ref={providerDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Provider Name
                  </label>
                  <input
                    type="text"
                    value={selectedProvider ? selectedProvider.providerName : providerSearchQuery}
                    onChange={(e) => {
                      setProviderSearchQuery(e.target.value)
                      if (!e.target.value) {
                        setSelectedProvider(null)
                      }
                    }}
                    onFocus={() => {
                      if (providerSearchQuery.length >= 2) {
                        setShowProviderDropdown(true)
                      }
                    }}
                    placeholder="Type to search providers..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  
                  {selectedProvider && (
                    <button
                      onClick={() => {
                        setSelectedProvider(null)
                        setProviderSearchQuery('')
                      }}
                      className="absolute right-2 top-8 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {showProviderDropdown && providerSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {providerSuggestions.map((provider) => (
                        <div
                          key={provider.providerId}
                          onClick={() => {
                            setSelectedProvider(provider)
                            setProviderSearchQuery('')
                            setShowProviderDropdown(false)
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer"
                        >
                          <div className="font-medium">{provider.providerName}</div>
                          <div className="text-sm text-gray-500">{provider.providerId}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showFlightSearch && (
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={handleFlightSearch}
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </button>
                <button
                  onClick={handleResetSearch}
                  className="btn-secondary"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hotel Search */}
        {activeListingTab === 'hotels' && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowHotelSearch(!showHotelSearch)}
              className="flex items-center space-x-2 text-purple-600 hover:text-purple-700 font-medium"
            >
              <Search className="w-4 h-4" />
              <span>{showHotelSearch ? 'Hide Search' : 'Show Search'}</span>
            </button>

            {showHotelSearch && (
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {/* Hotel Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hotel Name or Provider Name
                  </label>
                  <input
                    type="text"
                    value={hotelSearchQuery}
                    onChange={(e) => setHotelSearchQuery(e.target.value)}
                    placeholder="Type hotel name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Provider Name */}
                <div className="relative" ref={hotelProviderDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Provider Name
                  </label>
                  <input
                    type="text"
                    value={selectedHotelProvider ? selectedHotelProvider.providerName : hotelProviderSearchQuery}
                    onChange={(e) => {
                      setHotelProviderSearchQuery(e.target.value)
                      if (!e.target.value) {
                        setSelectedHotelProvider(null)
                      }
                    }}
                    onFocus={() => {
                      if (hotelProviderSearchQuery.length >= 2) {
                        setShowHotelProviderDropdown(true)
                      }
                    }}
                    placeholder="Type to search providers..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  
                  {selectedHotelProvider && (
                    <button
                      onClick={() => {
                        setSelectedHotelProvider(null)
                        setHotelProviderSearchQuery('')
                      }}
                      className="absolute right-2 top-8 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {showHotelProviderDropdown && hotelProviderSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {hotelProviderSuggestions.map((provider) => (
                        <div
                          key={provider.providerId}
                          onClick={() => {
                            setSelectedHotelProvider(provider)
                            setHotelProviderSearchQuery('')
                            setShowHotelProviderDropdown(false)
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer"
                        >
                          <div className="font-medium">{provider.providerName}</div>
                          <div className="text-sm text-gray-500">{provider.providerId}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showHotelSearch && (
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={handleHotelSearch}
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </button>
                <button
                  onClick={handleResetSearch}
                  className="btn-secondary"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Car Search */}
        {activeListingTab === 'cars' && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowCarSearch(!showCarSearch)}
              className="flex items-center space-x-2 text-purple-600 hover:text-purple-700 font-medium"
            >
              <Search className="w-4 h-4" />
              <span>{showCarSearch ? 'Hide Search' : 'Show Search'}</span>
            </button>

            {showCarSearch && (
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {/* Car Name/Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Car Name/Model or Provider Name
                  </label>
                  <input
                    type="text"
                    value={carSearchQuery}
                    onChange={(e) => setCarSearchQuery(e.target.value)}
                    placeholder="Type car name or model..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Provider Name */}
                <div className="relative" ref={carProviderDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Provider Name
                  </label>
                  <input
                    type="text"
                    value={selectedCarProvider ? selectedCarProvider.providerName : carProviderSearchQuery}
                    onChange={(e) => {
                      setCarProviderSearchQuery(e.target.value)
                      if (!e.target.value) {
                        setSelectedCarProvider(null)
                      }
                    }}
                    onFocus={() => {
                      if (carProviderSearchQuery.length >= 2) {
                        setShowCarProviderDropdown(true)
                      }
                    }}
                    placeholder="Type to search providers..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  
                  {selectedCarProvider && (
                    <button
                      onClick={() => {
                        setSelectedCarProvider(null)
                        setCarProviderSearchQuery('')
                      }}
                      className="absolute right-2 top-8 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {showCarProviderDropdown && carProviderSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {carProviderSuggestions.map((provider) => (
                        <div
                          key={provider.providerId}
                          onClick={() => {
                            setSelectedCarProvider(provider)
                            setCarProviderSearchQuery('')
                            setShowCarProviderDropdown(false)
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer"
                        >
                          <div className="font-medium">{provider.providerName}</div>
                          <div className="text-sm text-gray-500">{provider.providerId}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showCarSearch && (
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={handleCarSearch}
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </button>
                <button
                  onClick={handleResetSearch}
                  className="btn-secondary"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Listings Display */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">Loading listings...</p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                {searchActive 
                  ? `No ${activeListingTab} found matching your search criteria.` 
                  : 'No approved listings found.'}
              </p>
            </div>
          ) : listingsReady && imageLoadKey > 0 ? (
            <div className="space-y-4">
              {activeListingTab === 'flights' && filteredListings.map((flight) => (
                <FlightCard
                  key={`flight-${flight.flightId}-${imageLoadKey}`}
                  flight={flight}
                  onEdit={() => handleEdit(flight, 'Flight')}
                  onDelete={() => handleDeleteClick(flight, 'Flight')}
                />
              ))}
              
              {activeListingTab === 'hotels' && filteredListings.map((hotel) => (
                <HotelCard
                  key={`hotel-${hotel.hotelId}-${imageLoadKey}`}
                  hotel={hotel}
                  onEdit={() => handleEdit(hotel, 'Hotel')}
                  onDelete={() => handleDeleteClick(hotel, 'Hotel')}
                />
              ))}
              
              {activeListingTab === 'cars' && filteredListings.map((car) => (
                <CarCard
                  key={`car-${car.carId}-${imageLoadKey}`}
                  car={car}
                  onEdit={() => handleEdit(car, 'Car')}
                  onDelete={() => handleDeleteClick(car, 'Car')}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">Preparing listings...</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modals */}
      {editModal.isOpen && editModal.listingType === 'Flight' && (
        <EditFlightModal
          flight={editModal.listing}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}
      {editModal.isOpen && editModal.listingType === 'Hotel' && (
        <EditHotelModal
          hotel={editModal.listing}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}
      {editModal.isOpen && editModal.listingType === 'Car' && (
        <EditCarModal
          car={editModal.listing}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <DeleteConfirmationModal
          listing={deleteModal.listing}
          listingType={deleteModal.listingType}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

const FlightCard = ({ flight, onEdit, onDelete }) => {
  const imageSrc = flight.image ? getImageSrc(flight.image) : null
  
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          {/* Flight Image */}
          {imageSrc ? (
            <div className="w-24 h-24 flex-shrink-0">
              <img
                key={`img-${flight.flightId}-${imageSrc}`}
                src={imageSrc}
                decoding="async"
                alt={flight.flightId}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
                loading="eager"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling?.classList.remove('hidden')
                }}
                onLoad={(e) => {
                  e.target.style.opacity = '1'
                  e.target.style.display = 'block'
                }}
              />
              <div className="hidden w-24 h-24 bg-green-100 rounded-lg flex items-center justify-center">
                <Plane className="w-6 h-6 text-green-600" />
              </div>
            </div>
          ) : (
            <div className="w-24 h-24 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Plane className="w-6 h-6 text-green-600" />
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-semibold">
                {flight.departureAirport} → {flight.arrivalAirport}
              </h3>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                <CheckCircle className="w-3 h-3" />
                <span>Active</span>
              </span>
              {flight.flightId && (
                <span className="text-xs text-gray-500">ID: {flight.flightId}</span>
              )}
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <span className="font-medium">Provider:</span>
                <span>{flight.providerName || flight.providerId}</span>
              </div>

              {flight.departureTime && flight.arrivalTime && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span><span className="font-medium">Departure:</span> {flight.departureTime}</span>
                  </div>
                  <span className="text-gray-300">→</span>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-green-500" />
                    <span><span className="font-medium">Arrival:</span> {flight.arrivalTime}</span>
                  </div>
                  {flight.duration && (
                    <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {Math.floor(flight.duration / 60)}h {flight.duration % 60}m
                    </span>
                  )}
                </div>
              )}

              {flight.operatingDays && flight.operatingDays.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-medium text-gray-600">Operating Days:</span>
                  {flight.operatingDays.map((day, idx) => (
                    <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {day}
                    </span>
                  ))}
                </div>
              )}

              {(flight.availableFrom || flight.availableTo) && (
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Available from {flight.availableFrom ? new Date(flight.availableFrom).toLocaleDateString() : 'N/A'} 
                    {' '}to {flight.availableTo ? new Date(flight.availableTo).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              )}

              {/* Seat Types */}
              {flight.seatTypes && flight.seatTypes.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Seat Types & Pricing</h4>
                  <div className="grid md:grid-cols-3 gap-3">
                    {flight.seatTypes.map((seatType, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-gray-900">{seatType.type}</span>
                          <span className="text-purple-600 font-semibold">${seatType.ticketPrice || 0}</span>
                        </div>
                        <div className="text-xs text-gray-600">
                          Total Seats: <span className="font-semibold">{seatType.totalSeats || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  <p><strong>Class:</strong> {flight.flightClass || 'N/A'} | <strong>Price:</strong> ${flight.ticketPrice || 0}</p>
                  <p><strong>Available Seats:</strong> {flight.availableSeats || 0} / {flight.totalSeats || 0}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start">
          <button
            onClick={onEdit}
            className="btn-secondary flex items-center space-x-2"
          >
            <Edit2 className="w-4 h-4" />
            <span>Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="btn-secondary flex items-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 border-red-200 hover:border-red-300"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const HotelCard = ({ hotel, onEdit, onDelete }) => {
  const imageSrc = hotel.images && hotel.images.length > 0 ? getImageSrc(hotel.images[0]) : null
  
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4">
        {imageSrc ? (
          <div className="md:w-64 h-48 md:h-auto flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
            <img
              key={`img-${hotel.hotelId}-${imageSrc}`}
              src={imageSrc}
              alt={hotel.hotelName}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling?.classList.remove('hidden')
              }}
              onLoad={(e) => {
                e.target.style.opacity = '1'
                e.target.style.display = 'block'
              }}
            />
            <div className="hidden w-full h-full flex items-center justify-center text-gray-400">
              <Hotel className="w-12 h-12" />
            </div>
          </div>
        ) : (
          <div className="md:w-64 h-48 md:h-auto flex-shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
            <Hotel className="w-12 h-12 text-green-600" />
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <h3 className="text-xl font-semibold">{hotel.hotelName}</h3>
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
              <CheckCircle className="w-3 h-3" />
              <span>Active</span>
            </span>
          </div>
          
          <p className="text-sm text-gray-500 mb-3">
            Provider: <span className="font-medium text-gray-700">{hotel.providerName || 'N/A'}</span> | 
            ID: <span className="font-medium text-gray-700">{hotel.hotelId}</span>
          </p>

          <div className="space-y-2 mb-4">
            <div className="flex items-center space-x-2 text-gray-600">
              <MapPin className="w-4 h-4" />
              <span>{hotel.address}, {hotel.city}, {hotel.state} {hotel.zipCode}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onEdit}
              className="btn-secondary flex items-center space-x-2"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
            <button
              onClick={onDelete}
              className="btn-secondary flex items-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 border-red-200 hover:border-red-300"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const CarCard = ({ car, onEdit, onDelete }) => {
  const imageSrc = car.image ? getImageSrc(car.image) : null
  
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          {imageSrc ? (
            <div className="w-24 h-24 flex-shrink-0">
              <img
                key={`img-${car.carId}-${imageSrc}`}
                src={imageSrc}
                decoding="async"
                alt={car.model}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
                loading="eager"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling?.classList.remove('hidden')
                }}
                onLoad={(e) => {
                  e.target.style.opacity = '1'
                  e.target.style.display = 'block'
                }}
              />
              <div className="hidden w-24 h-24 bg-green-100 rounded-lg flex items-center justify-center">
                <Car className="w-6 h-6 text-green-600" />
              </div>
            </div>
          ) : (
            <div className="w-24 h-24 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Car className="w-6 h-6 text-green-600" />
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-semibold">{car.model} ({car.year})</h3>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                <CheckCircle className="w-3 h-3" />
                <span>Active</span>
              </span>
            </div>

            <p className="text-sm text-gray-500 mb-2">
              Provider: <span className="font-medium text-gray-700">{car.providerName || 'N/A'}</span> | 
              ID: <span className="font-medium text-gray-700">{car.carId}</span>
            </p>

            <div className="text-sm text-gray-600">
              <p><strong>Type:</strong> {car.carType} | <strong>Daily Rate:</strong> ${car.dailyRentalPrice}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start">
          <button
            onClick={onEdit}
            className="btn-secondary flex items-center space-x-2"
          >
            <Edit2 className="w-4 h-4" />
            <span>Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="btn-secondary flex items-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 border-red-200 hover:border-red-300"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const EditFlightModal = ({ flight, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    departureAirport: flight.departureAirport || '',
    arrivalAirport: flight.arrivalAirport || '',
    departureTime: flight.departureTime || '',
    arrivalTime: flight.arrivalTime || '',
    operatingDays: flight.operatingDays || [],
    seatTypes: flight.seatTypes || [],
    availableFrom: flight.availableFrom ? new Date(flight.availableFrom).toISOString().split('T')[0] : '',
    availableTo: flight.availableTo ? new Date(flight.availableTo).toISOString().split('T')[0] : '',
  })
  const [loading, setLoading] = useState(false)

  const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Calculate duration if times are provided
      if (formData.departureTime && formData.arrivalTime) {
        const [depHours, depMins] = formData.departureTime.split(':').map(Number)
        const [arrHours, arrMins] = formData.arrivalTime.split(':').map(Number)
        const depMinutes = depHours * 60 + depMins
        const arrMinutes = arrHours * 60 + arrMins
        const duration = arrMinutes >= depMinutes 
          ? arrMinutes - depMinutes 
          : (24 * 60) - depMinutes + arrMinutes
        formData.duration = duration
      }

      // Prepare seat types data
      const seatTypes = formData.seatTypes.map(st => ({
        type: st.type,
        ticketPrice: Number(st.ticketPrice) || 0,
        totalSeats: Number(st.totalSeats) || 0,
        availableSeats: Number(st.totalSeats) || 0 // Keep same as total for now
      }))

      const updateData = {
        departureAirport: formData.departureAirport.toUpperCase(),
        arrivalAirport: formData.arrivalAirport.toUpperCase(),
        departureTime: formData.departureTime,
        arrivalTime: formData.arrivalTime,
        operatingDays: formData.operatingDays,
        seatTypes: seatTypes,
        availableFrom: formData.availableFrom ? new Date(formData.availableFrom).toISOString() : undefined,
        availableTo: formData.availableTo ? new Date(formData.availableTo).toISOString() : undefined,
        duration: formData.duration
      }

      await onSave(updateData)
    } catch (err) {
      console.error('Error in form submission:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSeatTypeChange = (index, field, value) => {
    const updatedSeatTypes = [...formData.seatTypes]
    updatedSeatTypes[index] = {
      ...updatedSeatTypes[index],
      [field]: field === 'ticketPrice' || field === 'totalSeats' ? Number(value) || 0 : value
    }
    setFormData({ ...formData, seatTypes: updatedSeatTypes })
  }

  const toggleOperatingDay = (day) => {
    const updatedDays = formData.operatingDays.includes(day)
      ? formData.operatingDays.filter(d => d !== day)
      : [...formData.operatingDays, day]
    setFormData({ ...formData, operatingDays: updatedDays })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Edit Flight</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Route */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departure Airport *
              </label>
              <select
                value={formData.departureAirport}
                onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select Airport</option>
                {US_AIRPORTS.map(airport => (
                  <option key={airport.code} value={airport.code}>
                    {airport.code} - {airport.city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arrival Airport *
              </label>
              <select
                value={formData.arrivalAirport}
                onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select Airport</option>
                {US_AIRPORTS.map(airport => (
                  <option key={airport.code} value={airport.code}>
                    {airport.code} - {airport.city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Times */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departure Time (HH:MM) *
              </label>
              <input
                type="time"
                value={formData.departureTime}
                onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arrival Time (HH:MM) *
              </label>
              <input
                type="time"
                value={formData.arrivalTime}
                onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Operating Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Operating Days *
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleOperatingDay(day)}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    formData.operatingDays.includes(day)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-purple-500'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            {formData.operatingDays.length === 0 && (
              <p className="text-red-500 text-sm mt-1">Please select at least one operating day</p>
            )}
          </div>

          {/* Availability Dates */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available From *
              </label>
              <input
                type="date"
                value={formData.availableFrom}
                onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available To *
              </label>
              <input
                type="date"
                value={formData.availableTo}
                onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Seat Types */}
          {formData.seatTypes && formData.seatTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seat Types & Pricing *
              </label>
              <div className="space-y-4">
                {formData.seatTypes.map((seatType, index) => (
                  <div key={index} className="grid md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Seat Type</label>
                      <input
                        type="text"
                        value={seatType.type}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Price ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={seatType.ticketPrice || 0}
                        onChange={(e) => handleSeatTypeChange(index, 'ticketPrice', e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Total Seats</label>
                      <input
                        type="number"
                        min="0"
                        value={seatType.totalSeats || 0}
                        onChange={(e) => handleSeatTypeChange(index, 'totalSeats', e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-800">
              <strong>Note:</strong> Image and Provider Name cannot be edited. Only locations, prices, seat counts, times, and operating days can be modified.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || formData.operatingDays.length === 0}
              className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const HOTEL_AMENITIES = [
  'WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service', 
  'Parking', 'Airport Shuttle', 'Business Center', 'Pet Friendly', 
  'Breakfast Included', 'Laundry', 'Concierge', 'Beach Access'
]

const EditHotelModal = ({ hotel, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    address: hotel.address || '',
    city: hotel.city || '',
    state: hotel.state || '',
    zipCode: hotel.zipCode || '',
    starRating: hotel.starRating || 1,
    availableFrom: hotel.availableFrom ? new Date(hotel.availableFrom).toISOString().split('T')[0] : '',
    availableTo: hotel.availableTo ? new Date(hotel.availableTo).toISOString().split('T')[0] : '',
    roomTypes: hotel.roomTypes || [],
    amenities: hotel.amenities || []
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Calculate total rooms from room types
      const totalRooms = formData.roomTypes.reduce((sum, rt) => sum + (rt.availableCount || 0), 0)
      const availableRooms = totalRooms

      const updateData = {
        address: formData.address,
        city: formData.city,
        state: formData.state.toUpperCase(),
        zipCode: formData.zipCode,
        starRating: Number(formData.starRating),
        availableFrom: formData.availableFrom ? new Date(formData.availableFrom).toISOString() : undefined,
        availableTo: formData.availableTo ? new Date(formData.availableTo).toISOString() : undefined,
        roomTypes: formData.roomTypes.map(rt => ({
          type: rt.type,
          pricePerNight: Number(rt.pricePerNight) || 0,
          availableCount: Number(rt.availableCount) || 0
        })),
        amenities: formData.amenities,
        totalRooms,
        availableRooms
      }

      await onSave(updateData)
    } catch (err) {
      console.error('Error in form submission:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRoomTypeChange = (index, field, value) => {
    const updatedRoomTypes = [...formData.roomTypes]
    updatedRoomTypes[index] = {
      ...updatedRoomTypes[index],
      [field]: field === 'pricePerNight' || field === 'availableCount' ? Number(value) || 0 : value
    }
    setFormData({ ...formData, roomTypes: updatedRoomTypes })
  }

  const toggleAmenity = (amenity) => {
    const updatedAmenities = formData.amenities.includes(amenity)
      ? formData.amenities.filter(a => a !== amenity)
      : [...formData.amenities, amenity]
    setFormData({ ...formData, amenities: updatedAmenities })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Edit Hotel</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Location */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address *
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City *
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State *
              </label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select State</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zip Code *
              </label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Star Rating *
            </label>
            <select
              value={formData.starRating}
              onChange={(e) => setFormData({ ...formData, starRating: Number(e.target.value) })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              {[1, 2, 3, 4, 5].map(rating => (
                <option key={rating} value={rating}>{rating} Star{rating > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          {/* Availability Dates */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available From *
              </label>
              <input
                type="date"
                value={formData.availableFrom}
                onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available To *
              </label>
              <input
                type="date"
                value={formData.availableTo}
                onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Room Types */}
          {formData.roomTypes && formData.roomTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room Types & Pricing *
              </label>
              <div className="space-y-4">
                {formData.roomTypes.map((roomType, index) => (
                  <div key={index} className="grid md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Room Type</label>
                      <input
                        type="text"
                        value={roomType.type}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Price Per Night ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={roomType.pricePerNight || 0}
                        onChange={(e) => handleRoomTypeChange(index, 'pricePerNight', e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Available Count</label>
                      <input
                        type="number"
                        min="0"
                        value={roomType.availableCount || 0}
                        onChange={(e) => handleRoomTypeChange(index, 'availableCount', e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amenities */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amenities
            </label>
            <div className="flex flex-wrap gap-2">
              {HOTEL_AMENITIES.map(amenity => (
                <button
                  key={amenity}
                  type="button"
                  onClick={() => toggleAmenity(amenity)}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    formData.amenities.includes(amenity)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-purple-500'
                  }`}
                >
                  {amenity}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-800">
              <strong>Note:</strong> Image and Provider Name cannot be edited. Only locations, prices, room counts, dates, and amenities can be modified.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const EditCarModal = ({ car, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    carType: car.carType || '',
    model: car.model || car.carModel || '',
    year: car.year || new Date().getFullYear(),
    transmissionType: car.transmissionType || 'Automatic',
    numberOfSeats: car.numberOfSeats || 4,
    dailyRentalPrice: car.dailyRentalPrice || 0,
    neighbourhood: car.neighbourhood || '',
    city: car.city || '',
    state: car.state || '',
    availableFrom: car.availableFrom ? new Date(car.availableFrom).toISOString().split('T')[0] : '',
    availableTo: car.availableTo ? new Date(car.availableTo).toISOString().split('T')[0] : '',
  })
  const [loading, setLoading] = useState(false)

  const CAR_TYPES = ['SUV', 'Sedan', 'Compact', 'Luxury', 'Convertible', 'Truck', 'Van']

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const updateData = {
        carType: formData.carType,
        model: formData.model,
        year: Number(formData.year),
        transmissionType: formData.transmissionType,
        numberOfSeats: Number(formData.numberOfSeats),
        dailyRentalPrice: Number(formData.dailyRentalPrice) || 0,
        neighbourhood: formData.neighbourhood,
        city: formData.city,
        state: formData.state.toUpperCase(),
        availableFrom: formData.availableFrom ? new Date(formData.availableFrom).toISOString() : undefined,
        availableTo: formData.availableTo ? new Date(formData.availableTo).toISOString() : undefined,
      }

      await onSave(updateData)
    } catch (err) {
      console.error('Error in form submission:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Edit Car</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Car Details */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Car Type *
              </label>
              <select
                value={formData.carType}
                onChange={(e) => setFormData({ ...formData, carType: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select Car Type</option>
                {CAR_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model *
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year *
              </label>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear() + 1}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transmission Type *
              </label>
              <select
                value={formData.transmissionType}
                onChange={(e) => setFormData({ ...formData, transmissionType: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Seats *
              </label>
              <input
                type="number"
                min="2"
                max="15"
                value={formData.numberOfSeats}
                onChange={(e) => setFormData({ ...formData, numberOfSeats: Number(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Rental Price ($) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.dailyRentalPrice}
                onChange={(e) => setFormData({ ...formData, dailyRentalPrice: Number(e.target.value) || 0 })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Neighbourhood
              </label>
              <input
                type="text"
                value={formData.neighbourhood}
                onChange={(e) => setFormData({ ...formData, neighbourhood: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City *
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State *
              </label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select State</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Availability Dates */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available From *
              </label>
              <input
                type="date"
                value={formData.availableFrom}
                onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available To *
              </label>
              <input
                type="date"
                value={formData.availableTo}
                onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Note */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-800">
              <strong>Note:</strong> Image and Provider Name cannot be edited. Only car details, location, price, and availability dates can be modified.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const DeleteConfirmationModal = ({ listing, listingType, onClose, onConfirm }) => {
  if (!listing) return null

  const listingDisplay = listingType === 'Flight' 
    ? `Flight ${listing.flightId}`
    : listingType === 'Hotel'
    ? `Hotel ${listing.hotelName}`
    : `Car ${listing.model || listing.carModel}`

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Delete {listingType}?</h2>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>

          <p className="text-gray-700 mb-6">
            Are you sure you want to delete <span className="font-semibold">{listingDisplay}</span>? 
            This will permanently remove the listing from the system.
          </p>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApprovedListingsTab
