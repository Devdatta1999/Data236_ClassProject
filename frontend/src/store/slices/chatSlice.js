import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  isOpen: false,
  sessionId: null,
  messages: [],
  isLoading: false,
  error: null,
  bundles: [],
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    openChat: (state) => {
      state.isOpen = true
      // Generate or retrieve session ID
      if (!state.sessionId) {
        state.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      // Load messages from localStorage
      const cachedMessages = localStorage.getItem(`chat_${state.sessionId}`)
      if (cachedMessages) {
        try {
          state.messages = JSON.parse(cachedMessages)
        } catch (e) {
          state.messages = []
        }
      }
    },
    closeChat: (state) => {
      state.isOpen = false
    },
    setSessionId: (state, action) => {
      state.sessionId = action.payload
      // Load messages for this session
      const cachedMessages = localStorage.getItem(`chat_${action.payload}`)
      if (cachedMessages) {
        try {
          state.messages = JSON.parse(cachedMessages)
        } catch (e) {
          state.messages = []
        }
      }
    },
    addMessage: (state, action) => {
      const message = {
        ...action.payload,
        id: action.payload.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: action.payload.timestamp || new Date().toISOString(),
      }
      state.messages.push(message)
      // Cache messages to localStorage
      if (state.sessionId) {
        localStorage.setItem(`chat_${state.sessionId}`, JSON.stringify(state.messages))
      }
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
      state.isLoading = false
    },
    setBundles: (state, action) => {
      state.bundles = action.payload
    },
    clearChat: (state) => {
      state.messages = []
      state.bundles = []
      state.error = null
      if (state.sessionId) {
        localStorage.removeItem(`chat_${state.sessionId}`)
      }
    },
  },
})

export const {
  openChat,
  closeChat,
  setSessionId,
  addMessage,
  setLoading,
  setError,
  setBundles,
  clearChat,
} = chatSlice.actions

export default chatSlice.reducer

