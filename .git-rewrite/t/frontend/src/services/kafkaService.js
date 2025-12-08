/**
 * Kafka Service - Frontend
 * 
 * Uses HTTP to communicate with Kafka Proxy Service
 * The proxy handles actual Kafka communication
 */

const KAFKA_PROXY_URL = import.meta.env.VITE_KAFKA_PROXY_URL || 'http://localhost:3007'

/**
 * Send event to Kafka via proxy and wait for response
 * Enhanced with retry logic and better error handling
 * @param {string} topic - Kafka topic to publish to
 * @param {object} event - Event data to send
 * @param {string} responseTopic - Topic to listen for response
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise} Response data
 */
export const sendEventAndWait = async (topic, event, responseTopic, timeout = 30000, maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout + 5000); // Add 5s buffer for network
      
      const response = await fetch(`${KAFKA_PROXY_URL}/api/kafka/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          topic,
          event,
          responseTopic,
          timeout,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        
        // If it's a 503 (service unavailable), retry
        if (response.status === 503 && attempt < maxRetries) {
          console.warn(`Kafka proxy service unavailable (attempt ${attempt}/${maxRetries}), retrying...`);
          lastError = new Error(errorData.error || `Service unavailable: ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
          continue;
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      lastError = error;
      
      // Don't retry on abort (timeout)
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout + 5000}ms`);
      }
      
      // Retry on network errors or 503s
      if (attempt < maxRetries && (
        error.message?.includes('network') || 
        error.message?.includes('unavailable') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ECONNREFUSED')
      )) {
        console.warn(`Kafka proxy request failed (attempt ${attempt}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        continue;
      }
      
      // Last attempt or non-retryable error
      if (attempt === maxRetries) {
        console.error(`Error sending Kafka event via proxy after ${maxRetries} attempts:`, error);
        throw error;
      }
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error('Unknown error sending Kafka event');
}

/**
 * Send event to Kafka via proxy without waiting for response
 * Enhanced with retry logic
 * @param {string} topic - Kafka topic to publish to
 * @param {object} event - Event data to send
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise} Request ID
 */
export const sendKafkaEvent = async (topic, event, maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        
        // Retry on 503 (service unavailable)
        if (response.status === 503 && attempt < maxRetries) {
          console.warn(`Kafka proxy service unavailable (attempt ${attempt}/${maxRetries}), retrying...`);
          lastError = new Error(errorData.error || `Service unavailable: ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
          continue;
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.requestId;
    } catch (error) {
      lastError = error;
      
      // Retry on network errors or 503s
      if (attempt < maxRetries && (
        error.message?.includes('network') || 
        error.message?.includes('unavailable') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ECONNREFUSED')
      )) {
        console.warn(`Kafka proxy request failed (attempt ${attempt}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        continue;
      }
      
      // Last attempt or non-retryable error
      if (attempt === maxRetries) {
        console.error(`Error sending Kafka event via proxy after ${maxRetries} attempts:`, error);
        throw error;
      }
    }
  }
  
  throw lastError || new Error('Unknown error sending Kafka event');
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
