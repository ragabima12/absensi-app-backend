const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validator.middleware');
const { upload } = require('../middleware/upload.middleware');

// Controllers
const userController = require('../controllers/user.controller');
const siswaController = require('../controllers/siswa.controller');
const kelasController = require('../controllers/kelas.controller');
const lokasiController = require('../controllers/lokasi.controller');
const absensiController = require('../controllers/absensi.controller');
const izinController = require('../controllers/izin.controller');
const feedbackController = require('../controllers/feedback.controller');
const registerController = require('../controllers/register.controller');


// All admin routes require authentication and admin role
router.use(authenticate, authorize('admin'));

// User management routes
router.get('/users', userController.getAllUsers);
router.get('/users/:id', userController.getUserById);
router.post('/users', [
  body('username').notEmpty().withMessage('Username harus diisi'),
  body('email').isEmail().withMessage('Format email tidak valid'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('roleId').isInt().withMessage('Role ID harus berupa angka'),
  validate
], userController.createUser);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);

// Kelas routes
router.get('/jurusan', kelasController.getAllJurusan);
router.post('/jurusan', [
  body('nama').notEmpty().withMessage('Nama jurusan harus diisi'),
  body('kode').notEmpty().withMessage('Kode jurusan harus diisi'),
  validate
], kelasController.createJurusan);
router.put('/jurusan/:id', kelasController.updateJurusan);
router.delete('/jurusan/:id', kelasController.deleteJurusan);

router.get('/kelas', kelasController.getAllKelas);
router.post('/kelas', [
  body('nama').notEmpty().withMessage('Nama kelas harus diisi'),
  body('jurusanId').isInt().withMessage('Jurusan ID harus berupa angka'),
  body('tahunAjaran').notEmpty().withMessage('Tahun ajaran harus diisi'),
  validate
], kelasController.createKelas);
router.put('/kelas/:id', kelasController.updateKelas);
router.delete('/kelas/:id', kelasController.deleteKelas);

// Siswa routes
router.get('/siswa', siswaController.getAllSiswa);
router.get('/siswa/:id', siswaController.getSiswaById);
router.put('/siswa/:id/approve-registration', registerController.approveRegistration);
router.post('/siswa', [
  body('namaLengkap').notEmpty().withMessage('Nama lengkap harus diisi'),
  body('kelasId').isInt().withMessage('Kelas ID harus berupa angka'),
  body('jenisKelamin').isIn(['L', 'P']).withMessage('Jenis kelamin harus L atau P'),
  validate
], siswaController.createSiswa);
router.put('/siswa/:id', siswaController.updateSiswa);
router.delete('/siswa/:id', siswaController.deleteSiswa);

// Face data management
router.post('/siswa/:id/face-data', [
  param('id').isInt().withMessage('ID harus berupa angka'),
  upload.single('faceImage'),
  validate
], siswaController.enrollFaceData);
router.delete('/siswa/:id/face-data', siswaController.deleteFaceData);

// Lokasi absensi routes
router.get('/lokasi', lokasiController.getAllLokasi);
router.post('/lokasi', [
  body('nama').notEmpty().withMessage('Nama lokasi harus diisi'),
  body('latitude').isDecimal().withMessage('Latitude harus berupa angka'),
  body('longitude').isDecimal().withMessage('Longitude harus berupa angka'),
  body('radius').isInt({ min: 10 }).withMessage('Radius minimal 10 meter'),
  validate
], lokasiController.createLokasi);
router.put('/lokasi/:id', lokasiController.updateLokasi);
router.delete('/lokasi/:id', lokasiController.deleteLokasi);

// Mapping kelas dengan lokasi
router.post('/kelas/:kelasId/lokasi/:lokasiId', kelasController.addLokasiToKelas);
router.delete('/kelas/:kelasId/lokasi/:lokasiId', kelasController.removeLokasiFromKelas);

// Absensi routes
router.get('/absensi', absensiController.getAbsensiReport);
router.get('/absensi/:id', absensiController.getAbsensiById);
router.post('/absensi/manual', [
  body('siswaId').isInt().withMessage('Siswa ID harus berupa angka'),
  body('status').isIn(['hadir', 'telat', 'izin', 'sakit', 'alpa']).withMessage('Status tidak valid'),
  body('tanggal').isDate().withMessage('Format tanggal tidak valid'),
  validate
], absensiController.createManualAbsensi);
router.put('/absensi/:id', absensiController.updateAbsensi);

// Izin routes
router.get('/izin', izinController.getAllPengajuanIzin);
router.get('/izin/:id', izinController.getPengajuanIzinById);
router.put('/izin/:id/approve', [
  param('id').isInt().withMessage('ID harus berupa angka'),
  validate
], izinController.approveIzin);
router.put('/izin/:id/reject', [
  param('id').isInt().withMessage('ID harus berupa angka'),
  body('alasan').notEmpty().withMessage('Alasan penolakan harus diisi'),
  validate
], izinController.rejectIzin);

// Jenis izin routes
router.get('/jenis-izin', izinController.getAllJenisIzin);
router.post('/jenis-izin', [
  body('nama').notEmpty().withMessage('Nama jenis izin harus diisi'),
  validate
], izinController.createJenisIzin);
router.put('/jenis-izin/:id', izinController.updateJenisIzin);
router.delete('/jenis-izin/:id', izinController.deleteJenisIzin);

// Feedback routes
router.get('/feedback', feedbackController.getAllFeedback);
router.get('/feedback/:id', feedbackController.getFeedbackById);
router.put('/feedback/:id/mark-as-read', feedbackController.markFeedbackAsRead);
router.put('/feedback/:id/mark-as-processed', feedbackController.markFeedbackAsProcessed);
router.delete('/feedback/:id', feedbackController.deleteFeedback);

// Dashboard data
router.get('/dashboard', absensiController.getDashboardData);

// Report export
router.get('/reports/absensi', absensiController.exportAbsensiReport);

router.get('/export/absensi', absensiController.exportAbsensiData);
router.get('/export/siswa', userController.exportSiswaData);
router.get('/export/izin', izinController.exportIzinData);

router.get('/users/unverified', userController.getUnverifiedSiswa);


module.exports = router;