import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setLoading, setError, loginSuccess } from '../store/slices/authSlice'
import { sendEventAndWait } from '../services/kafkaService'
import api from '../services/apiService'
import { Camera, X } from 'lucide-react'

const SignupPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { loading } = useSelector((state) => state.auth)
  const [formData, setFormData] = useState({
    userId: '',
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [profilePicture, setProfilePicture] = useState(null)
  const [profilePicturePreview, setProfilePicturePreview] = useState(null)
  const [uploadingPicture, setUploadingPicture] = useState(false)

  const handleProfilePictureChange = (e) => {
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
  }

  const removeProfilePicture = () => {
    setProfilePicture(null)
    setProfilePicturePreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    // Validate SSN format (XXX-XX-XXXX)
    const ssnPattern = /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/
    if (!ssnPattern.test(formData.userId)) {
      setError('User ID must be in SSN format (XXX-XX-XXXX)')
      return
    }

    dispatch(setLoading(true))

    try {
      const response = await sendEventAndWait(
        'user-events',
        {
          eventType: 'user.signup',
          userId: formData.userId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          address: formData.address,
          city: formData.city,
          state: formData.state.toUpperCase(),
          zipCode: formData.zipCode,
          phoneNumber: formData.phoneNumber,
          email: formData.email,
          password: formData.password,
        },
        'user-events-response',
        30000
      )

      dispatch(loginSuccess({
        token: response.token,
        user: response.user,
        userType: 'traveler',
      }))

      // Upload profile picture after successful signup (now we have auth token)
      if (profilePicture) {
        try {
          setUploadingPicture(true)
          const uploadFormData = new FormData()
          uploadFormData.append('profilePicture', profilePicture)

          const uploadResponse = await api.post('/api/users/upload/profile-picture', uploadFormData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          })

          // Update user profile with the uploaded image URL
          await api.put(`/api/users/${response.user.userId}`, {
            profileImage: uploadResponse.data.data.imageUrl
          })

          // Refresh user data in Redux store
          const userResponse = await api.get(`/api/users/${response.user.userId}`)
          dispatch(loginSuccess({
            token: response.token,
            user: userResponse.data.data.user,
            userType: 'traveler',
          }))
        } catch (uploadErr) {
          console.error('Error uploading profile picture:', uploadErr)
          // Don't block navigation if upload fails - user can update it later
        } finally {
          setUploadingPicture(false)
        }
      }

      navigate('/dashboard')
    } catch (err) {
      const errorMessage = err.message || 'Signup failed'
      setError(errorMessage)
      // Only dispatch if errorMessage is a string to avoid Redux errors
      if (typeof errorMessage === 'string') {
        dispatch(setError(errorMessage))
      }
    } finally {
      dispatch(setLoading(false))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your Aerive account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Sign in
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6 card" onSubmit={handleSubmit}>
          {/* Profile Picture Upload Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Picture (Optional)
            </label>
            <div className="flex items-center space-x-4">
              <div className="relative">
                {profilePicturePreview ? (
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
                  {profilePicturePreview ? (
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
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  JPG, PNG, GIF, or WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-gray-700">
                User ID (SSN) <span className="text-red-500">*</span>
              </label>
              <input
                id="userId"
                name="userId"
                type="text"
                required
                value={formData.userId}
                onChange={(e) => {
                  // Auto-format SSN as user types
                  let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                  if (value.length > 3) value = value.slice(0, 3) + '-' + value.slice(3);
                  if (value.length > 6) value = value.slice(0, 6) + '-' + value.slice(6);
                  if (value.length > 11) value = value.slice(0, 11); // Limit to XXX-XX-XXXX
                  setFormData({ ...formData, userId: value });
                }}
                className="input-field mt-1"
                placeholder="XXX-XX-XXXX"
                pattern="[0-9]{3}-[0-9]{2}-[0-9]{4}"
                maxLength="11"
              />
              <p className="text-xs text-gray-500 mt-1">Format: XXX-XX-XXXX (auto-formatted as you type)</p>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field mt-1"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                id="address"
                name="address"
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                State <span className="text-red-500">*</span>
              </label>
              <input
                id="state"
                name="state"
                type="text"
                required
                maxLength="2"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                className="input-field mt-1"
                placeholder="NY"
              />
            </div>
            <div>
              <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                id="zipCode"
                name="zipCode"
                type="text"
                required
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                className="input-field mt-1"
                placeholder="10001"
              />
            </div>
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                required
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="input-field mt-1"
                placeholder="1234567890"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength="8"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength="8"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="input-field mt-1"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <button 
              type="submit" 
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || uploadingPicture}
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>{uploadingPicture ? 'Uploading picture...' : 'Creating account...'}</span>
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SignupPage

