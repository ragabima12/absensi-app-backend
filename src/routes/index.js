const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @route   GET /api
 * @desc    API Information
 * @access  Public
 */
router.get('/', (req, res) => {
  res.json({
    message: 'Selamat datang di API Absensi App',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/check-db
 * @desc    Check database connection
 * @access  Public
 */
router.get('/check-db', async (req, res, next) => {
  try {
    // Simple query to check database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'success',
      message: 'Koneksi database berhasil',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;