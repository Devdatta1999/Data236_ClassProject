/**
 * Hotel Model
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

const roomTypeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Standard', 'Suite', 'Deluxe', 'Single', 'Double', 'Presidential'],
    required: true
  },
  pricePerNight: {
    type: Number,
    required: true,
    min: 0
  },
  availableCount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const hotelSchema = new mongoose.Schema({
  hotelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  hotelName: {
    type: String,
    required: true,
    index: true
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
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true,
    index: true
  },
  state: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  zipCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: 'USA',
    required: true
  },
  starRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
    index: true
  },
  availableFrom: {
    type: Date,
    required: true
  },
  availableTo: {
    type: Date,
    required: true
  },
  totalRooms: {
    type: Number,
    required: true,
    min: 1
  },
  availableRooms: {
    type: Number,
    required: true,
    min: 0
  },
  roomTypes: [roomTypeSchema],
  amenities: [{
    type: String
  }],
  hotelRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [reviewSchema],
  images: [{
    type: String
  }],
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
hotelSchema.index({ city: 1, state: 1, starRating: 1 });
hotelSchema.index({ status: 1, city: 1 });
hotelSchema.index({ availableFrom: 1, availableTo: 1 });
hotelSchema.index({ status: 1, city: 1, state: 1 });

// Method to update rating
hotelSchema.methods.updateRating = function() {
  if (this.reviews.length === 0) {
    this.hotelRating = 0;
    return;
  }
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  this.hotelRating = (sum / this.reviews.length).toFixed(2);
};

const Hotel = mongoose.model('Hotel', hotelSchema);

module.exports = Hotel;

