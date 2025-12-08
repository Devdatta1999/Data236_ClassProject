import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  items: JSON.parse(localStorage.getItem('cart')) || [],
  checkoutId: null,
  loading: false,
  error: null,
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart: (state, action) => {
      const item = action.payload
      // For cars, check if item with same dates already exists
      // For hotels, check if item with same listingId, roomType, and dates already exists
      // For flights, check if item already exists
      let existingIndex = -1
      
      if (item.listingType === 'Car' && item.pickupDate && item.returnDate) {
        existingIndex = state.items.findIndex(
          (i) => 
            i.listingId === item.listingId && 
            i.listingType === item.listingType &&
            i.pickupDate === item.pickupDate &&
            i.returnDate === item.returnDate
        )
      } else if (item.listingType === 'Hotel' && item.roomType && item.checkInDate && item.checkOutDate) {
        // For hotels, treat each room type + date combination as a unique cart item
        existingIndex = state.items.findIndex(
          (i) => 
            i.listingId === item.listingId && 
            i.listingType === item.listingType &&
            i.roomType === item.roomType &&
            i.checkInDate === item.checkInDate &&
            i.checkOutDate === item.checkOutDate
        )
      } else {
        // For flights or other types without specific differentiation
        existingIndex = state.items.findIndex(
          (i) => i.listingId === item.listingId && i.listingType === item.listingType
        )
      }
      
      if (existingIndex >= 0) {
        // Update quantity if exists (for same room type + dates for hotels, or same dates for cars)
        state.items[existingIndex].quantity += item.quantity || 1
      } else {
        // Add new item
        state.items.push({
          ...item,
          quantity: item.quantity || 1,
          addedAt: Date.now(),
        })
      }
      
      localStorage.setItem('cart', JSON.stringify(state.items))
    },
    removeFromCart: (state, action) => {
      const { listingId, listingType, pickupDate, returnDate, roomType, checkInDate, checkOutDate } = action.payload
      if (listingType === 'Car' && pickupDate && returnDate) {
        // For cars, remove specific item with matching dates
        state.items = state.items.filter(
          (item) => !(
            item.listingId === listingId && 
            item.listingType === listingType &&
            item.pickupDate === pickupDate &&
            item.returnDate === returnDate
          )
        )
      } else if (listingType === 'Hotel' && roomType && checkInDate && checkOutDate) {
        // For hotels, remove specific item with matching room type and dates
        state.items = state.items.filter(
          (item) => !(
            item.listingId === listingId && 
            item.listingType === listingType &&
            item.roomType === roomType &&
            item.checkInDate === checkInDate &&
            item.checkOutDate === checkOutDate
          )
        )
      } else {
        // For other types, remove by listingId and listingType
        state.items = state.items.filter(
          (item) => !(item.listingId === listingId && item.listingType === listingType)
        )
      }
      localStorage.setItem('cart', JSON.stringify(state.items))
    },
    updateQuantity: (state, action) => {
      const { listingId, listingType, quantity, roomType, checkInDate, checkOutDate, pickupDate, returnDate } = action.payload
      let item
      
      if (listingType === 'Hotel' && roomType && checkInDate && checkOutDate) {
        // For hotels, find item with matching room type and dates
        item = state.items.find(
          (i) => 
            i.listingId === listingId && 
            i.listingType === listingType &&
            i.roomType === roomType &&
            i.checkInDate === checkInDate &&
            i.checkOutDate === checkOutDate
        )
      } else if (listingType === 'Car' && pickupDate && returnDate) {
        // For cars, find item with matching dates
        item = state.items.find(
          (i) => 
            i.listingId === listingId && 
            i.listingType === listingType &&
            i.pickupDate === pickupDate &&
            i.returnDate === returnDate
        )
      } else {
        // For flights or other types
        item = state.items.find(
          (i) => i.listingId === listingId && i.listingType === listingType
        )
      }
      
      if (item) {
        item.quantity = quantity
        localStorage.setItem('cart', JSON.stringify(state.items))
      }
    },
    clearCart: (state) => {
      state.items = []
      state.checkoutId = null
      localStorage.removeItem('cart')
    },
    setCheckoutId: (state, action) => {
      state.checkoutId = action.payload
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

export const { addToCart, removeFromCart, updateQuantity, clearCart, setCheckoutId, setLoading, setError } = cartSlice.actions
export default cartSlice.reducer

