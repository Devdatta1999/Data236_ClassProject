/**
 * Validation utilities for Aerive backend
 */

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const US_STATES_FULL = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming'
];

/**
 * Validates SSN format (XXX-XX-XXXX)
 */
function validateSSN(ssn) {
  const ssnPattern = /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/;
  if (!ssnPattern.test(ssn)) {
    throw new Error('Invalid SSN format. Must be XXX-XX-XXXX');
  }
  return true;
}

/**
 * Validates US state abbreviation or full name
 */
function validateState(state) {
  const stateUpper = state.toUpperCase();
  const stateTitle = state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
  
  if (!US_STATES.includes(stateUpper) && !US_STATES_FULL.includes(stateTitle)) {
    throw new Error(`Invalid state: ${state}. Must be a valid US state abbreviation or full name.`);
  }
  return true;
}

/**
 * Validates ZIP code format (##### or #####-####)
 */
function validateZipCode(zipCode) {
  const zipPattern = /^[0-9]{5}(-[0-9]{4})?$/;
  if (!zipPattern.test(zipCode)) {
    throw new Error('Invalid ZIP code format. Must be ##### or #####-####');
  }
  return true;
}

/**
 * Validates email format
 */
function validateEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    throw new Error('Invalid email format');
  }
  return true;
}

/**
 * Validates phone number (basic US format)
 */
function validatePhoneNumber(phone) {
  const phonePattern = /^[\d\s\-\(\)\+]{10,}$/;
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new Error('Invalid phone number format');
  }
  return true;
}

/**
 * Validates credit card number (Luhn algorithm)
 */
function validateCreditCard(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    throw new Error('Invalid credit card number length');
  }
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  if (sum % 10 !== 0) {
    throw new Error('Invalid credit card number (failed Luhn check)');
  }
  
  return true;
}

/**
 * Validates date format and ensures it's in the future
 */
function validateFutureDate(date) {
  const inputDate = new Date(date);
  const now = new Date();
  
  if (isNaN(inputDate.getTime())) {
    throw new Error('Invalid date format');
  }
  
  if (inputDate <= now) {
    throw new Error('Date must be in the future');
  }
  
  return true;
}

/**
 * Validates date range (check-in must be before check-out)
 */
function validateDateRange(checkIn, checkOut) {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  
  if (checkInDate >= checkOutDate) {
    throw new Error('Check-in date must be before check-out date');
  }
  
  return true;
}

module.exports = {
  validateSSN,
  validateState,
  validateZipCode,
  validateEmail,
  validatePhoneNumber,
  validateCreditCard,
  validateFutureDate,
  validateDateRange,
  US_STATES,
  US_STATES_FULL
};

