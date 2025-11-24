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
      // Check if item already exists
      const existingIndex = state.items.findIndex(
        (i) => i.listingId === item.listingId && i.listingType === item.listingType
      )
      
      if (existingIndex >= 0) {
        // Update quantity if exists
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
      const { listingId, listingType } = action.payload
      state.items = state.items.filter(
        (item) => !(item.listingId === listingId && item.listingType === listingType)
      )
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

