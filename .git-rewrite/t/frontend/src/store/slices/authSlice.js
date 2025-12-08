import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  userType: localStorage.getItem('userType') || null, // 'traveler', 'admin', 'host'
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
      state.loading = false
    },
    loginSuccess: (state, action) => {
      const { token, user, userType } = action.payload
      state.token = token
      state.user = user
      state.userType = userType
      state.isAuthenticated = true
      state.loading = false
      state.error = null
      
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('userType', userType)
    },
    logout: (state) => {
      state.token = null
      state.user = null
      state.userType = null
      state.isAuthenticated = false
      state.error = null
      
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('userType')
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload }
      localStorage.setItem('user', JSON.stringify(state.user))
    },
  },
})

export const { setLoading, setError, loginSuccess, logout, updateUser } = authSlice.actions
export default authSlice.reducer

