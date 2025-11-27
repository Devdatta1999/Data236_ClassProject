import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateUser } from '../../store/slices/authSlice'
import api from '../../services/apiService'
import { Building2, Mail, Phone, MapPin, ArrowLeft, Camera, X } from 'lucide-react'
import { US_STATES } from '../../utils/usStates'

const HostProfilePage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const [formData, setFormData] = useState({
    providerName: '',
    email: '',
    phoneNumber: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
    },
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profilePicture, setProfilePicture] = useState(null)
  const [profilePicturePreview, setProfilePicturePreview] = useState(null)
  const [uploadingPicture, setUploadingPicture] = useState(false)
  const [currentProfileImage, setCurrentProfileImage] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.providerId) return

      try {
        const response = await api.get('/api/providers/me')
        const providerData = response.data.data?.provider
        setFormData({
          providerName: providerData?.providerName || '',
          email: providerData?.email || '',
          phoneNumber: providerData?.phoneNumber || '',
          address: {
            street: providerData?.address?.street || '',
            city: providerData?.address?.city || '',
            state: providerData?.address?.state || '',
            zipCode: providerData?.address?.zipCode || '',
          },
        })
        // Set current profile image if it exists
        if (providerData?.profileImage) {
          setCurrentProfileImage(providerData.profileImage)
          setProfilePicturePreview(providerData.profileImage)
        }
        // Don't update Redux here to avoid infinite loops - Redux already has user data from login
        // Only update Redux when user explicitly makes changes (upload picture, update profile)
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError('Failed to load profile. Please try again.')
      }
    }

    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.providerId]) // Only depend on providerId, not the entire user object

  const handleProfilePictureChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid image file (JPG, PNG, GIF, or WebP)')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    setProfilePicture(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setProfilePicturePreview(reader.result)
    }
    reader.readAsDataURL(file)

    // Upload the picture immediately
    setUploadingPicture(true)
    setError('')
    
    try {
      const uploadFormData = new FormData()
      uploadFormData.append('profilePicture', file)

      const uploadResponse = await api.post('/api/providers/upload/profile-picture', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Update profile with the uploaded image URL
      const updateResponse = await api.put('/api/providers/me', {
        profileImage: uploadResponse.data.data.imageUrl
      })

      const updatedProvider = updateResponse.data.data?.provider
      dispatch(updateUser(updatedProvider))
      
      const imageUrl = uploadResponse.data.data.imageUrl
      setCurrentProfileImage(imageUrl)
      setProfilePicture(null) // Clear the file after successful upload
      setProfilePicturePreview(imageUrl)
      setSuccess('Profile picture updated successfully!')
      
      // Refresh profile data to ensure everything is in sync
      const providerResponse = await api.get('/api/providers/me')
      const freshProviderData = providerResponse.data.data?.provider
      if (freshProviderData?.profileImage) {
        setCurrentProfileImage(freshProviderData.profileImage)
        setProfilePicturePreview(freshProviderData.profileImage)
      }
      dispatch(updateUser(freshProviderData)) // Update Redux with fresh data including profileImage
    } catch (err) {
      console.error('Error uploading profile picture:', err)
      setError('Failed to upload profile picture. Please try again.')
      setProfilePicture(null)
      setProfilePicturePreview(currentProfileImage)
    } finally {
      setUploadingPicture(false)
    }
  }

  const removeProfilePicture = () => {
    setProfilePicture(null)
    setProfilePicturePreview(currentProfileImage)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    // Validate phone number
    const phoneDigits = formData.phoneNumber.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError('Phone number must be 10-15 digits')
      setLoading(false)
      return
    }

    try {
      const response = await api.put('/api/providers/me', {
        providerName: formData.providerName,
        email: formData.email,
        phoneNumber: phoneDigits,
        address: formData.address,
      })
      const updatedProvider = response.data.data?.provider

      dispatch(updateUser(updatedProvider))
      setSuccess('Profile updated successfully!')
      setError('')
      
      // Refresh profile data
      const providerResponse = await api.get('/api/providers/me')
      const freshProviderData = providerResponse.data.data?.provider
      if (freshProviderData?.profileImage) {
        setCurrentProfileImage(freshProviderData.profileImage)
        setProfilePicturePreview(freshProviderData.profileImage)
      }
      dispatch(updateUser(freshProviderData)) // Update Redux with fresh data including profileImage
    } catch (err) {
      const errorResponse = err.response?.data?.error
      const errorMessage = typeof errorResponse === 'string'
        ? errorResponse
        : errorResponse?.message
        || err.response?.data?.message
        || err.message
        || 'Failed to update profile'
      setError(errorMessage)
      console.error('Error updating profile:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/host')}
          className="text-primary-600 hover:text-primary-700 mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <h2 className="text-3xl font-bold mb-8">Profile Settings</h2>

        <form onSubmit={handleSubmit} className="card space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {typeof error === 'string' ? error : error?.message || error?.error?.message || 'An error occurred'}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              {typeof success === 'string' ? success : success?.message || 'Success'}
            </div>
          )}

          {/* Profile Picture Section */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Profile Picture
            </label>
            <div className="flex items-center space-x-4">
              <div className="relative">
                {profilePicturePreview && !profilePicturePreview.startsWith('data:') ? (
                  <img
                    src={`${import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'}${profilePicturePreview}`}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
                    key={profilePicturePreview} // Force re-render when image changes
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Cpath fill="%23999" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E'
                    }}
                  />
                ) : profilePicturePreview ? (
                  <div className="relative">
                    <img
                      src={profilePicturePreview}
                      alt="Profile preview"
                      className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={removeProfilePicture}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <Camera className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label
                  htmlFor="profilePicture"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingPicture ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                      Uploading...
                    </>
                  ) : profilePicturePreview ? (
                    'Change Picture'
                  ) : (
                    'Upload Picture'
                  )}
                </label>
                <input
                  id="profilePicture"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleProfilePictureChange}
                  className="hidden"
                  disabled={uploadingPicture || loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  JPG, PNG, GIF, or WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-2" />
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.providerName}
                onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                className="input-field"
                required
                placeholder="Your Business Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                required
                placeholder="business@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => {
                  // Only allow digits
                  const digitsOnly = e.target.value.replace(/\D/g, '')
                  setFormData({ ...formData, phoneNumber: digitsOnly })
                }}
                className="input-field"
                required
                placeholder="1234567890"
                minLength="10"
                maxLength="15"
              />
              <p className="text-xs text-gray-500 mt-1">Enter 10-15 digits only</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-2" />
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, street: e.target.value }
                })}
                className="input-field"
                required
                placeholder="123 Business St"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.city}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, city: e.target.value }
                })}
                className="input-field"
                required
                placeholder="New York"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.address.state}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, state: e.target.value.toUpperCase() }
                })}
                className="input-field"
                required
              >
                <option value="">Select a state</option>
                {US_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.zipCode}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, zipCode: e.target.value }
                })}
                className="input-field"
                required
                placeholder="10001"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/host')}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || uploadingPicture}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </span>
              ) : (
                <span className="flex items-center space-x-2">
                  <span>Save Changes</span>
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default HostProfilePage

