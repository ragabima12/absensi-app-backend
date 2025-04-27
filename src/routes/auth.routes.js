const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validator.middleware');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/auth/login
 * @desc    User login
 * @access  Public
 */
router.post('/login', [
  body('username').notEmpty().withMessage('Username harus diisi'),
  body('password').notEmpty().withMessage('Password harus diisi'),
  validate
], authController.login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public (with refresh token)
 */
router.post('/refresh', authController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    User logout
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', authenticate, authController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, [
  body('email').optional().isEmail().withMessage('Format email tidak valid'),
  body('oldPassword').optional().notEmpty().withMessage('Password lama harus diisi'),
  body('newPassword')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password baru minimal 6 karakter'),
  validate
], authController.updateProfile);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', authenticate, [
  body('oldPassword').notEmpty().withMessage('Password lama harus diisi'),
  body('newPassword')
    .notEmpty()
    .isLength({ min: 6 })
    .withMessage('Password baru minimal 6 karakter'),
  body('confirmPassword')
    .notEmpty()
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Konfirmasi password tidak sesuai');
      }
      return true;
    }),
  validate
], authController.changePassword);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Forgot password, send reset email
 * @access  Public
 */
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Email tidak valid'),
    validate
  ], authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password/:token', [
    body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Konfirmasi password tidak sesuai');
        }
        return true;
      }),
    validate
  ], authController.resetPassword);

module.exports = router;