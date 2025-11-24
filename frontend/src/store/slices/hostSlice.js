import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  provider: null,
  listings: [],
  profitability: {
    totalRevenue: 0,
    totalListings: 0,
    averageRating: 0,
    bookingsCount: 0,
  },
  loading: false,
  error: null,
}

const hostSlice = createSlice({
  name: 'host',
  initialState,
  reducers: {
    setProvider: (state, action) => {
      state.provider = action.payload
    },
    setListings: (state, action) => {
      state.listings = action.payload
    },
    addListing: (state, action) => {
      state.listings.push(action.payload)
    },
    setProfitability: (state, action) => {
      state.profitability = { ...state.profitability, ...action.payload }
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

export const { setProvider, setListings, addListing, setProfitability, setLoading, setError } = hostSlice.actions
export default hostSlice.reducer

