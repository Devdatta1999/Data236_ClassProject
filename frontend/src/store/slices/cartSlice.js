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
      // For other types, check if item already exists
      let existingIndex = -1
      
      if (item.listingType === 'Car' && item.pickupDate && item.returnDate) {
        existingIndex = state.items.findIndex(
          (i) => 
            i.listingId === item.listingId && 
            i.listingType === item.listingType &&
            i.pickupDate === item.pickupDate &&
            i.returnDate === item.returnDate
        )
      } else {
        existingIndex = state.items.findIndex(
          (i) => i.listingId === item.listingId && i.listingType === item.listingType
        )
      }
      
      if (existingIndex >= 0) {
        // Update quantity if exists (for non-car items or same dates)
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
      const { listingId, listingType, pickupDate, returnDate } = action.payload
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
      } else {
        // For other types, remove by listingId and listingType
        state.items = state.items.filter(
          (item) => !(item.listingId === listingId && item.listingType === listingType)
        )
      }
      localStorage.setItem('cart', JSON.stringify(state.items))
    },
    updateQuantity: (state, action) => {
      const { listingId, listingType, quantity } = action.payload
      const item = state.items.find(
        (i) => i.listingId === listingId && i.listingType === listingType
      )
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

