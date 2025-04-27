const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator.middleware');
const registerController = require('../controllers/register.controller');

/**
 * @route   POST /api/v1/register
 * @desc    Register new siswa
 * @access  Public
 */
router.post('/', [
  body('username').notEmpty().withMessage('Username harus diisi')
    .isLength({ min: 4 }).withMessage('Username minimal 4 karakter')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username hanya boleh berisi huruf, angka, dan underscore'),
  body('email').isEmail().withMessage('Format email tidak valid'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('namaLengkap').notEmpty().withMessage('Nama lengkap harus diisi'),
  body('jenisKelamin').isIn(['L', 'P']).withMessage('Jenis kelamin harus L atau P'),
  body('kelasId').isInt().withMessage('Kelas ID harus berupa angka'),
  validate
], registerController.registerSiswa);

/**
 * @route   GET /api/v1/register/verify/:token
 * @desc    Verify email
 * @access  Public
 */
router.get('/verify/:token', registerController.verifyEmail);

/**
 * @route   POST /api/v1/register/resend-verification
 * @desc    Resend verification email
 * @access  Public
 */
router.post('/resend-verification', [
  body('email').isEmail().withMessage('Format email tidak valid'),
  validate
], registerController.resendVerification);

module.exports = router;