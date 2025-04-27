const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validator.middleware');
const settingsController = require('../controllers/settings.controller');

// All settings routes require authentication and admin role
router.use(authenticate, authorize('admin'));

/**
 * @route   GET /api/v1/settings
 * @desc    Get all settings
 * @access  Private (Admin)
 */
router.get('/', settingsController.getAllSettings);

/**
 * @route   GET /api/v1/settings/app
 * @desc    Get application settings
 * @access  Private (Admin)
 */
router.get('/app', settingsController.getAppSettings);

/**
 * @route   GET /api/v1/settings/:key
 * @desc    Get setting by key
 * @access  Private (Admin)
 */
router.get('/:key', [
  param('key').notEmpty().withMessage('Key harus diisi'),
  validate
], settingsController.getSettingByKey);

/**
 * @route   POST /api/v1/settings
 * @desc    Create new setting
 * @access  Private (Admin)
 */
router.post('/', [
  body('key').notEmpty().withMessage('Key harus diisi'),
  body('value').notEmpty().withMessage('Value harus diisi'),
  validate
], settingsController.createSetting);

/**
 * @route   PUT /api/v1/settings/:key
 * @desc    Update setting
 * @access  Private (Admin)
 */
router.put('/:key', [
  param('key').notEmpty().withMessage('Key harus diisi'),
  body('value').notEmpty().withMessage('Value harus diisi'),
  validate
], settingsController.updateSetting);

/**
 * @route   DELETE /api/v1/settings/:key
 * @desc    Delete setting
 * @access  Private (Admin)
 */
router.delete('/:key', [
  param('key').notEmpty().withMessage('Key harus diisi'),
  validate
], settingsController.deleteSetting);

/**
 * @route   PUT /api/v1/settings
 * @desc    Update multiple settings
 * @access  Private (Admin)
 */
router.put('/', [
  body('settings').isArray().withMessage('Settings harus berupa array'),
  body('settings.*.key').notEmpty().withMessage('Setiap setting harus memiliki key'),
  body('settings.*.value').notEmpty().withMessage('Setiap setting harus memiliki value'),
  validate
], settingsController.updateMultipleSettings);

module.exports = router;