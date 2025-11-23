/**
 * Provider Model
 */

const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  providerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  providerName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String
  },
  listings: [{
    listingId: {
      type: String,
      required: true
    },
    listingType: {
      type: String,
      enum: ['Flight', 'Hotel', 'Car'],
      required: true
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Pending'],
      default: 'Pending'
    }
  }],
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

const Provider = mongoose.model('Provider', providerSchema);

module.exports = Provider;

