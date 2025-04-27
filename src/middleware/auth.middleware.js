const jwt = require('jsonwebtoken');
const { ApiError } = require('../utils/error-handler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Authentication middleware
 * Verifies JWT token and sets user in request object
 */
exports.authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Akses ditolak. Token tidak ditemukan');
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new ApiError(401, 'Akses ditolak. Token tidak valid');
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return next(new ApiError(401, 'Token kadaluarsa. Silakan login kembali'));
        }
        return next(new ApiError(401, 'Token tidak valid'));
      }

      // Check if user exists and is active
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { role: true }
      });

      if (!user) {
        return next(new ApiError(401, 'User tidak ditemukan'));
      }

      if (!user.isActive) {
        return next(new ApiError(401, 'Akun tidak aktif. Hubungi administrator'));
      }

      // Set user in request object
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role.name
      };

      next();
    });
  } catch (error) {
    next(error);
  }
};