import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/apiService'
import { Search, User, Loader2, AlertCircle } from 'lucide-react'

const UserManagementTab = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(() => {
      handleSearch()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/api/admin/users/search?query=${encodeURIComponent(searchQuery)}`)
      setSearchResults(response.data.data?.users || [])
    } catch (err) {
      console.error('Error searching users:', err)
      setError(err.response?.data?.error || 'Failed to search users')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = (user) => {
    // Navigate to the edit page for this user
    navigate(`/admin/users/${user.userId}/edit`)
  }

  const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <User className="w-6 h-6 mr-2" />
          User Management
        </h2>
        <p className="text-gray-600 mb-6">
          Search for users by name or ID, then click on a user to edit their profile.
        </p>

        {/* Search Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search by Name or ID
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type user name or ID (e.g., John Doe or 123-45-6789)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 animate-spin" />
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Search Results ({searchResults.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((user) => (
                <div
                  key={user.userId}
                  onClick={() => handleSelectUser(user)}
                  className="p-4 border border-gray-200 rounded-lg cursor-pointer transition-colors hover:border-purple-300 hover:bg-purple-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {user.profileImage ? (
                        <img
                          src={`${API_BASE_URL}${user.profileImage}`}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling?.classList.remove('hidden')
                          }}
                        />
                      ) : null}
                      <div className={`w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center ${user.profileImage ? 'hidden' : ''}`}>
                        <User className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-gray-500">ID: {user.userId}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchQuery.trim().length >= 2 && !loading && searchResults.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No users found matching "{searchQuery}"
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserManagementTab

