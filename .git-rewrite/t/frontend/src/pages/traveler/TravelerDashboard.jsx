import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Calendar, User } from 'lucide-react'

const TravelerDashboard = () => {
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const userName = user?.firstName || 'Traveler'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section - Matching Landing Page Style */}
      <div className="relative h-[85vh] min-h-[650px] overflow-hidden">
        {/* Background Image - Full Width */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=100')`
          }}
        >
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/25 to-black/45"></div>
        </div>

        {/* Content - Top Left */}
        <div className="relative z-10 h-full flex flex-col justify-start pt-16 md:pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-4xl">
              {/* Welcome Message */}
              <div className="mb-12">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight drop-shadow-lg">
                  Welcome back, {userName}!
                </h1>
                <p className="text-xl md:text-2xl text-white/95 drop-shadow-md">
                  Manage your bookings and plan your next adventure
                </p>
              </div>

              {/* Quick Actions - On the Image */}
              <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
                <div 
                  className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer transform hover:-translate-y-2 border border-white/20 p-6"
                  onClick={() => navigate('/my-bookings')}
                >
                  <div className="flex items-start space-x-4">
                    <div className="bg-primary-100 rounded-xl p-4 flex-shrink-0">
                      <Calendar className="w-8 h-8 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">My Bookings</h3>
                      <p className="text-gray-600">View and manage all your travel bookings</p>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer transform hover:-translate-y-2 border border-white/20 p-6"
                  onClick={() => navigate('/profile')}
                >
                  <div className="flex items-start space-x-4">
                    <div className="bg-primary-100 rounded-xl p-4 flex-shrink-0">
                      <User className="w-8 h-8 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Profile</h3>
                      <p className="text-gray-600">Update your profile and preferences</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TravelerDashboard

