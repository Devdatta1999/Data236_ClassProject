/**
 * Upload Controller - Handles image uploads
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../../../shared/utils/errors');
const logger = require('../../../shared/utils/logger');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/images');
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
    // Replace spaces and special characters to avoid URL encoding issues
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    // Replace spaces with underscores and remove special characters that could cause issues
    name = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
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
 * Upload single image
 */
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILE',
        message: 'No image file provided'
      }
    });
  }

  // Return the file path relative to the service root
  // The image will be served at /api/listings/images/:filename
  const imageUrl = `/api/listings/images/${req.file.filename}`;

  logger.info(`Image uploaded: ${req.file.filename}`);

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
 * Upload multiple images
 */
const uploadImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILES',
        message: 'No image files provided'
      }
    });
  }

  const uploadedImages = req.files.map(file => ({
    imageUrl: `/api/listings/images/${file.filename}`,
    filename: file.filename,
    originalName: file.originalname,
    size: file.size
  }));

  logger.info(`Uploaded ${uploadedImages.length} images`);

  res.json({
    success: true,
    data: {
      images: uploadedImages
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
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Too many files. Maximum 10 files allowed'
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
  uploadImage,
  uploadImages,
  handleUploadError
};

