/**
 * Upload Controller - Handles profile picture uploads for providers
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../../../shared/utils/errors');
const logger = require('../../../shared/utils/logger');
const Provider = require('../models/Provider');
const axios = require('axios');

const LISTING_SERVICE_URL = process.env.LISTING_SERVICE_URL || 'http://localhost:3002';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/profile-pictures');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    name = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `provider-${uniqueSuffix}${ext}`);
  }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

/**
 * Sync provider profile image to all their listings
 */
async function syncProviderImageToListings(providerId, imageUrl, authToken) {
  try {
    // Get all listings for this provider
    const [flightsResponse, carsResponse] = await Promise.all([
      axios.get(`${LISTING_SERVICE_URL}/api/listings/flights/by-provider`, {
        params: { providerId },
        headers: { 'Authorization': authToken }
      }).catch(() => ({ data: { data: { flights: [] } } })),
      axios.get(`${LISTING_SERVICE_URL}/api/listings/cars/by-provider`, {
        params: { providerId },
        headers: { 'Authorization': authToken }
      }).catch(() => ({ data: { data: { cars: [] } } }))
    ]);

    const flights = flightsResponse.data?.data?.flights || [];
    const cars = carsResponse.data?.data?.cars || [];

    // Update all flights
    await Promise.all(
      flights.map(flight =>
        axios.put(
          `${LISTING_SERVICE_URL}/api/listings/flights/${flight.flightId}`,
          { image: imageUrl },
          { headers: { 'Authorization': authToken } }
        ).catch(err => {
          logger.warn(`Failed to update image for flight ${flight.flightId}: ${err.message}`);
        })
      )
    );

    // Update all cars
    await Promise.all(
      cars.map(car =>
        axios.put(
          `${LISTING_SERVICE_URL}/api/listings/cars/${car.carId}`,
          { image: imageUrl },
          { headers: { 'Authorization': authToken } }
        ).catch(err => {
          logger.warn(`Failed to update image for car ${car.carId}: ${err.message}`);
        })
      )
    );

    logger.info(`Synced profile image to ${flights.length} flights and ${cars.length} cars for provider ${providerId}`);
  } catch (error) {
    logger.error(`Error syncing provider image to listings: ${error.message}`);
    // Don't throw - this is a background sync operation
  }
}

/**
 * Upload profile picture
 */
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILE',
        message: 'No image file provided'
      }
    });
  }

  const providerId = req.user?.providerId;
  if (!providerId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Provider not authenticated'
      }
    });
  }

  const imageUrl = `/api/providers/profile-pictures/${req.file.filename}`;

  // Update provider's profile image
  const provider = await Provider.findOne({ providerId });
  if (provider) {
    const imageChanged = provider.profileImage !== imageUrl;
    provider.profileImage = imageUrl;
    await provider.save();

    // If image changed, sync to all listings in background
    if (imageChanged) {
      const authToken = req.headers.authorization || req.headers.Authorization;
      syncProviderImageToListings(providerId, imageUrl, authToken).catch(err => {
        logger.error(`Background sync of profile image failed: ${err.message}`);
      });
    }
  }

  logger.info(`Provider profile picture uploaded: ${req.file.filename} for provider ${providerId}`);

  res.json({
    success: true,
    data: {
      imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    }
  });
});

/**
 * Error handler for multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds 5MB limit'
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message
      }
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message || 'File upload failed'
      }
    });
  }
  
  next();
};

module.exports = {
  upload,
  uploadProfilePicture,
  handleUploadError
};

