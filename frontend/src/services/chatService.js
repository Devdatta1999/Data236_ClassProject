import axios from 'axios'

const RECOMMENDATION_SERVICE_URL = import.meta.env.VITE_RECOMMENDATION_SERVICE_URL || 'http://localhost:8000'

const chatApi = axios.create({
  baseURL: RECOMMENDATION_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout for AI responses
})

/**
 * Send a chat message to the recommendation service
 * @param {string} sessionId - User session ID
 * @param {string} message - User message
 * @returns {Promise} Response with bundles and assistant message
 */
export const sendChatMessage = async (sessionId, message) => {
  try {
    const response = await chatApi.post('/chat', {
      session_id: sessionId,
      message: message,
    })
    return response.data
  } catch (error) {
    console.error('Chat API error:', error)
    throw error
  }
}

/**
 * Select a bundle for checkout. Returns a quote that can be shown on a
 * dedicated payment/quote page.
 */
export const selectBundle = async (sessionId, bundleId) => {
  try {
    const response = await chatApi.post('/bundles/select', {
      session_id: sessionId,
      bundle_id: bundleId,
    })
    return response.data
  } catch (error) {
    console.error('Select bundle API error:', error)
    throw error
  }
}

/**
 * Fetch an existing checkout quote by quote_id. This calls the FastAPI
 * /checkout/quote/{quote_id} endpoint.
 */
export const getCheckoutQuote = async (quoteId) => {
  try {
    const response = await chatApi.get(`/checkout/quote/${quoteId}`)
    return response.data
  } catch (error) {
    console.error('Get checkout quote API error:', error)
    throw error
  }
}

/**
 * Get health status of recommendation service
 */
export const checkChatServiceHealth = async () => {
  try {
    const response = await chatApi.get('/health')
    return response.data
  } catch (error) {
    console.error('Chat service health check failed:', error)
    return null
  }
}

