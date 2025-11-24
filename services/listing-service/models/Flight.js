/**
 * Flight Model
 * CRITICAL: Use mongoose from shared/config/database.js to ensure same instance
 */

const { mongoose } = require('../../../shared/config/database');

const reviewSchema = new mongoose.Schema({
  reviewId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comment: {
    type: String,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const flightSchema = new mongoose.Schema({
  flightId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true
  },
  providerId: {
    type: String,
    required: true,
    index: true
  },
  providerName: {
    type: String,
    required: true
  },
  departureAirport: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  arrivalAirport: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  departureDateTime: {
    type: Date,
    required: true,
    index: true
  },
  arrivalDateTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true // in minutes
  },
  flightClass: {
    type: String,
    enum: ['Economy', 'Business', 'First'],
    required: true,
    index: true
  },
  ticketPrice: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 1
  },
  availableSeats: {
    type: Number,
    required: true,
    min: 0
  },
  flightRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [reviewSchema],
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending'],
    default: 'Pending',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for search optimization
flightSchema.index({ departureAirport: 1, arrivalAirport: 1, departureDateTime: 1 });
flightSchema.index({ ticketPrice: 1, flightClass: 1 });
flightSchema.index({ status: 1, departureDateTime: 1 });

// Method to update rating when review is added
flightSchema.methods.updateRating = function() {
  if (this.reviews.length === 0) {
    this.flightRating = 0;
    return;
  }
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  this.flightRating = (sum / this.reviews.length).toFixed(2);
};

const Flight = mongoose.model('Flight', flightSchema);

module.exports = Flight;

