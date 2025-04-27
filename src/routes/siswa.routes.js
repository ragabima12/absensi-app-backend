const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validator.middleware');
const { upload } = require('../middleware/upload.middleware');

// Controllers
const absensiController = require('../controllers/absensi.controller');
const izinController = require('../controllers/izin.controller');
const feedbackController = require('../controllers/feedback.controller');

// All siswa routes require authentication and siswa role
router.use(authenticate, authorize('siswa'));

/**
 * @route   POST /api/siswa/absensi
 * @desc    Submit absensi with face recognition and location
 * @access  Private (Siswa)
 */
router.post('/absensi', [
  upload.single('faceImage'),
  body('latitude').isDecimal().withMessage('Latitude harus berupa angka'),
  body('longitude').isDecimal().withMessage('Longitude harus berupa angka'),
  validate
], absensiController.submitAbsensi);

/**
 * @route   GET /api/siswa/absensi
 * @desc    Get siswa's absensi history
 * @access  Private (Siswa)
 */
router.get('/absensi', absensiController.getSiswaAbsensiHistory);
router.get('/absensi/today', absensiController.getSiswaTodayAbsensi);
router.get('/absensi/summary', absensiController.getSiswaAbsensiSummary);

/**
 * @route   POST /api/siswa/izin
 * @desc    Submit izin request
 * @access  Private (Siswa)
 */
router.post('/izin', [
  body('jenisIzinId').isInt().withMessage('Jenis izin ID harus berupa angka'),
  body('tanggalMulai').isDate().withMessage('Format tanggal mulai tidak valid'),
  body('tanggalSelesai').isDate().withMessage('Format tanggal selesai tidak valid'),
  body('alasan').notEmpty().withMessage('Alasan harus diisi'),
  upload.single('bukti'),
  validate
], izinController.submitPengajuanIzin);

/**
 * @route   GET /api/siswa/izin
 * @desc    Get siswa's izin requests
 * @access  Private (Siswa)
 */
router.get('/izin', izinController.getSiswaPengajuanIzin);
router.get('/izin/:id', izinController.getSiswaPengajuanIzinById);
router.get('/jenis-izin', izinController.getAllJenisIzin);

/**
 * @route   POST /api/siswa/feedback
 * @desc    Submit feedback
 * @access  Private (Siswa)
 */
router.post('/feedback', [
  body('judul').notEmpty().withMessage('Judul harus diisi'),
  body('isi').notEmpty().withMessage('Isi feedback harus diisi'),
  body('isAnonymous').isBoolean().optional(),
  validate
], feedbackController.submitFeedback);

/**
 * @route   GET /api/siswa/feedback
 * @desc    Get siswa's feedback history
 * @access  Private (Siswa)
 */
router.get('/feedback', feedbackController.getSiswaFeedback);

// Tambahkan endpoint di siswa.routes.js
router.post('/absensi/pulang', [
    upload.single('faceImage'),
    body('latitude').isDecimal().withMessage('Latitude harus berupa angka'),
    body('longitude').isDecimal().withMessage('Longitude harus berupa angka'),
    validate
  ], absensiController.submitAbsensiPulang);

module.exports = router;