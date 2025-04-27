const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Get all settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllSettings = async (req, res, next) => {
  try {
    const settings = await prisma.setting.findMany({
      orderBy: {
        key: 'asc'
      }
    });
    
    res.json({
      status: 'success',
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get setting by key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    
    const setting = await prisma.setting.findUnique({
      where: { key }
    });
    
    if (!setting) {
      throw new ApiError(404, 'Pengaturan tidak ditemukan');
    }
    
    res.json({
      status: 'success',
      data: setting
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createSetting = async (req, res, next) => {
  try {
    const { key, value, deskripsi } = req.body;
    
    // Check if setting already exists
    const existingSetting = await prisma.setting.findUnique({
      where: { key }
    });
    
    if (existingSetting) {
      throw new ApiError(400, `Pengaturan dengan key '${key}' sudah ada`);
    }
    
    // Create setting
    const setting = await prisma.setting.create({
      data: {
        key,
        value,
        deskripsi
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Pengaturan berhasil dibuat',
      data: setting
    });
    
    logger.info(`Setting created: ${key}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, deskripsi } = req.body;
    
    // Check if setting exists
    const existingSetting = await prisma.setting.findUnique({
      where: { key }
    });
    
    if (!existingSetting) {
      throw new ApiError(404, 'Pengaturan tidak ditemukan');
    }
    
    // Update setting
    const setting = await prisma.setting.update({
      where: { key },
      data: {
        value,
        deskripsi
      }
    });
    
    res.json({
      status: 'success',
      message: 'Pengaturan berhasil diperbarui',
      data: setting
    });
    
    logger.info(`Setting updated: ${key}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    
    // Check if setting exists
    const existingSetting = await prisma.setting.findUnique({
      where: { key }
    });
    
    if (!existingSetting) {
      throw new ApiError(404, 'Pengaturan tidak ditemukan');
    }
    
    // Delete setting
    await prisma.setting.delete({
      where: { key }
    });
    
    res.json({
      status: 'success',
      message: 'Pengaturan berhasil dihapus'
    });
    
    logger.info(`Setting deleted: ${key}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get application settings (specific set of settings)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAppSettings = async (req, res, next) => {
  try {
    // Define keys for app settings
    const appSettingKeys = [
      'jam_masuk',
      'batas_telat',
      'jam_pulang',
      'verification_threshold',
      'max_radius_error'
    ];
    
    // Get settings
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: appSettingKeys
        }
      }
    });
    
    // Transform to object
    const settingsObject = {};
    settings.forEach(setting => {
      settingsObject[setting.key] = setting.value;
    });
    
    res.json({
      status: 'success',
      data: settingsObject
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update multiple settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateMultipleSettings = async (req, res, next) => {
  try {
    const settings = req.body.settings;
    
    if (!Array.isArray(settings)) {
      throw new ApiError(400, 'Settings harus berupa array');
    }
    
    // Update settings in transaction
    const results = await prisma.$transaction(
      settings.map(setting => 
        prisma.setting.upsert({
          where: { key: setting.key },
          update: { 
            value: setting.value,
            deskripsi: setting.deskripsi || undefined
          },
          create: {
            key: setting.key,
            value: setting.value,
            deskripsi: setting.deskripsi || null
          }
        })
      )
    );
    
    res.json({
      status: 'success',
      message: 'Pengaturan berhasil diperbarui',
      data: results
    });
    
    logger.info(`${settings.length} settings updated`);
  } catch (error) {
    next(error);
  }
};

module.exports = exports;