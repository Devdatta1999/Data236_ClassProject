import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  bookings: [],
  confirmedBookings: [],
  pendingBookings: [],
  cancelledBookings: [],
  loading: false,
  error: null,
  selectedBooking: null,
}

const bookingSlice = createSlice({
  name: 'bookings',
  initialState,
  reducers: {
    setBookings: (state, action) => {
      state.bookings = action.payload
      state.confirmedBookings = action.payload.filter((b) => b.status === 'Confirmed')
      state.pendingBookings = action.payload.filter((b) => b.status === 'Pending')
      state.cancelledBookings = action.payload.filter((b) => b.status === 'Cancelled')
    },
    addBooking: (state, action) => {
      state.bookings.push(action.payload)
      if (action.payload.status === 'Pending') {
        state.pendingBookings.push(action.payload)
      } else if (action.payload.status === 'Confirmed') {
        state.confirmedBookings.push(action.payload)
      }
    },
    updateBooking: (state, action) => {
      const { bookingId, updates } = action.payload
      const index = state.bookings.findIndex((b) => b.bookingId === bookingId)
      if (index >= 0) {
        state.bookings[index] = { ...state.bookings[index], ...updates }
        
        // Update filtered arrays
        state.confirmedBookings = state.bookings.filter((b) => b.status === 'Confirmed')
        state.pendingBookings = state.bookings.filter((b) => b.status === 'Pending')
        state.cancelledBookings = state.bookings.filter((b) => b.status === 'Cancelled')
      }
    },
    setSelectedBooking: (state, action) => {
      state.selectedBooking = action.payload
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

export const { setBookings, addBooking, updateBooking, setSelectedBooking, setLoading, setError } = bookingSlice.actions
export default bookingSlice.reducer

