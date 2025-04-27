const logger = require('./logger');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default error status code and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Terjadi kesalahan pada server';
  
  // Log error for debugging
  if (statusCode === 500) {
    logger.error(`[${req.method}] ${req.path} >> ${err.stack}`);
  } else {
    logger.warn(`[${req.method}] ${req.path} >> ${statusCode}: ${message}`);
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    
    // Handle specific Prisma errors
    switch (err.code) {
      case 'P2002': // Unique constraint failed
        message = `Data sudah ada: ${err.meta?.target.join(', ')}`;
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        message = 'Data tidak ditemukan';
        break;
      default:
        message = 'Terjadi kesalahan pada database';
    }
  }

  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    statusCode = 422;
    message = 'Validasi data gagal';
    return res.status(statusCode).json({
      status: 'error',
      message,
      errors: err.array()
    });
  }

  // Send appropriate error response
  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  ApiError,
  errorHandler
};