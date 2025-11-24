import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  searchType: 'flights', // 'flights', 'hotels', 'cars'
  searchResults: {
    flights: [],
    hotels: [],
    cars: [],
  },
  searchParams: {
    flights: {
      departureAirport: '',
      arrivalAirport: '',
      departureDate: '',
      minPrice: null,
      maxPrice: null,
      flightClass: 'Economy',
      sortBy: 'departureDateTime',
    },
    hotels: {
      city: '',
      state: '',
      starRating: null,
      minPrice: null,
      maxPrice: null,
      amenities: [],
      sortBy: 'hotelRating',
    },
    cars: {
      carType: '',
      minPrice: null,
      maxPrice: null,
      transmissionType: '',
      minSeats: null,
      sortBy: 'dailyRentalPrice',
    },
  },
  loading: false,
  error: null,
  lastSearch: null,
}

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSearchType: (state, action) => {
      state.searchType = action.payload
    },
    setSearchParams: (state, action) => {
      const { type, params } = action.payload
      state.searchParams[type] = { ...state.searchParams[type], ...params }
    },
    setSearchResults: (state, action) => {
      const { type, results } = action.payload
      state.searchResults[type] = results
      state.loading = false
      state.lastSearch = { type, timestamp: Date.now() }
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
      state.loading = false
    },
    clearSearch: (state) => {
      state.searchResults = { flights: [], hotels: [], cars: [] }
      state.error = null
    },
  },
})

export const { setSearchType, setSearchParams, setSearchResults, setLoading, setError, clearSearch } = searchSlice.actions
export default searchSlice.reducer

