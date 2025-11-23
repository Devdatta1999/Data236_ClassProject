/**
 * JWT Authentication middleware
 */

const jwt = require('jsonwebtoken');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
}

/**
 * Middleware to authenticate user requests
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to check if user is admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AuthorizationError('Admin access required'));
  }
  next();
}

/**
 * Middleware to check if user is provider
 */
function requireProvider(req, res, next) {
  if (!req.user || (req.user.role !== 'provider' && req.user.role !== 'admin')) {
    return next(new AuthorizationError('Provider access required'));
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  requireAdmin,
  requireProvider
};

