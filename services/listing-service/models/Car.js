/**
 * Car Model
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

const carSchema = new mongoose.Schema({
  carId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  carType: {
    type: String,
    enum: ['SUV', 'Sedan', 'Compact', 'Luxury', 'Convertible', 'Truck', 'Van'],
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
  model: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true,
    min: 1900,
    max: new Date().getFullYear() + 1
  },
  transmissionType: {
    type: String,
    enum: ['Automatic', 'Manual'],
    required: true
  },
  numberOfSeats: {
    type: Number,
    required: true,
    min: 2,
    max: 15
  },
  dailyRentalPrice: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  carRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [reviewSchema],
  availabilityStatus: {
    type: String,
    enum: ['Available', 'Booked', 'Maintenance'],
    default: 'Available',
    index: true
  },
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
carSchema.index({ carType: 1, dailyRentalPrice: 1 });
carSchema.index({ status: 1, availabilityStatus: 1 });

// Method to update rating
carSchema.methods.updateRating = function() {
  if (this.reviews.length === 0) {
    this.carRating = 0;
    return;
  }
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  this.carRating = (sum / this.reviews.length).toFixed(2);
};

const Car = mongoose.model('Car', carSchema);

module.exports = Car;

