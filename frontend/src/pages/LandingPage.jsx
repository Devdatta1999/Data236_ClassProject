import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Plane, Hotel, Car, Search, MapPin, Calendar, Users, Star, Shield, Globe, Award, Sparkles } from 'lucide-react'
import { setSearchType } from '../store/slices/searchSlice'
import { openChat, setSessionId } from '../store/slices/chatSlice'
import SearchBar from '../components/search/SearchBar'

const LandingPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [activeTab, setActiveTab] = useState('flights')

  const handleAIMode = () => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    dispatch(setSessionId(sessionId))
    dispatch(openChat())
    setActiveTab('ai')
  }

  const handleSearch = (searchParams) => {
    dispatch(setSearchType(activeTab))
    navigate('/search', { state: { searchParams, type: activeTab } })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section with Clear Background Image */}
      <div className="relative h-[85vh] min-h-[650px] overflow-hidden">
        {/* Clear Background Image - Expedia Style (Tropical Paradise) */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=100')`
          }}
        >
          {/* Very subtle overlay to ensure text readability while keeping image clear */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/35"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1 flex items-center justify-center pt-8">
            <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Hero Text */}
              <div className="text-center mb-6">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 leading-tight drop-shadow-lg">
                  Discover Your Next
                  <span className="block text-primary-300">Adventure</span>
                </h1>
                <p className="text-lg md:text-xl text-white/95 max-w-xl mx-auto drop-shadow-md">
                  Search, compare, and book flights, hotels, and cars all in one place
                </p>
              </div>

              {/* Modern Search Widget */}
              <div className="bg-white rounded-3xl shadow-2xl overflow-visible backdrop-blur-sm relative">
                {/* Animated Category Icons */}
                <div className="flex justify-center space-x-6 px-6 pt-6 pb-3 border-b border-gray-200">
                    <button
                      onClick={() => setActiveTab('flights')}
                      className={`flex flex-col items-center justify-center space-y-2 px-6 py-4 rounded-xl transition-all duration-300 ${
                        activeTab === 'flights'
                          ? 'bg-primary-600 text-white transform scale-110 shadow-lg'
                          : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
                      }`}
                    >
                      <div className={`p-3 rounded-full transition-all duration-300 ${
                        activeTab === 'flights' ? 'bg-white/20' : 'bg-gray-100'
                      }`}>
                        <Plane className={`w-8 h-8 ${activeTab === 'flights' ? 'text-white' : 'text-primary-600'}`} />
                      </div>
                      <span className="font-semibold text-sm">Flights</span>
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('hotels')}
                      className={`flex flex-col items-center justify-center space-y-2 px-6 py-4 rounded-xl transition-all duration-300 ${
                        activeTab === 'hotels'
                          ? 'bg-primary-600 text-white transform scale-110 shadow-lg'
                          : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
                      }`}
                    >
                      <div className={`p-3 rounded-full transition-all duration-300 ${
                        activeTab === 'hotels' ? 'bg-white/20' : 'bg-gray-100'
                      }`}>
                        <Hotel className={`w-8 h-8 ${activeTab === 'hotels' ? 'text-white' : 'text-primary-600'}`} />
                      </div>
                      <span className="font-semibold text-sm">Hotels</span>
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('cars')}
                      className={`flex flex-col items-center justify-center space-y-2 px-6 py-4 rounded-xl transition-all duration-300 ${
                        activeTab === 'cars'
                          ? 'bg-primary-600 text-white transform scale-110 shadow-lg'
                          : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
                      }`}
                    >
                      <div className={`p-3 rounded-full transition-all duration-300 ${
                        activeTab === 'cars' ? 'bg-white/20' : 'bg-gray-100'
                      }`}>
                        <Car className={`w-8 h-8 ${activeTab === 'cars' ? 'text-white' : 'text-primary-600'}`} />
                      </div>
                      <span className="font-semibold text-sm">Cars</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAIMode}
                      className={`flex flex-col items-center justify-center space-y-2 px-6 py-4 rounded-xl transition-all duration-300 ${
                        activeTab === 'ai'
                          ? 'bg-purple-600 text-white transform scale-110 shadow-lg'
                          : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
                      }`}
                    >
                      <div
                        className={`p-3 rounded-full transition-all duration-300 ${
                          activeTab === 'ai' ? 'bg-white/20' : 'bg-gray-100'
                        }`}
                      >
                        <Sparkles
                          className={`w-8 h-8 ${
                            activeTab === 'ai' ? 'text-white' : 'text-purple-600'
                          }`}
                        />
                      </div>
                      <span className="font-semibold text-sm">AI Mode</span>
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="p-6">
                    {activeTab === 'ai' ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                        <p className="text-gray-700 text-lg max-w-xl">
                          Use AI Mode to describe your perfect trip in natural language. A chat
                          window will open where you can refine options and pick a bundle.
                        </p>
                        <button
                          type="button"
                          onClick={handleAIMode}
                          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          <Sparkles className="w-5 h-5" />
                          <span>Launch AI Mode</span>
                        </button>
                      </div>
                    ) : (
                    <SearchBar type={activeTab} onSearch={handleSearch} />
                    )}
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Travel Inspiration Section */}
      <div className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Explore Amazing Destinations
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From bustling cities to serene beaches, find your perfect getaway
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Destination Card 1 */}
            <div className="group relative h-96 rounded-2xl overflow-hidden shadow-lg cursor-pointer transform transition-transform hover:scale-105">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1539037116277-4db20889f2d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h3 className="text-2xl font-bold mb-2">Tropical Paradise</h3>
                <p className="text-white/90">Discover pristine beaches and crystal-clear waters</p>
              </div>
            </div>

            {/* Destination Card 2 */}
            <div className="group relative h-96 rounded-2xl overflow-hidden shadow-lg cursor-pointer transform transition-transform hover:scale-105">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1519904981063-b0cf448d479e?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h3 className="text-2xl font-bold mb-2">Urban Adventures</h3>
                <p className="text-white/90">Experience vibrant cities and cultural landmarks</p>
              </div>
            </div>

            {/* Destination Card 3 */}
            <div className="group relative h-96 rounded-2xl overflow-hidden shadow-lg cursor-pointer transform transition-transform hover:scale-105">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h3 className="text-2xl font-bold mb-2">Mountain Escapes</h3>
                <p className="text-white/90">Unwind in breathtaking mountain landscapes</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Why Choose Aerive?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need for a seamless travel experience
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="bg-primary-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Best Deals</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Compare prices from hundreds of providers to find the best deals on flights, hotels, and car rentals
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Secure Booking</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Your data and payments are protected with industry-leading security measures
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Award className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Verified Reviews</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Read authentic reviews from verified travelers to make informed decisions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="py-20 bg-primary-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-5xl font-bold mb-2 text-primary-300">1M+</div>
              <div className="text-xl text-white/90">Happy Travelers</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2 text-primary-300">50K+</div>
              <div className="text-xl text-white/90">Destinations</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2 text-primary-300">100+</div>
              <div className="text-xl text-white/90">Countries</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2 text-primary-300">24/7</div>
              <div className="text-xl text-white/90">Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Property Showcase Section */}
      <div className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Featured Properties
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Handpicked accommodations for an unforgettable stay
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Property 1 */}
            <div className="group relative h-80 rounded-2xl overflow-hidden shadow-xl cursor-pointer">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">4.8</span>
                  <span className="text-white/70">(1,234 reviews)</span>
                </div>
                <h3 className="text-3xl font-bold mb-2">Luxury Beach Resort</h3>
                <p className="text-white/90 text-lg">Experience world-class amenities and stunning ocean views</p>
              </div>
            </div>

            {/* Property 2 */}
            <div className="group relative h-80 rounded-2xl overflow-hidden shadow-xl cursor-pointer">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1571896349842-33c89424de2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2080&q=80')`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">4.9</span>
                  <span className="text-white/70">(856 reviews)</span>
                </div>
                <h3 className="text-3xl font-bold mb-2">Boutique City Hotel</h3>
                <p className="text-white/90 text-lg">Modern elegance in the heart of the city</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
