/**
 * User Model for MongoDB
 * CRITICAL: Use mongoose from shared/config/database.js to ensure same instance
 */

const { mongoose } = require('../../../shared/config/database');
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
    minlength: 8,
    select: false // Don't include password in queries by default
  },
  profileImage: {
    type: String,
    default: null
  },
  savedCreditCards: [{
    cardId: {
      type: String,
      required: true,
      unique: true
    },
    cardNumber: {
      type: String,
      required: true
      // Note: Mongoose doesn't support select: false on nested array fields
      // Security is handled by: 1) Encryption before saving, 2) Masking in toSafeObject()
    },
    cardHolderName: {
      type: String,
      required: true
    },
    expiryDate: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^(0[1-9]|1[0-2])\/\d{2}$/.test(v);
        },
        message: 'Expiry date must be in MM/YY format'
      }
    },
    last4Digits: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: false, // Make optional to allow old cards without ZIP code
      validate: {
        validator: function(v) {
          // Only validate if zipCode is provided
          if (!v) return true; // Allow empty/undefined for old cards
          return /^[0-9]{5}(-[0-9]{4})?$/.test(v);
        },
        message: 'ZIP code must be in format ##### or #####-####'
      }
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
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
    bookingId: {
      type: String,
      required: false // Optional for backward compatibility with old reviews
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
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
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

// Encrypt credit card numbers before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('savedCreditCards')) {
    this.savedCreditCards.forEach((card, index) => {
      // Check if this is a new card (not already encrypted)
      const isNewCard = card.isNew || (!card.cardNumber.includes(':') && card.cardNumber && card.cardNumber.length > 4);
      
      if (isNewCard && card.cardNumber) {
        // Clean card number
        const cleanNumber = card.cardNumber.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        
        // Store last 4 digits if not already stored
        if (!card.last4Digits && cleanNumber.length >= 4) {
          this.savedCreditCards[index].last4Digits = cleanNumber.slice(-4);
        }
        
        // Encrypt card number (check if already encrypted by looking for colon separator)
        if (!cleanNumber.includes(':')) {
          this.savedCreditCards[index].cardNumber = encrypt(cleanNumber);
        }
        
        // Remove isNew flag after processing
        if (card.isNew) {
          delete this.savedCreditCards[index].isNew;
        }
      }
    });
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
  
  // Mask saved credit cards - NEVER expose encrypted card numbers from MongoDB
  // Cards in MongoDB are encrypted as hex strings (salt:iv:tag:encrypted format)
  if (user.savedCreditCards && user.savedCreditCards.length > 0) {
    user.savedCreditCards = user.savedCreditCards.map((card) => {
      // Always mask card number - detect encrypted format (contains colons)
      let maskedCardNumber = '****-****-****-****';
      
      if (card.cardNumber) {
        // If already masked, keep it
        if (card.cardNumber.startsWith('****')) {
          maskedCardNumber = card.cardNumber;
        } 
        // If encrypted (contains colons from encryption format), decrypt then mask
        else if (card.cardNumber.includes(':')) {
          try {
            const decrypted = decrypt(card.cardNumber);
            maskedCardNumber = '****-****-****-' + decrypted.slice(-4);
          } catch (e) {
            // If decryption fails, use last4Digits if available
            maskedCardNumber = card.last4Digits 
              ? '****-****-****-' + card.last4Digits 
              : '****-****-****-****';
          }
        }
        // If last4Digits available, use it
        else if (card.last4Digits) {
          maskedCardNumber = '****-****-****-' + card.last4Digits;
        }
      } else if (card.last4Digits) {
        maskedCardNumber = '****-****-****-' + card.last4Digits;
      }
      
      // Return only safe fields - NEVER expose encrypted card number
      return {
        cardId: card.cardId,
        cardHolderName: card.cardHolderName,
        expiryDate: card.expiryDate,
        last4Digits: card.last4Digits,
        zipCode: card.zipCode, // Include ZIP for payment validation
        cardNumber: maskedCardNumber, // Always masked
        addedAt: card.addedAt
      };
    });
  }
  
  return user;
};

// Method to decrypt a specific saved card (for payment)
userSchema.methods.getDecryptedCard = function(cardId) {
  const card = this.savedCreditCards.find((c) => c.cardId === cardId);
  if (!card) {
    return null;
  }
  
  const decrypted = card.toObject ? card.toObject() : { ...card };
  if (decrypted.cardNumber && !decrypted.cardNumber.startsWith('****')) {
    try {
      decrypted.cardNumber = decrypt(decrypted.cardNumber);
    } catch (e) {
      // Handle error
      return null;
    }
  }
  
  return decrypted;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

