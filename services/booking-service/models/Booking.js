/**
 * Booking Model
 * CRITICAL: Use mongoose from shared/config/database.js to ensure same instance
 */

const { mongoose } = require('../../../shared/config/database');

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  listingId: {
    type: String,
    required: true,
    index: true
  },
  listingType: {
    type: String,
    enum: ['Flight', 'Hotel', 'Car'],
    required: true,
    index: true
  },
  bookingDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkInDate: {
    type: Date,
    default: null // For hotels and cars
  },
  checkOutDate: {
    type: Date,
    default: null // For hotels and cars
  },
  travelDate: {
    type: Date,
    default: null // For flights only
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  roomType: {
    type: String,
    enum: ['Standard', 'Suite', 'Deluxe', 'Single', 'Double', 'Presidential'],
    default: null // For hotels only
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Confirmed', 'Pending', 'Cancelled', 'Failed'],
    default: 'Pending',
    index: true
  },
  billingId: {
    type: String,
    default: null,
    index: true
  },
  checkoutId: {
    type: String,
    default: null,
    index: true
  },
  parentRequestId: {
    type: String,
    default: null
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

// Indexes
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ listingId: 1, listingType: 1 });
bookingSchema.index({ bookingDate: 1 });
bookingSchema.index({ listingId: 1, listingType: 1, roomType: 1, checkInDate: 1, checkOutDate: 1, status: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;

