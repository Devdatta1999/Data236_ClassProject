import { useState } from 'react'
import { Star, X } from 'lucide-react'

const ReviewModal = ({ isOpen, onClose, onSubmit, bookingId, listingName }) => {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleStarClick = (value) => {
    setRating(value)
  }

  const handleStarHover = (value) => {
    setHoveredRating(value)
  }

  const handleStarLeave = () => {
    setHoveredRating(0)
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      alert('Please select a rating')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ rating, review: review.trim() })
      // Reset form
      setRating(0)
      setReview('')
      setHoveredRating(0)
      onClose()
    } catch (error) {
      console.error('Error submitting review:', error)
      alert('Failed to submit review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setRating(0)
      setReview('')
      setHoveredRating(0)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Rate Your Experience</h2>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-gray-600 mb-6">{listingName}</p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rate your experience
          </label>
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((value) => {
              const isFilled = value <= (hoveredRating || rating)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleStarClick(value)}
                  onMouseEnter={() => handleStarHover(value)}
                  onMouseLeave={handleStarLeave}
                  disabled={submitting}
                  className={`focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFilled ? 'text-yellow-400' : 'text-gray-300'
                  } hover:text-yellow-400 transition-colors`}
                >
                  <Star
                    className={`w-10 h-10 ${isFilled ? 'fill-current' : ''}`}
                  />
                </button>
              )
            })}
          </div>
          {rating > 0 && (
            <p className="text-sm text-gray-600 mt-2">
              {rating} star{rating > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="review" className="block text-sm font-medium text-gray-700 mb-2">
            Write a review (optional)
          </label>
          <textarea
            id="review"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            disabled={submitting}
            rows={4}
            className="input-field w-full resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Share your experience..."
            maxLength={500}
          />
          <p className="text-xs text-gray-500 mt-1 text-right">
            {review.length}/500 characters
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReviewModal

