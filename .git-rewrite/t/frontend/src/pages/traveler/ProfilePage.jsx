import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { updateUser, logout } from '../../store/slices/authSlice'
import { setProfile, updateProfile as updateUserProfile } from '../../store/slices/userSlice'
import api from '../../services/apiService'
import { US_STATES } from '../../utils/usStates'
import { User, Mail, Phone, MapPin, CreditCard, ArrowLeft, Save, Plus, Trash2, Camera, X } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'

// Helper function to get image source - handles various image path formats
const getImageSrc = (imagePath) => {
  if (!imagePath) return ''
  // If it's already a full URL (http/https), return as is
  if (imagePath.startsWith('http')) return imagePath
  // If it already starts with /api/, prepend API_BASE_URL
  if (imagePath.startsWith('/api/')) {
    return `${API_BASE_URL}${imagePath}`
  }
  // Otherwise, construct the path
  return `${API_BASE_URL}${imagePath}`
}

const ProfilePage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { profile } = useSelector((state) => state.user)
  const [formData, setFormData] = useState({
    userId: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savedCards, setSavedCards] = useState([])
  const [showAddCard, setShowAddCard] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [cardToDelete, setCardToDelete] = useState(null)
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false)
  const [deleteProfileLoading, setDeleteProfileLoading] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [cardFormData, setCardFormData] = useState({
    cardNumber: '',
    cardHolderName: '',
    expiryDate: '',
    zipCode: formData.zipCode || '', // Initialize with user's zipCode
  })
  const [cardLoading, setCardLoading] = useState(false)
  const [profilePicture, setProfilePicture] = useState(null)
  const [profilePicturePreview, setProfilePicturePreview] = useState(null)
  const [uploadingPicture, setUploadingPicture] = useState(false)
  const [currentProfileImage, setCurrentProfileImage] = useState(null)
  const [imageLoadKey, setImageLoadKey] = useState(0)

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.userId) return

      try {
        const response = await api.get(`/api/users/${user.userId}`)
        const userData = response.data.data?.user
        dispatch(setProfile(userData))
        setFormData({
          userId: userData?.userId || '',
          firstName: userData?.firstName || '',
          lastName: userData?.lastName || '',
          email: userData?.email || '',
          phoneNumber: userData?.phoneNumber || '',
          address: userData?.address || '',
          city: userData?.city || '',
          state: userData?.state || '',
          zipCode: userData?.zipCode || '',
        })
        // Set current profile image if it exists
        if (userData?.profileImage) {
          setCurrentProfileImage(userData.profileImage)
          setProfilePicturePreview(userData.profileImage)
          // Use requestAnimationFrame to ensure image loads properly
          requestAnimationFrame(() => {
            setImageLoadKey(Date.now())
          })
        }
        // Don't update Redux here to avoid infinite loops - Redux already has user data from login
        // Only update Redux when user explicitly makes changes (upload picture, update profile)
      } catch (err) {
        console.error('Error fetching profile:', err)
      }
    }

    fetchProfile()
    fetchSavedCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]) // Only depend on userId, not the entire user object

  const fetchSavedCards = async () => {
    if (!user?.userId) return
    try {
      const response = await api.get(`/api/users/${user.userId}/cards`)
      setSavedCards(response.data.data?.cards || [])
    } catch (err) {
      console.error('Error fetching saved cards:', err)
    }
  }

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  const formatExpiryDate = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  const handleAddCard = async (e) => {
    e.preventDefault()
    setCardLoading(true)
    setError('')
    setSuccess('')

    // Client-side validation
    if (!cardFormData.cardNumber || !cardFormData.cardHolderName || !cardFormData.expiryDate || !cardFormData.zipCode) {
      setError('Please fill in all required fields (including ZIP code)')
      setCardLoading(false)
      return
    }

    // Validate expiry date format
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardFormData.expiryDate)) {
      setError('Expiry date must be in MM/YY format (e.g., 12/25)')
      setCardLoading(false)
      return
    }

    // Check if expiry date is in the past
    const [month, year] = cardFormData.expiryDate.split('/')
    const expiryYear = 2000 + parseInt(year)
    const expiryDateObj = new Date(expiryYear, parseInt(month) - 1)
    const now = new Date()
    if (expiryDateObj < now) {
      setError('Card expiry date cannot be in the past')
      setCardLoading(false)
      return
    }

    try {
      const response = await api.post(`/api/users/${user.userId}/cards`, cardFormData)
      setShowAddCard(false)
      setCardFormData({ cardNumber: '', cardHolderName: '', expiryDate: '', zipCode: formData.zipCode || '' })
      setSuccess('Credit card saved successfully!')
      setError('') // Clear any previous errors
      fetchSavedCards()
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message || 
                          err.response?.data?.message || 
                          err.message || 
                          'Failed to save credit card. Please try again.'
      setError(errorMessage)
      console.error('Error saving card:', err)
    } finally {
      setCardLoading(false)
    }
  }

  const handleEditCard = (card) => {
    setEditingCard(card.cardId)
    setCardFormData({
      cardNumber: '', // User needs to re-enter for security
      cardHolderName: card.cardHolderName || '',
      expiryDate: card.expiryDate || '',
      zipCode: card.zipCode || formData.zipCode || '',
    })
    setShowAddCard(false) // Hide add card form if open
  }

  const handleCancelEdit = () => {
    setEditingCard(null)
    setCardFormData({ cardNumber: '', cardHolderName: '', expiryDate: '', zipCode: formData.zipCode || '' })
  }

  const handleUpdateCard = async (e) => {
    e.preventDefault()
    if (!editingCard) return

    setCardLoading(true)
    setError('')
    setSuccess('')

    // Client-side validation
    if (!cardFormData.cardNumber || !cardFormData.cardHolderName || !cardFormData.expiryDate || !cardFormData.zipCode) {
      setError('Please fill in all required fields (including ZIP code)')
      setCardLoading(false)
      return
    }

    // Validate expiry date format
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardFormData.expiryDate)) {
      setError('Expiry date must be in MM/YY format (e.g., 12/25)')
      setCardLoading(false)
      return
    }

    // Check if expiry date is in the past
    const [month, year] = cardFormData.expiryDate.split('/')
    const expiryYear = 2000 + parseInt(year)
    const expiryDateObj = new Date(expiryYear, parseInt(month) - 1)
    const now = new Date()
    if (expiryDateObj < now) {
      setError('Card expiry date cannot be in the past')
      setCardLoading(false)
      return
    }

    try {
      const response = await api.put(`/api/users/${user.userId}/cards`, {
        cardId: editingCard,
        ...cardFormData
      })
      setEditingCard(null)
      setCardFormData({ cardNumber: '', cardHolderName: '', expiryDate: '', zipCode: formData.zipCode || '' })
      setSuccess('Credit card updated successfully!')
      setError('') // Clear any previous errors
      fetchSavedCards()
    } catch (err) {
      const errorResponse = err.response?.data?.error
      const errorMessage = typeof errorResponse === 'string' 
        ? errorResponse 
        : errorResponse?.message 
        || err.response?.data?.message 
        || err.message 
        || 'Failed to update credit card. Please try again.'
      setError(errorMessage)
      console.error('Error updating card:', err)
    } finally {
      setCardLoading(false)
    }
  }

  const handleDeleteCard = (cardId) => {
    setCardToDelete(cardId)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteCard = async () => {
    if (!cardToDelete) return

    try {
      await api.delete(`/api/users/${user.userId}/cards`, { data: { cardId: cardToDelete } })
      setSuccess('Credit card deleted successfully!')
      setError('') // Clear any previous errors
      setShowDeleteConfirm(false)
      setCardToDelete(null)
      fetchSavedCards()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete credit card')
      setShowDeleteConfirm(false)
      setCardToDelete(null)
    }
  }

  const cancelDeleteCard = () => {
    setShowDeleteConfirm(false)
    setCardToDelete(null)
  }

  const handleDeleteProfile = () => {
    setShowDeleteProfileConfirm(true)
  }

  const cancelDeleteProfile = () => {
    setShowDeleteProfileConfirm(false)
  }

  const confirmDeleteProfile = async () => {
    if (!user?.userId) return

    setDeleteProfileLoading(true)
    setError('')
    
    try {
      await api.delete(`/api/users/${user.userId}`)
      
      setSuccess('Your profile has been deleted successfully.')
      
      // Logout user and redirect after a short delay
      setTimeout(() => {
        dispatch(logout())
        navigate('/')
      }, 2000)
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message 
        || err.response?.data?.message 
        || err.message 
        || 'Failed to delete profile. Please try again.'
      setError(errorMessage)
      setShowDeleteProfileConfirm(false)
    } finally {
      setDeleteProfileLoading(false)
    }
  }

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

      const uploadResponse = await api.post('/api/users/upload/profile-picture', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Update profile with the uploaded image URL
      const updateResponse = await api.put(`/api/users/${user.userId}`, {
        profileImage: uploadResponse.data.data.imageUrl
      })

      const updatedUser = updateResponse.data.data?.user
      dispatch(updateUser(updatedUser))
      dispatch(updateUserProfile(updatedUser))
      
      const imageUrl = uploadResponse.data.data.imageUrl
      setCurrentProfileImage(imageUrl)
      setProfilePicture(null) // Clear the file after successful upload
      setProfilePicturePreview(imageUrl) // Set preview to the uploaded image URL
      setSuccess('Profile picture updated successfully!')
      
      // Use requestAnimationFrame to ensure image loads properly
      requestAnimationFrame(() => {
        setImageLoadKey(Date.now())
      })
      
      // Refresh profile data to ensure everything is in sync
      const userResponse = await api.get(`/api/users/${user.userId}`)
      const freshUserData = userResponse.data.data?.user
      if (freshUserData?.profileImage) {
        setCurrentProfileImage(freshUserData.profileImage)
        setProfilePicturePreview(freshUserData.profileImage)
        requestAnimationFrame(() => {
          setImageLoadKey(Date.now())
        })
      }
      dispatch(setProfile(freshUserData))
      dispatch(updateUser(freshUserData)) // Update Redux with fresh data including profileImage
    } catch (err) {
      console.error('Error uploading profile picture:', err)
      setError('Failed to upload profile picture. Please try again.')
      setProfilePicture(null)
      setProfilePicturePreview(null)
    } finally {
      setUploadingPicture(false)
    }
  }

  const removeProfilePicture = () => {
    setProfilePicture(null)
    setProfilePicturePreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await api.put(`/api/users/${user.userId}`, formData)
      const updatedUser = response.data.data?.user

      dispatch(updateUser(updatedUser))
      dispatch(updateUserProfile(updatedUser))
      setSuccess('Profile updated successfully!')
      // Clear error on success
      setError('')
      
      // Refresh profile data to get updated profile image
      const userResponse = await api.get(`/api/users/${user.userId}`)
      const freshUserData = userResponse.data.data?.user
      if (freshUserData?.profileImage) {
        setCurrentProfileImage(freshUserData.profileImage)
        setProfilePicturePreview(freshUserData.profileImage)
        requestAnimationFrame(() => {
          setImageLoadKey(Date.now())
        })
      }
      dispatch(setProfile(freshUserData))
      dispatch(updateUser(freshUserData)) // Update Redux with fresh data including profileImage
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
          onClick={() => navigate('/dashboard')}
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
                {profilePicturePreview ? (
                  profilePicturePreview.startsWith('data:') ? (
                    <div className="relative">
                      <img
                        src={profilePicturePreview}
                        alt="Profile preview"
                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
                        loading="eager"
                        decoding="async"
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
                    <img
                      key={`profile-preview-${imageLoadKey}-${profilePicturePreview}`}
                      src={getImageSrc(profilePicturePreview)}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
                      loading="eager"
                      decoding="async"
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Cpath fill="%23999" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E'
                      }}
                      onLoad={(e) => {
                        e.target.style.opacity = '1'
                        e.target.style.display = 'block'
                      }}
                    />
                  )
                ) : currentProfileImage ? (
                  <img
                    key={`profile-current-${imageLoadKey}-${currentProfileImage}`}
                    src={getImageSrc(currentProfileImage)}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Cpath fill="%23999" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E'
                    }}
                    onLoad={(e) => {
                      e.target.style.opacity = '1'
                      e.target.style.display = 'block'
                    }}
                  />
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
                <User className="w-4 h-4 inline mr-2" />
                User ID (SSN)
              </label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => {
                  // Format as XXX-XX-XXXX
                  const value = e.target.value.replace(/\D/g, '');
                  let formatted = value;
                  if (value.length > 3) {
                    formatted = value.slice(0, 3) + '-' + value.slice(3);
                  }
                  if (value.length > 5) {
                    formatted = value.slice(0, 3) + '-' + value.slice(3, 5) + '-' + value.slice(5, 9);
                  }
                  setFormData({ ...formData, userId: formatted })
                }}
                className="input-field"
                placeholder="XXX-XX-XXXX"
                maxLength="11"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Format: XXX-XX-XXXX</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                First Name
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-2" />
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Select a state</option>
                {US_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} - {state.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>

        {/* Saved Credit Cards Section */}
        <div className="card mt-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold flex items-center space-x-2">
              <CreditCard className="w-5 h-5" />
              <span>Saved Credit Cards</span>
            </h3>
            <button
              onClick={() => setShowAddCard(!showAddCard)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Card</span>
            </button>
          </div>

          {showAddCard && (
            <form onSubmit={handleAddCard} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">
                <strong>Note:</strong> For security, CVV is not stored. You'll be asked for CVV when making a payment.
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Number
                </label>
                <input
                  type="text"
                  maxLength="19"
                  value={cardFormData.cardNumber}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    cardNumber: formatCardNumber(e.target.value),
                  })}
                  className="input-field text-gray-900"
                  placeholder="1234 5678 9012 3456"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Holder Name
                </label>
                <input
                  type="text"
                  value={cardFormData.cardHolderName}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    cardHolderName: e.target.value,
                  })}
                  className="input-field text-gray-900"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date (MM/YY)
                </label>
                <input
                  type="text"
                  maxLength="5"
                  value={cardFormData.expiryDate}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    expiryDate: formatExpiryDate(e.target.value),
                  })}
                  className="input-field text-gray-900"
                  placeholder="MM/YY (e.g., 12/25)"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: MM/YY (e.g., 12/25 for December 2025)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cardFormData.zipCode}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    zipCode: e.target.value,
                  })}
                  className="input-field text-gray-900"
                  placeholder="12345 or 12345-6789"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ZIP code for payment verification
                </p>
              </div>
              
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCard(false)
                    setCardFormData({ cardNumber: '', cardHolderName: '', expiryDate: '', zipCode: formData.zipCode || '' })
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cardLoading}
                  className="btn-primary disabled:opacity-50"
                >
                  {cardLoading ? 'Saving...' : 'Save Card'}
                </button>
              </div>
            </form>
          )}

          {/* Edit Card Form */}
          {editingCard && (
            <form onSubmit={handleUpdateCard} className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
              <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-3 rounded text-sm">
                <strong>Editing Card:</strong> Please update the card details below. You'll need to re-enter the full card number for security.
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Number
                </label>
                <input
                  type="text"
                  maxLength="19"
                  value={cardFormData.cardNumber}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    cardNumber: formatCardNumber(e.target.value),
                  })}
                  className="input-field text-gray-900"
                  placeholder="1234 5678 9012 3456"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Holder Name
                </label>
                <input
                  type="text"
                  value={cardFormData.cardHolderName}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    cardHolderName: e.target.value,
                  })}
                  className="input-field text-gray-900"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date (MM/YY)
                </label>
                <input
                  type="text"
                  maxLength="5"
                  value={cardFormData.expiryDate}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    expiryDate: formatExpiryDate(e.target.value),
                  })}
                  className="input-field text-gray-900"
                  placeholder="MM/YY (e.g., 12/25)"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cardFormData.zipCode}
                  onChange={(e) => setCardFormData({
                    ...cardFormData,
                    zipCode: e.target.value,
                  })}
                  className="input-field text-gray-900"
                  placeholder="12345 or 12345-6789"
                  required
                />
              </div>
              
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cardLoading}
                  className="btn-primary disabled:opacity-50"
                >
                  {cardLoading ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {savedCards.length === 0 && !showAddCard && !editingCard ? (
            <p className="text-gray-500 text-center py-8">No saved credit cards</p>
          ) : (
            <div className="space-y-3">
              {savedCards.map((card) => (
                <div
                  key={card.cardId}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    editingCard === card.cardId 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                  }`}
                  onClick={() => !editingCard && handleEditCard(card)}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <CreditCard className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium">{card.cardHolderName}</p>
                      <p className="text-sm text-gray-600">{card.cardNumber}</p>
                      <p className="text-xs text-gray-500">Expires: {card.expiryDate}</p>
                      {editingCard === card.cardId && (
                        <p className="text-xs text-blue-600 mt-1">Editing... Click Cancel to stop</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingCard !== card.cardId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditCard(card)
                          }}
                          className="text-blue-600 hover:text-blue-700 flex items-center space-x-1 px-3 py-1 rounded hover:bg-blue-50"
                        >
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCard(card.cardId)
                          }}
                          className="text-red-600 hover:text-red-700 flex items-center space-x-1 px-3 py-1 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Delete Credit Card</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this credit card? This action cannot be undone.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={cancelDeleteCard}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeleteCard}
                    className="btn-primary bg-red-600 hover:bg-red-700"
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete Profile Section */}
        <div className="card mt-8 border-2 border-red-200">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-red-700 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">
              Once you delete your profile, you will not be able to recover it. 
              However, your bookings and reviews will be preserved for record-keeping purposes.
            </p>
          </div>
          <button
            onClick={handleDeleteProfile}
            className="btn-primary bg-red-600 hover:bg-red-700 text-white flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete My Profile</span>
          </button>
        </div>

        {/* Delete Profile Confirmation Dialog */}
        {showDeleteProfileConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-red-700">Delete Profile</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete your profile? This action cannot be undone.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Your bookings, reviews, and billing history will be preserved for record-keeping, 
                  but you will no longer be able to access your account or make new bookings.
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={cancelDeleteProfile}
                  disabled={deleteProfileLoading}
                  className="btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteProfile}
                  disabled={deleteProfileLoading}
                  className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteProfileLoading ? 'Deleting...' : 'Yes, Delete My Profile'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfilePage

