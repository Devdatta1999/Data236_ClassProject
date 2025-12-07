import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { differenceInDays } from 'date-fns'
import { X, Send, Bot, User, Loader2 } from 'lucide-react'
import { closeChat, addMessage, setLoading, setError, setBundles } from '../../store/slices/chatSlice'
import { addToCart, clearCart } from '../../store/slices/cartSlice'
import { sendChatMessage, selectBundle } from '../../services/chatService'
import api from '../../services/apiService'

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

  const fetchListingDetails = async (type, externalId) => {
    if (!externalId) {
      throw new Error('Missing listing reference for this bundle item.')
    }
    const endpoint =
      type === 'flight'
        ? `/api/listings/flights/${encodeURIComponent(externalId)}`
        : `/api/listings/hotels/${encodeURIComponent(externalId)}`
    const response = await api.get(endpoint)
    const data = type === 'flight' ? response.data.data?.flight : response.data.data?.hotel
    if (!data) {
      throw new Error(`Unable to load ${type} details for ${externalId}.`)
    }
    return data
  }

  const addQuoteItemsToCart = async (quote) => {
    if (!quote) {
      throw new Error('Missing quote data from the concierge service.')
    }

    // Prefer trip dates from the concierge quote (these reflect the user's
    // actual requested dates) and fall back to the hotel/flight dates only if
    // they are missing. Using the quote dates avoids sending an extremely long
    // stay (e.g., full availability window) to the booking service.
    const departureDateStr = quote.travel_dates?.departure_date || null
    const returnDateStr = quote.travel_dates?.return_date || null

    const cartItems = []

    const flightPromises = (quote.flights || []).map(async (flight) => {
      const externalId = flight.external_id || flight.externalId || flight.id
      const listing = await fetchListingDetails('flight', externalId)
      const listingId = listing?.flightId || externalId
      const travelers = Math.max(quote.travelers || 1, 1)
      // flight.price_usd is per-person price from the API
      const pricePerPerson = Number(flight.price_usd || 0)
      const totalFlightPrice = pricePerPerson * travelers
      const seatType = listing?.seatTypes?.[0]?.type || 'Economy'

      cartItems.push({
        listingId,
        listingType: 'Flight',
        listingName: listing?.flightId
          ? `${listing.flightId} - ${listing.departureAirport} to ${listing.arrivalAirport}`
          : `${flight.origin} → ${flight.destination}`,
        listing,
        roomType: seatType,
        quantity: travelers,
        price: pricePerPerson,
        totalPrice: totalFlightPrice,
        travelDate: flight.departure_date,
        returnDate: flight.return_date,
        image: listing?.image || null,
        address: `${flight.origin} → ${flight.destination}`,
      })
    })

    const hotelPromises = (quote.hotels || []).map(async (hotel) => {
      const externalId = hotel.external_id || hotel.externalId || hotel.id
      const listing = await fetchListingDetails('hotel', externalId)
      const listingId = listing?.hotelId || externalId
      // Use trip dates from the quote when available, otherwise fall back to
      // the hotel deal's own dates.
      const checkIn = departureDateStr ? new Date(departureDateStr) : new Date(hotel.check_in_date)
      const checkOut = returnDateStr ? new Date(returnDateStr) : new Date(hotel.check_out_date)
      const nights = Math.max(differenceInDays(checkOut, checkIn), 1)
      const totalHotelPrice = Number(hotel.total_price_usd || 0)
      const nightlyRaw = nights > 0 ? totalHotelPrice / nights : totalHotelPrice
      const pricePerNight = Number(Number.isFinite(nightlyRaw) ? nightlyRaw.toFixed(2) : 0)
      // Default to 1 room to match the bundle pricing shown to user
      // Users can manually adjust quantity in cart if they need more rooms
      const quantity = 1
      const roomType = listing?.roomTypes?.[0]?.type || 'Standard'

      cartItems.push({
        listingId,
        listingType: 'Hotel',
        listingName: listing?.hotelName || hotel.hotel_name,
        listing,
        roomType,
        quantity,
        pricePerNight: pricePerNight || Number(hotel.price_per_night_usd || 0),
        totalPrice: totalHotelPrice,
        checkInDate: checkIn.toISOString(),
        checkOutDate: checkOut.toISOString(),
        numberOfNights: nights,
        image: listing?.images?.[0] || null,
        address: listing
          ? [listing.address, listing.city, listing.state].filter(Boolean).join(', ')
          : hotel.city,
      })
    })

    await Promise.all([...flightPromises, ...hotelPromises])

    if (cartItems.length === 0) {
      throw new Error('This bundle did not include any bookable flights or hotels.')
    }

    dispatch(clearCart())
    cartItems.forEach((item) => dispatch(addToCart(item)))
  }

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
        await addQuoteItemsToCart(response.quote)
        dispatch(closeChat())
        navigate('/checkout', { state: { fromAIConcierge: true } })
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
          content:
            error?.message ||
            'Sorry, there was an error selecting that package. Please try again.',
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

                      {/* Flight Details */}
                      {bundle.flights && bundle.flights.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Flight Details:</p>
                          {bundle.flights.map((flight, idx) => {
                            const travelers = bundle.travelers || 1;
                            const pricePerPerson = parseFloat(flight.price_usd);
                            const totalFlightPrice = pricePerPerson * travelers;
                            return (
                              <div key={idx} className="bg-blue-50 rounded-lg p-3 mb-2 text-xs">
                                <div className="flex justify-between items-start mb-1">
                                  <div>
                                    <p className="font-semibold text-gray-900">{flight.airline}</p>
                                    <p className="text-gray-600">
                                      {flight.origin} → {flight.destination}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-primary-600">
                                      ${pricePerPerson.toFixed(2)}/person
                                    </p>
                                    {travelers > 1 && (
                                      <p className="text-gray-500 text-xs">
                                        Total: ${totalFlightPrice.toFixed(2)} ({travelers} travelers)
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-3 mt-2 text-gray-600">
                                  {flight.departure_date && (
                                    <span>Departure: {new Date(flight.departure_date).toLocaleDateString()}</span>
                                  )}
                                  {flight.duration_minutes && (
                                    <span>Duration: {Math.floor(flight.duration_minutes / 60)}h {flight.duration_minutes % 60}m</span>
                                  )}
                                  {flight.stops !== undefined && (
                                    <span>{flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hotel Details */}
                      {bundle.hotels && bundle.hotels.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Hotel Details:</p>
                          {bundle.hotels.map((hotel, idx) => {
                            const pricePerNight = parseFloat(hotel.price_per_night_usd);
                            const totalPrice = parseFloat(hotel.total_price_usd);
                            const nights = pricePerNight > 0 ? Math.round(totalPrice / pricePerNight) : 0;
                            return (
                              <div key={idx} className="bg-green-50 rounded-lg p-3 mb-2 text-xs">
                                <div className="flex justify-between items-start mb-1">
                                  <div>
                                    <p className="font-semibold text-gray-900">{hotel.hotel_name}</p>
                                    <p className="text-gray-600">{hotel.city}</p>
                                    {hotel.star_rating && (
                                      <p className="text-yellow-600 mt-1">
                                        {'★'.repeat(hotel.star_rating)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-primary-600">
                                      ${pricePerNight.toFixed(2)}/night
                                    </p>
                                    <p className="text-gray-500 text-xs">
                                      Total: ${totalPrice.toFixed(2)} ({nights} night{nights !== 1 ? 's' : ''})
                                    </p>
                                  </div>
                                </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {hotel.breakfast_included && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                    Breakfast
                                  </span>
                                )}
                                {hotel.is_refundable && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    Refundable
                                  </span>
                                )}
                                {hotel.pet_friendly && (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                    Pet-Friendly
                                  </span>
                                )}
                                {hotel.near_transit && (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                                    Near Transit
                                  </span>
                                )}
                              </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center space-x-4 text-xs text-gray-500 mt-3">
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

