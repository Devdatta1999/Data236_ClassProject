import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setLoading, setError, loginSuccess } from '../store/slices/authSlice'
import { sendEventAndWait } from '../services/kafkaService'
import api from '../services/apiService'

const LoginPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    userType: 'traveler', // 'traveler', 'admin', 'host'
  })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    dispatch(setLoading(true))

    try {
      if (formData.userType === 'traveler') {
        // Use Kafka for traveler login (as per original design)
        const response = await sendEventAndWait(
          'user-events',
          {
            eventType: 'user.login',
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
        navigate('/dashboard')
      } else if (formData.userType === 'admin') {
        // Use HTTP for admin login
        const response = await api.post('/api/admin/login', {
          email: formData.email,
          password: formData.password,
        })

        dispatch(loginSuccess({
          token: response.data.data.token,
          user: response.data.data.admin,
          userType: 'admin',
        }))
        navigate('/admin')
      } else if (formData.userType === 'host') {
        // Use HTTP for host/provider login
        const response = await api.post('/api/providers/login', {
          email: formData.email,
          password: formData.password,
        })

        dispatch(loginSuccess({
          token: response.data.data.token,
          user: response.data.data.provider,
          userType: 'host',
        }))
        navigate('/host')
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed'
      setError(errorMessage)
      dispatch(setError(errorMessage))
    } finally {
      dispatch(setLoading(false))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to Aerive
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/signup" className="font-medium text-primary-600 hover:text-primary-500">
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6 card" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="userType" className="block text-sm font-medium text-gray-700">
                Account Type
              </label>
              <select
                id="userType"
                value={formData.userType}
                onChange={(e) => setFormData({ ...formData, userType: e.target.value })}
                className="input-field mt-1"
              >
                <option value="traveler">Traveler</option>
                <option value="admin">Admin</option>
                <option value="host">Host</option>
              </select>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field mt-1"
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input-field mt-1"
                placeholder="Enter your password"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <button type="submit" className="btn-primary w-full">
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginPage

