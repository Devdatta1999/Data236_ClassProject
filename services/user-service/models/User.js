/**
 * User Model for MongoDB
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { encrypt, decrypt } = require('../../../shared/utils/encryption');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/.test(v);
      },
      message: 'User ID must be in SSN format (XXX-XX-XXXX)'
    }
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  zipCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{5}(-[0-9]{4})?$/.test(v);
      },
      message: 'ZIP code must be in format ##### or #####-####'
    }
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  profileImage: {
    type: String,
    default: null
  },
  paymentDetails: {
    cardNumber: {
      type: String,
      default: null
    },
    cardHolderName: {
      type: String,
      default: null
    },
    expiryDate: {
      type: String,
      default: null
    },
    cvv: {
      type: String,
      default: null
    },
    billingAddress: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  bookingHistory: [{
    bookingId: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['Flight', 'Hotel', 'Car'],
      required: true
    },
    status: {
      type: String,
      enum: ['Past', 'Current', 'Future'],
      required: true
    },
    bookingDate: {
      type: Date,
      required: true
    }
  }],
  reviews: [{
    reviewId: {
      type: String,
      required: true
    },
    listingId: {
      type: String,
      required: true
    },
    listingType: {
      type: String,
      enum: ['Flight', 'Hotel', 'Car'],
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
userSchema.pre('save', async function(next) {
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

// Encrypt payment details before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('paymentDetails')) {
    if (this.paymentDetails.cardNumber) {
      this.paymentDetails.cardNumber = encrypt(this.paymentDetails.cardNumber);
    }
    if (this.paymentDetails.cvv) {
      this.paymentDetails.cvv = encrypt(this.paymentDetails.cvv);
    }
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get user without sensitive data
userSchema.methods.toSafeObject = function() {
  const user = this.toObject();
  delete user.password;
  if (user.paymentDetails) {
    if (user.paymentDetails.cardNumber) {
      user.paymentDetails.cardNumber = '****-****-****-' + decrypt(user.paymentDetails.cardNumber).slice(-4);
    }
    if (user.paymentDetails.cvv) {
      delete user.paymentDetails.cvv;
    }
  }
  return user;
};

// Method to decrypt payment details when needed
userSchema.methods.getPaymentDetails = function() {
  const details = { ...this.paymentDetails.toObject() };
  if (details.cardNumber) {
    details.cardNumber = decrypt(details.cardNumber);
  }
  if (details.cvv) {
    details.cvv = decrypt(details.cvv);
  }
  return details;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

