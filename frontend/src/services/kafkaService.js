/**
 * Kafka Service - Frontend
 * 
 * Uses HTTP to communicate with Kafka Proxy Service
 * The proxy handles actual Kafka communication
 */

const KAFKA_PROXY_URL = import.meta.env.VITE_KAFKA_PROXY_URL || 'http://localhost:3007'

/**
 * Send event to Kafka via proxy and wait for response
 * @param {string} topic - Kafka topic to publish to
 * @param {object} event - Event data to send
 * @param {string} responseTopic - Topic to listen for response
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Response data
 */
export const sendEventAndWait = async (topic, event, responseTopic, timeout = 30000) => {
  try {
    const response = await fetch(`${KAFKA_PROXY_URL}/api/kafka/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        event,
        responseTopic,
        timeout,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error sending Kafka event via proxy:', error)
    throw error
  }
}

/**
 * Send event to Kafka via proxy without waiting for response
 * @param {string} topic - Kafka topic to publish to
 * @param {object} event - Event data to send
 * @returns {Promise} Request ID
 */
export const sendKafkaEvent = async (topic, event) => {
  try {
    const response = await fetch(`${KAFKA_PROXY_URL}/api/kafka/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        event,
        // No responseTopic means fire-and-forget
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.requestId
  } catch (error) {
    console.error('Error sending Kafka event via proxy:', error)
    throw error
  }
}

// Legacy functions for compatibility (no-op since we don't need to initialize/disconnect)
export const initProducer = async () => {
  // No-op - proxy handles connection
  return Promise.resolve()
}

export const disconnectKafka = async () => {
  // No-op - proxy handles disconnection
  return Promise.resolve()
}
