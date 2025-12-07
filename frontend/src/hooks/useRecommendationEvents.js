import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addNotification, removeNotification } from '../store/slices/notificationSlice'

// Custom hook to connect to the recommendation-service WebSocket and dispatch
// notifications for deal updates (e.g., simulated price drops) and watch events.
const useRecommendationEvents = () => {
  const dispatch = useDispatch()
  const { sessionId } = useSelector((state) => state.chat)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return

    const wsUrl =
      (import.meta.env.VITE_RECOMMENDATION_WS_URL || 'ws://localhost:8000/events') +
      `?session_id=${encodeURIComponent(sessionId)}`

    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'deal_update' && data.data?.reason === 'simulated_price_drop') {
          const oldPrice = Number(data.data.old_total_price_usd || 0)
          const newPrice = Number(data.data.new_total_price_usd || 0)
          const bundleId = data.data.bundle_id
          const message =
            newPrice && oldPrice
              ? `Good news! Your selected package dropped from $${oldPrice.toFixed(
                  2
                )} to $${newPrice.toFixed(2)}. Book now?`
              : 'Good news! Your selected package price just dropped. Book now?'

          const id = `price_drop_${Date.now()}`
          dispatch(
            addNotification({
              id,
              type: 'success',
              message,
              actionLabel: 'Book now',
              actionPath: '/checkout',
              // Store bundle_id and session_id for refreshing the quote with new price
              metadata: {
                bundleId,
                sessionId,
                shouldRefreshQuote: true
              }
            })
          )
        } else if (data.type === 'watch_triggered') {
          const id = `watch_${Date.now()}`
          dispatch(
            addNotification({
              id,
              type: 'info',
              message: 'A price or inventory watch you set has been triggered.',
            })
          )
        }
      } catch (err) {
        // Ignore malformed messages
        console.error('WebSocket message parse error:', err)
      }
    }

    socket.onerror = (err) => {
      console.error('Recommendation WebSocket error:', err)
    }

    socket.onclose = () => {
      socketRef.current = null
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [sessionId, dispatch])
}

export default useRecommendationEvents


