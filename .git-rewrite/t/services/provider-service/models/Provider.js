/**
 * Provider Model
 * Fix #3: CRITICAL - Use mongoose from shared/config/database.js to ensure same instance
 * DO NOT require('mongoose') directly - use the one that was connected
 */

// Import mongoose from the database module to ensure we use the SAME instance that was connected
const { mongoose } = require('../../../shared/config/database');
const bcrypt = require('bcrypt');

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
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Don't include password in queries by default
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
  profileImage: {
    type: String,
    default: null
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

// Hash password before saving
providerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
providerSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to return safe object without password
providerSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const Provider = mongoose.model('Provider', providerSchema);

module.exports = Provider;

