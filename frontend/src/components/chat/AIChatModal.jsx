import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { X, Send, Bot, User, Loader2 } from 'lucide-react'
import { closeChat, addMessage, setLoading, setError, setBundles } from '../../store/slices/chatSlice'
import { sendChatMessage, selectBundle } from '../../services/chatService'

const AIChatModal = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isOpen, sessionId, messages, isLoading, bundles } = useSelector((state) => state.chat)
  const [inputMessage, setInputMessage] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    const userMessage = inputMessage.trim()
    setInputMessage('')

    // Add user message
    dispatch(
      addMessage({
        role: 'user',
        content: userMessage,
      })
    )

    // Set loading state
    dispatch(setLoading(true))

    try {
      // Send to API
      const response = await sendChatMessage(sessionId, userMessage)

      // Add assistant message
      dispatch(
        addMessage({
          role: 'assistant',
          content: response.message || 'I found some options for you!',
        })
      )

      // Update bundles if available
      if (response.bundles && response.bundles.length > 0) {
        dispatch(setBundles(response.bundles))
      }
    } catch (error) {
      console.error('Chat error:', error)
      dispatch(
        addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        })
      )
    } finally {
      dispatch(setLoading(false))
    }
  }

  if (!isOpen) return null

  const handleSelectBundle = async (bundleId) => {
    if (!sessionId || !bundleId || isLoading) return
    dispatch(setLoading(true))
    try {
      const response = await selectBundle(sessionId, bundleId)
      if (response.success && response.quote) {
        // Navigate to AI quote page using quote_id
        navigate(`/ai/quote/${response.quote.quote_id}`)
        // Close chat so the quote page is visible immediately
        dispatch(closeChat())
      } else {
        dispatch(
          addMessage({
            role: 'assistant',
            content: response.message || 'Unable to select this bundle. Please try another one.',
          })
        )
      }
    } catch (error) {
      console.error('Select bundle error:', error)
      dispatch(
        addMessage({
          role: 'assistant',
          content: 'Sorry, there was an error selecting that package. Please try again.',
        })
      )
    } finally {
      dispatch(setLoading(false))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[800px] bg-white rounded-2xl shadow-2xl flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">AI Travel Concierge</h2>
              <p className="text-sm text-white/90">Ask me anything about your travel plans</p>
            </div>
          </div>
          <button
            onClick={() => dispatch(closeChat())}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Close chat"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-primary-100 rounded-full mb-4">
                <Bot className="w-12 h-12 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to AI Travel Concierge!</h3>
              <p className="text-gray-600 max-w-md">
                I can help you find the perfect trip. Try asking me something like:
              </p>
              <div className="mt-4 space-y-2 text-left max-w-md">
                <p className="text-sm text-gray-500">
                  • "I need a trip from SFO to Los Angeles on October 25-27, budget $800 for 2 people"
                </p>
                <p className="text-sm text-gray-500">
                  • "Find me a pet-friendly hotel in Miami"
                </p>
                <p className="text-sm text-gray-500">
                  • "What are the best deals for a weekend getaway?"
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex items-start space-x-3 max-w-[80%] ${
                      message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-primary-100 text-primary-600'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <User className="w-5 h-5" />
                      ) : (
                        <Bot className="w-5 h-5" />
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Thinking Indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-3 max-w-[80%]">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                        <span className="text-sm text-gray-600">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bundles Display */}
              {bundles.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Recommended Bundles</h3>
                  {bundles.map((bundle, index) => (
                    <div
                      key={bundle.id || index}
                      className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                        <h4 className="font-semibold text-gray-900">{bundle.bundle_name}</h4>
                          {bundle.fit_score != null && (
                            <p className="text-xs text-primary-600 mt-1">
                              Fit Score: {bundle.fit_score.toFixed(1)}%
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-primary-600 block">
                          ${parseFloat(bundle.total_price_usd).toFixed(2)}
                        </span>
                          <button
                            type="button"
                            onClick={() => handleSelectBundle(bundle.id)}
                            className="mt-2 px-3 py-1 text-xs font-semibold rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                          >
                            Select
                          </button>
                        </div>
                      </div>
                      {bundle.explanation && (
                        <p className="text-sm text-gray-600 mb-2">{bundle.explanation}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        {bundle.flights && bundle.flights.length > 0 && (
                          <span>{bundle.flights.length} Flight{bundle.flights.length > 1 ? 's' : ''}</span>
                        )}
                        {bundle.hotels && bundle.hotels.length > 0 && (
                          <span>{bundle.hotels.length} Hotel{bundle.hotels.length > 1 ? 's' : ''}</span>
                        )}
                        {bundle.fit_score && (
                          <span className="text-primary-600">Fit Score: {bundle.fit_score.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-gray-200 bg-white rounded-b-2xl">
          <form onSubmit={handleSend} className="flex items-center space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask me about your travel plans..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AIChatModal

