const { validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Format errors
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg
    }));
    
    // Return validation error response
    return res.status(422).json({
      status: 'error',
      message: 'Validasi data gagal',
      errors: formattedErrors
    });
  }
  
  next();
};