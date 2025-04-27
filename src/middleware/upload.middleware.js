const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ApiError } = require('../utils/error-handler');

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create subdirectories
const facesDir = path.join(uploadDir, 'faces');
const documentsDir = path.join(uploadDir, 'documents');

if (!fs.existsSync(facesDir)) {
  fs.mkdirSync(facesDir, { recursive: true });
}

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination directory based on file type
    let destinationDir = uploadDir;
    
    if (file.fieldname === 'faceImage') {
      destinationDir = facesDir;
    } else if (file.fieldname === 'bukti') {
      destinationDir = documentsDir;
    }
    
    cb(null, destinationDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, uniqueSuffix + extension);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'faceImage') {
    // Accept only images for face images
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError(400, 'Hanya file gambar yang diperbolehkan untuk foto wajah'), false);
    }
  } else if (file.fieldname === 'bukti') {
    // Accept images and PDFs for documents
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new ApiError(400, 'Hanya file gambar atau PDF yang diperbolehkan untuk bukti'), false);
    }
  }
  
  cb(null, true);
};

// Set limits
const limits = {
  fileSize: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024, // 5MB default
};

// Create multer instance
exports.upload = multer({
  storage,
  fileFilter,
  limits
});