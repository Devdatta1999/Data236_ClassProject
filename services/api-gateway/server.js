/**
 * API Gateway Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { authenticate, requireAdmin, requireProvider } = require('../../shared/middleware/auth');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const LISTING_SERVICE = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';
const BOOKING_SERVICE = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';
const BILLING_SERVICE = process.env.BILLING_SERVICE_URL || 'http://localhost:3004';
const PROVIDER_SERVICE = process.env.PROVIDER_SERVICE_URL || 'http://localhost:3005';
const ADMIN_SERVICE = process.env.ADMIN_SERVICE_URL || 'http://localhost:3006';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'api-gateway',
    timestamp: new Date().toISOString()
  });
});

// User Service Routes
app.use('/api/users', createProxyMiddleware({
  target: USER_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': '/api/users'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to User Service: ${req.method} ${req.path}`);
  },
  onError: (err, req, res) => {
    logger.error('User Service proxy error:', err);
    res.status(500).json({ error: 'User service unavailable' });
  }
}));

// Listing Service Routes
app.use('/api/listings', createProxyMiddleware({
  target: LISTING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/listings': '/api/listings'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Listing Service: ${req.method} ${req.path}`);
  }
}));

// Booking Service Routes
app.use('/api/bookings', createProxyMiddleware({
  target: BOOKING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/bookings': '/api/bookings'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Booking Service: ${req.method} ${req.path}`);
  }
}));

// Billing Service Routes
app.use('/api/billing', createProxyMiddleware({
  target: BILLING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/billing': '/api/billing'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Billing Service: ${req.method} ${req.path}`);
  }
}));

// Provider Service Routes
app.use('/api/providers', createProxyMiddleware({
  target: PROVIDER_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/providers': '/api/providers'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Provider Service: ${req.method} ${req.path}`);
  }
}));

// Admin Service Routes
app.use('/api/admin', createProxyMiddleware({
  target: ADMIN_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/admin': '/api/admin'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Admin Service: ${req.method} ${req.path}`);
  }
}));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Service endpoints:');
  logger.info(`  User Service: ${USER_SERVICE}`);
  logger.info(`  Listing Service: ${LISTING_SERVICE}`);
  logger.info(`  Booking Service: ${BOOKING_SERVICE}`);
  logger.info(`  Billing Service: ${BILLING_SERVICE}`);
  logger.info(`  Provider Service: ${PROVIDER_SERVICE}`);
  logger.info(`  Admin Service: ${ADMIN_SERVICE}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

