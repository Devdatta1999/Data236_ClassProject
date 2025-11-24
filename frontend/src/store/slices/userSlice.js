import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  profile: null,
  paymentDetails: null,
  bookingHistory: [],
  reviews: [],
  loading: false,
  error: null,
}

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setProfile: (state, action) => {
      state.profile = action.payload
      if (action.payload.paymentDetails) {
        state.paymentDetails = action.payload.paymentDetails
      }
      if (action.payload.bookingHistory) {
        state.bookingHistory = action.payload.bookingHistory
      }
      if (action.payload.reviews) {
        state.reviews = action.payload.reviews
      }
    },
    updateProfile: (state, action) => {
      state.profile = { ...state.profile, ...action.payload }
    },
    setPaymentDetails: (state, action) => {
      state.paymentDetails = action.payload
    },
    setBookingHistory: (state, action) => {
      state.bookingHistory = action.payload
    },
    addReview: (state, action) => {
      state.reviews.push(action.payload)
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
      state.loading = false
    },
  },
})

export const { setProfile, updateProfile, setPaymentDetails, setBookingHistory, addReview, setLoading, setError } = userSlice.actions
export default userSlice.reducer

