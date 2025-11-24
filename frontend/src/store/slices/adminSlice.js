import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  pendingListings: {
    flights: [],
    hotels: [],
    cars: [],
  },
  analytics: {
    totalUsers: 0,
    totalBookings: 0,
    totalRevenue: 0,
    activeListings: 0,
  },
  selectedTab: 'requests', // 'requests', 'create', 'admin-dashboard', 'host-dashboard'
  loading: false,
  error: null,
}

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    setPendingListings: (state, action) => {
      const { type, listings } = action.payload
      state.pendingListings[type] = listings
    },
    removePendingListing: (state, action) => {
      const { listingId, listingType } = action.payload
      const type = listingType.toLowerCase() + 's'
      state.pendingListings[type] = state.pendingListings[type].filter(
        (l) => l[`${listingType.toLowerCase()}Id`] !== listingId
      )
    },
    setAnalytics: (state, action) => {
      state.analytics = { ...state.analytics, ...action.payload }
    },
    setSelectedTab: (state, action) => {
      state.selectedTab = action.payload
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

export const { setPendingListings, removePendingListing, setAnalytics, setSelectedTab, setLoading, setError } = adminSlice.actions
export default adminSlice.reducer

