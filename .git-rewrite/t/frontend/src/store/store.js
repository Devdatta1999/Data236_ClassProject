import { configureStore } from '@reduxjs/toolkit'
import authSlice from './slices/authSlice'
import searchSlice from './slices/searchSlice'
import cartSlice from './slices/cartSlice'
import bookingSlice from './slices/bookingSlice'
import userSlice from './slices/userSlice'
import adminSlice from './slices/adminSlice'
import hostSlice from './slices/hostSlice'

export const store = configureStore({
  reducer: {
    auth: authSlice,
    search: searchSlice,
    cart: cartSlice,
    bookings: bookingSlice,
    user: userSlice,
    admin: adminSlice,
    host: hostSlice,
  },
})

