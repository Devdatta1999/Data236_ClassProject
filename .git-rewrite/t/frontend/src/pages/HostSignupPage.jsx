import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setError } from '../store/slices/authSlice'
import api from '../services/apiService'
import { Building2, ArrowLeft } from 'lucide-react'

const HostSignupPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [formData, setFormData] = useState({
    providerName: '',
    email: '',
    password: '',
    phoneNumber: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
    },
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate phone number before submission
    const phoneDigits = formData.phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError('Phone number must be 10-15 digits');
      setLoading(false);
      return;
    }

    // Auto-generate provider ID
    const providerId = `PROV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    try {
      console.log('Submitting host registration...', { providerId, ...formData })
      console.log('API URL:', api.defaults.baseURL)
      console.log('Full endpoint:', `${api.defaults.baseURL}/api/providers/register`)
      
      // Test API Gateway connectivity first
      try {
        const healthCheck = await fetch(`${api.defaults.baseURL}/health`)
        console.log('API Gateway health check:', healthCheck.status, await healthCheck.text())
      } catch (healthErr) {
        console.error('API Gateway not accessible:', healthErr)
        setError('Cannot connect to server. Please check if API Gateway is running.')
        setLoading(false)
        return
      }
      
      const response = await Promise.race([
        api.post('/api/providers/register', {
          providerId,
          providerName: formData.providerName,
          email: formData.email,
          password: formData.password,
          phoneNumber: phoneDigits, // Use digits-only version
          address: formData.address,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ])

      console.log('Registration successful:', response.data)
      setSuccess(true)
      setTimeout(() => {
        navigate('/login', { state: { message: 'Host registration successful! Please login.' } })
      }, 2000)
    } catch (err) {
      console.error('Registration error:', err)
      console.error('Error details:', {
        message: err.message,
        response: err.response,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Registration failed'
      setError(errorMessage)
      // Only dispatch if we have a proper error message string
      if (errorMessage && typeof errorMessage === 'string') {
        dispatch(setError(errorMessage))
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
            <p className="text-gray-600 mb-4">Your host account has been created.</p>
            <p className="text-sm text-gray-500">Redirecting to login...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <div className="flex items-center justify-center space-x-3 mb-2">
            <Building2 className="w-8 h-8 text-blue-600" />
            <h2 className="text-3xl font-extrabold text-gray-900">
              Register as Host
            </h2>
          </div>
          <p className="text-center text-sm text-gray-600">
            Join Aerive as a host and start listing your properties
          </p>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6 card" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="providerName" className="block text-sm font-medium text-gray-700">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                id="providerName"
                name="providerName"
                type="text"
                required
                value={formData.providerName}
                onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                className="input-field mt-1"
                placeholder="Your Business Name"
              />
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
                placeholder="business@example.com"
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
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input-field mt-1"
                placeholder="At least 8 characters"
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
                pattern="[0-9]{10,15}"
                value={formData.phoneNumber}
                onChange={(e) => {
                  // Only allow digits
                  const digitsOnly = e.target.value.replace(/\D/g, '');
                  setFormData({ ...formData, phoneNumber: digitsOnly });
                }}
                className="input-field mt-1"
                placeholder="1234567890 (10-15 digits)"
                minLength="10"
                maxLength="15"
              />
              <p className="mt-1 text-xs text-gray-500">Enter 10-15 digits only</p>
            </div>
            <div>
              <label htmlFor="street" className="block text-sm font-medium text-gray-700">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                id="street"
                name="street"
                type="text"
                required
                value={formData.address.street}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, street: e.target.value }
                })}
                className="input-field mt-1"
                placeholder="123 Business St"
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
                value={formData.address.city}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, city: e.target.value }
                })}
                className="input-field mt-1"
                placeholder="New York"
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
                value={formData.address.state}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, state: e.target.value.toUpperCase() }
                })}
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
                value={formData.address.zipCode}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, zipCode: e.target.value }
                })}
                className="input-field mt-1"
                placeholder="10001"
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
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Registering...</span>
                </span>
              ) : (
                'Register as Host'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default HostSignupPage

