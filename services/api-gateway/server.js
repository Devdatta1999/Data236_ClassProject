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

// Parse JSON and URL-encoded bodies, but skip for multipart/form-data
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    // Skip body parsing for multipart requests - they need to stream directly
    return next();
  }
  // Apply JSON parser for JSON requests
  if (contentType.includes('application/json')) {
    return express.json({ limit: '10mb' })(req, res, next);
  }
  // Apply URL-encoded parser for form-urlencoded requests
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
  }
  // For other content types or no content type, continue without parsing
  next();
});

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
  buffer: false, // Don't buffer - forward body directly
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to User Service: ${req.method} ${req.path}`, {
      contentType: req.headers['content-type']
    });
    // Only rewrite body for JSON requests (skip for multipart/form-data)
    if (req.body && typeof req.body === 'object' && !req.headers['content-type']?.includes('multipart/form-data')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
    // For multipart/form-data, the body streams automatically - don't interfere
  },
  onError: (err, req, res) => {
    logger.error('User Service proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'User service unavailable', details: err.message });
    }
  }
}));

// Listing Service Routes
app.use('/api/listings', createProxyMiddleware({
  target: LISTING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/listings': '/api/listings'
  },
  // For multipart/form-data (file uploads), stream directly without buffering
  buffer: false,
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Listing Service: ${req.method} ${req.path}`, {
      contentType: req.headers['content-type']
    });
    
    // Only rewrite body for JSON requests (skip for multipart/form-data)
    if (req.body && typeof req.body === 'object' && !req.headers['content-type']?.includes('multipart/form-data')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
    // For multipart/form-data, the body streams automatically - don't interfere
  },
  onError: (err, req, res) => {
    logger.error('Listing Service proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Listing service unavailable', details: err.message });
    }
  }
}));

// Booking Service Routes
app.use('/api/bookings', createProxyMiddleware({
  target: BOOKING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/bookings': '/api/bookings'
  },
  buffer: false,
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Booking Service: ${req.method} ${req.path}`);
    if (req.body && typeof req.body === 'object') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  }
}));

// Billing Service Routes
app.use('/api/billing', createProxyMiddleware({
  target: BILLING_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/billing': '/api/billing'
  },
  buffer: false,
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Billing Service: ${req.method} ${req.path}`, {
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      userId: req.body?.userId,
      cartItemsCount: req.body?.cartItems?.length || 0
    });
    if (req.body && typeof req.body === 'object') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  },
  onProxyError: (err, req, res) => {
    logger.error(`Proxy error for Billing Service: ${req.method} ${req.path}`, {
      error: err.message,
      stack: err.stack
    });
  }
}));

// Provider Service Routes
app.use('/api/providers', createProxyMiddleware({
  target: PROVIDER_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/providers': '/api/providers'
  },
  timeout: 60000, // 60 second timeout
  proxyTimeout: 60000,
  // CRITICAL: Don't buffer the request body, stream it directly
  buffer: false,
  // Ensure proper handling of request body
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Provider Service: ${req.method} ${req.path}`, {
      target: PROVIDER_SERVICE,
      hasBody: !!req.body,
      contentType: req.headers['content-type']
    });
    
    // Only rewrite body for JSON requests (skip for multipart/form-data)
    if (req.body && typeof req.body === 'object' && !req.headers['content-type']?.includes('multipart/form-data')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
    // For multipart/form-data, the body streams automatically - don't interfere
  },
  onError: (err, req, res) => {
    logger.error('Provider Service proxy error:', {
      message: err.message,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 3).join('\n')
    });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Provider service unavailable', details: err.message });
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info(`Provider Service responded: ${proxyRes.statusCode} for ${req.method} ${req.path}`);
  }
}));

// Admin Service Routes
app.use('/api/admin', createProxyMiddleware({
  target: ADMIN_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/admin': '/api/admin'
  },
  buffer: false,
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Admin Service: ${req.method} ${req.path}`);
    if (req.body && typeof req.body === 'object') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  }
}));

// Analytics Routes (also proxied to Admin Service)
app.use('/api/analytics', createProxyMiddleware({
  target: ADMIN_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/analytics': '/api/analytics'
  },
  buffer: false,
  onProxyReq: (proxyReq, req, res) => {
    logger.info(`Proxying to Admin Service (Analytics): ${req.method} ${req.path}`);
    if (req.body && typeof req.body === 'object') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  },
  onError: (err, req, res) => {
    logger.error('Analytics Service proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Analytics service unavailable', details: err.message });
    }
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

