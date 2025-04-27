const { ApiError } = require('../utils/error-handler');

/**
 * Role-based authorization middleware
 * @param {...String} roles - Allowed roles
 * @returns {Function} Middleware function
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user exists in request (set by authenticate middleware)
    if (!req.user) {
      return next(new ApiError(401, 'Akses ditolak. Login terlebih dahulu'));
    }

    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(403, `Akses ditolak. Role ${req.user.role} tidak memiliki akses`)
      );
    }

    next();
  };
};