const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * User login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        role: true,
        siswa: true,
        admin: true
      }
    });

    // Check if user exists
    if (!user) {
      throw new ApiError(401, 'Username atau password salah');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError(401, 'Akun tidak aktif. Hubungi administrator');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Username atau password salah');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Create sanitized user object (exclude password)
    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.name,
      profile: user.role.name === 'siswa' 
        ? user.siswa 
        : user.role.name === 'admin' 
          ? user.admin 
          : null
    };

    // Send response
    res.json({
      status: 'success',
      message: 'Login berhasil',
      data: {
        user: userResponse,
        accessToken,
        refreshToken
      }
    });

    logger.info(`User ${username} logged in successfully`);
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.forgotPassword = async (req, res, next) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        throw new ApiError(400, 'Email harus diisi');
      }
      
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      // Don't reveal if user exists or not
      if (!user) {
        return res.json({
          status: 'success',
          message: 'Jika email terdaftar, instruksi reset password akan dikirim'
        });
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Set expiry (1 hour from now by default)
      const expiresAt = new Date(
        Date.now() + parseInt(process.env.RESET_PASSWORD_EXPIRE || 3600000)
      );
      
      // Delete any existing tokens for this user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id }
      });
      
      // Save token to database
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          expiresAt
        }
      });
      
      // Create reset URL
      const resetURL = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
      
      // Create email message
      const message = `
        <h1>Reset Password</h1>
        <p>Anda menerima email ini karena Anda (atau seseorang) telah meminta reset password untuk akun Anda.</p>
        <p>Silakan klik link berikut untuk reset password Anda:</p>
        <a href="${resetURL}" target="_blank">Reset Password</a>
        <p>Jika Anda tidak meminta reset password, abaikan email ini dan password Anda tidak akan berubah.</p>
        <p>Link ini hanya valid selama 1 jam.</p>
      `;
      
      // Send email
      const emailService = require('../services/email.service');
      await emailService.sendEmail({
        to: user.email,
        subject: 'Reset Password - Absensi App',
        html: message
      });
      
      res.json({
        status: 'success',
        message: 'Email dengan instruksi reset password telah dikirim'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
 * Reset password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.resetPassword = async (req, res, next) => {
    try {
      const { token } = req.params;
      const { password } = req.body;
      
      if (!token || !password) {
        throw new ApiError(400, 'Token dan password baru harus diisi');
      }
      
      // Hash token for comparison
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      // Find valid token
      const passwordResetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token: hashedToken,
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: true
        }
      });
      
      if (!passwordResetToken) {
        throw new ApiError(400, 'Token tidak valid atau sudah kedaluwarsa');
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update user password
      await prisma.user.update({
        where: { id: passwordResetToken.userId },
        data: {
          password: hashedPassword
        }
      });
      
      // Delete all reset tokens for this user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: passwordResetToken.userId }
      });
      
      res.json({
        status: 'success',
        message: 'Password berhasil diubah. Silakan login dengan password baru'
      });
    } catch (error) {
      next(error);
    }
  };

/**
 * Refresh access token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError(400, 'Refresh token diperlukan');
    }

    // Verify refresh token
    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        throw new ApiError(401, 'Refresh token tidak valid atau kadaluarsa');
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { role: true }
      });

      if (!user || !user.isActive) {
        throw new ApiError(401, 'User tidak ditemukan atau tidak aktif');
      }

      // Generate new access token
      const newAccessToken = generateAccessToken(user);

      res.json({
        status: 'success',
        message: 'Access token diperbarui',
        data: {
          accessToken: newAccessToken
        }
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User logout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.logout = (req, res) => {
  // Client-side should handle deleting tokens
  res.json({
    status: 'success',
    message: 'Logout berhasil'
  });
};

/**
 * Get user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Find user with profile data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        siswa: {
          include: {
            kelas: {
              include: {
                jurusan: true
              }
            }
          }
        },
        admin: true
      }
    });

    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }

    // Create sanitized user object (exclude password)
    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.name,
      profile: user.role.name === 'siswa' 
        ? user.siswa 
        : user.role.name === 'admin' 
          ? user.admin 
          : null
    };

    res.json({
      status: 'success',
      data: userResponse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, oldPassword, newPassword } = req.body;

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }

    // Prepare update data
    const updateData = {};

    // Update email if provided
    if (email && email !== user.email) {
      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });

      if (existingEmail) {
        throw new ApiError(400, 'Email sudah digunakan');
      }

      updateData.email = email;
    }

    // Update password if both old and new provided
    if (oldPassword && newPassword) {
      // Verify old password
      const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
      if (!isPasswordValid) {
        throw new ApiError(400, 'Password lama tidak sesuai');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
    }

    // Update user if there's data to update
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updateData
      });
    }

    res.json({
      status: 'success',
      message: 'Profil berhasil diperbarui'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change user password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new ApiError(400, 'Password lama tidak sesuai');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword
      }
    });

    res.json({
      status: 'success',
      message: 'Password berhasil diubah'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate access token
 * @param {Object} user - User object
 * @returns {String} JWT access token
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role.name
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {String} JWT refresh token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}