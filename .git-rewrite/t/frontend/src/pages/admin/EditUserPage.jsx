import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../services/apiService'
import { ArrowLeft, Save, Loader2, AlertCircle, CheckCircle2, User, Trash2 } from 'lucide-react'

const EditUserPage = () => {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phoneNumber: ''
  })

  useEffect(() => {
    fetchUser()
  }, [userId])

  const fetchUser = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/api/admin/users/${userId}`)
      const userData = response.data.data?.user
      if (userData) {
        setUser(userData)
        setFormData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          address: userData.address || '',
          city: userData.city || '',
          state: userData.state || '',
          zipCode: userData.zipCode || '',
          phoneNumber: userData.phoneNumber || ''
        })
      }
    } catch (err) {
      console.error('Error fetching user:', err)
      setError(err.response?.data?.error || 'Failed to fetch user details')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await api.put(`/api/admin/users/${userId}`, formData)
      setSuccess('User updated successfully!')
      
      // Update local user data
      setUser({
        ...user,
        ...formData
      })

      // Show success message for 2 seconds, then navigate back
      setTimeout(() => {
        navigate('/admin', { state: { tab: 'users' } })
      }, 1500)
    } catch (err) {
      console.error('Error updating user:', err)
      setError(err.response?.data?.error || 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate('/admin', { state: { tab: 'users' } })
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
  }

  const handleDeleteConfirm = async () => {
    if (!user) return

    setDeleting(true)
    setError('')
    setSuccess('')

    try {
      await api.delete(`/api/admin/users/${userId}`)
      setSuccess('User deleted successfully!')
      
      // Navigate back after a short delay
      setTimeout(() => {
        navigate('/admin', { state: { tab: 'users' } })
      }, 1500)
    } catch (err) {
      console.error('Error deleting user:', err)
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete user')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-gray-600">Loading user details...</p>
        </div>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => navigate('/admin', { state: { tab: 'users' } })}
            className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to User Management</span>
          </button>
          <div className="card">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={handleCancel}
          className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to User Management</span>
        </button>

        {/* Header */}
        <div className="card mb-6">
          <div className="flex items-center space-x-4 mb-6">
            {user?.profileImage ? (
              <img
                src={`${API_BASE_URL}${user.profileImage}`}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-20 h-20 rounded-full object-cover border-2 border-purple-200"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <div className={`w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center ${user?.profileImage ? 'hidden' : ''}`}>
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Edit User Profile
              </h1>
              <p className="text-gray-600 mt-1">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                ID: {user?.userId} | Email: {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Edit Form */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-6">User Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address *
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City *
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State *
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                maxLength={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase"
                placeholder="CA"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP Code *
              </label>
              <input
                type="text"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="text"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> User ID, Email, Password, and SSN cannot be modified for security reasons.
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleCancel}
                  disabled={saving || deleting}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || deleting}
                  className="btn-primary flex items-center space-x-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete User Button */}
        <div className="card mt-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Danger Zone</h3>
            <p className="text-sm text-red-700 mb-4">
              Deleting a user will permanently remove their account. This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteClick}
              disabled={deleting || saving}
              className="btn-primary bg-red-600 hover:bg-red-700 text-white flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete User</span>
            </button>
          </div>
        </div>

        {/* Delete User Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-red-700">Delete User</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> The user's bookings, reviews, and billing history will be preserved, 
                  but the user will no longer be able to access their account.
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleDeleteCancel}
                  disabled={deleting}
                  className="btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Deleting...
                    </>
                  ) : (
                    'Yes, Delete User'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditUserPage

