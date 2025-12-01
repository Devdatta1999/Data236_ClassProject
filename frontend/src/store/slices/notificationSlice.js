import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  items: [],
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action) => {
      state.items.push(action.payload)
    },
    removeNotification: (state, action) => {
      state.items = state.items.filter((n) => n.id !== action.payload)
    },
    clearNotifications: (state) => {
      state.items = []
    },
  },
})

export const { addNotification, removeNotification, clearNotifications } = notificationSlice.actions
export default notificationSlice.reducer


