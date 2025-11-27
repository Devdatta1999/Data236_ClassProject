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

const seatTypeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Economy', 'Business', 'First'],
    required: true
  },
  ticketPrice: {
    type: Number,
    required: true,
    min: 0
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
  // Time-only fields (e.g., "14:30", "16:45")
  departureTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Validate time format HH:MM
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Departure time must be in HH:MM format (e.g., 14:30)'
    }
  },
  arrivalTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Validate time format HH:MM
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Arrival time must be in HH:MM format (e.g., 16:45)'
    }
  },
  // Days of the week the flight operates (e.g., ["Monday", "Wednesday", "Friday"])
  operatingDays: {
    type: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one operating day must be specified'
    }
  },
  duration: {
    type: Number,
    required: true // in minutes
  },
  // Date range for when this flight is available
  availableFrom: {
    type: Date,
    required: true,
    index: true
  },
  availableTo: {
    type: Date,
    required: true,
    index: true
  },
  // Legacy fields for backward compatibility (deprecated)
  departureDateTime: {
    type: Date,
    default: null,
    index: true
  },
  arrivalDateTime: {
    type: Date,
    default: null
  },
  // Multiple seat types with prices and availability (like hotel room types)
  seatTypes: [seatTypeSchema],
  // Legacy fields for backward compatibility (deprecated, use seatTypes instead)
  flightClass: {
    type: String,
    enum: ['Economy', 'Business', 'First'],
    default: null
  },
  ticketPrice: {
    type: Number,
    default: null,
    min: 0
  },
  totalSeats: {
    type: Number,
    default: null,
    min: 1
  },
  availableSeats: {
    type: Number,
    default: null,
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
flightSchema.index({ departureAirport: 1, arrivalAirport: 1, status: 1 });
flightSchema.index({ status: 1, availableFrom: 1, availableTo: 1 });
flightSchema.index({ operatingDays: 1, status: 1 });
flightSchema.index({ departureAirport: 1, arrivalAirport: 1, operatingDays: 1, status: 1 });

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

