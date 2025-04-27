const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');

const prisma = new PrismaClient();

/**
 * Register new siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.registerSiswa = async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      namaLengkap,
      jenisKelamin,
      nis,
      tanggalLahir,
      kelasId,
      nomorTelepon
    } = req.body;
    
    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUsername) {
      throw new ApiError(400, 'Username sudah digunakan');
    }
    
    // Check if email already exists
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingEmail) {
        throw new ApiError(400, 'Email sudah digunakan');
      }
    }
    
    // Check if NIS already exists
    if (nis) {
      const existingNIS = await prisma.siswa.findUnique({
        where: { nis }
      });
      
      if (existingNIS) {
        throw new ApiError(400, 'NIS sudah terdaftar');
      }
    }
    
    // Check if kelas exists
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(kelasId) }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    
    // Set expiry (24 hours from now)
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Get siswa role
    const siswaRole = await prisma.role.findFirst({
      where: { name: 'siswa' }
    });
    
    if (!siswaRole) {
      throw new ApiError(500, 'Role siswa tidak ditemukan');
    }
    
    // Create user and siswa in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          roleId: siswaRole.id,
          isActive: false, // User starts inactive until verified
          verificationToken: hashedToken,
          verificationExpires
        }
      });
      
      // Create siswa profile
      const siswa = await tx.siswa.create({
        data: {
          userId: user.id,
          nis,
          namaLengkap,
          jenisKelamin,
          tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
          kelasId: parseInt(kelasId),
          nomorTelepon
        }
      });
      
      return { user, siswa };
    });
    
    // Create verification URL
    const verificationURL = `${req.protocol}://${req.get('host')}/api/v1/register/verify/${verificationToken}`;
    
    // Create email message
    const message = `
      <h1>Verifikasi Akun</h1>
      <p>Terima kasih telah mendaftar di Aplikasi Absensi.</p>
      <p>Silakan klik link berikut untuk verifikasi email Anda:</p>
      <a href="${verificationURL}" target="_blank">Verifikasi Email</a>
      <p>Link ini hanya valid selama 24 jam.</p>
      <p>Jika Anda tidak mendaftar di aplikasi ini, abaikan email ini.</p>
    `;
    
    try {
      // Send verification email
      await emailService.sendEmail({
        to: email,
        subject: 'Verifikasi Akun - Absensi App',
        html: message
      });
    } catch (emailError) {
      logger.error(`Failed to send verification email: ${emailError.message}`);
      // Don't fail the registration if email fails
    }
    
    res.status(201).json({
      status: 'success',
      message: 'Pendaftaran berhasil. Silakan periksa email Anda untuk verifikasi',
      data: {
        username: result.user.username,
        namaLengkap: result.siswa.namaLengkap
      }
    });
    
    logger.info(`New siswa registered: ${namaLengkap} (${username})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Manual approve registration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.approveRegistration = async (req, res, next) => {
    try {
      const { id } = req.params;
      
      // Find siswa
      const siswa = await prisma.siswa.findUnique({
        where: { id: parseInt(id) },
        include: {
          user: true
        }
      });
      
      if (!siswa) {
        throw new ApiError(404, 'Siswa tidak ditemukan');
      }
      
      // Update user status
      await prisma.user.update({
        where: { id: siswa.userId },
        data: {
          emailVerified: true,
          verificationToken: null,
          verificationExpires: null,
          isActive: true
        }
      });
      
      res.json({
        status: 'success',
        message: 'Pendaftaran siswa berhasil disetujui'
      });
      
      try {
        // Send notification email
        await emailService.sendEmail({
          to: siswa.user.email,
          subject: 'Pendaftaran Disetujui - Absensi App',
          html: `
            <h1>Pendaftaran Disetujui</h1>
            <p>Halo ${siswa.namaLengkap},</p>
            <p>Selamat! Pendaftaran Anda di Aplikasi Absensi telah disetujui.</p>
            <p>Anda sekarang dapat masuk menggunakan username dan password yang telah Anda daftarkan.</p>
          `
        });
      } catch (emailError) {
        logger.error(`Failed to send approval email: ${emailError.message}`);
        // Don't fail if email fails
      }
    } catch (error) {
      next(error);
    }
  };

/**
 * Verify email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    // Hash token for comparison
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashedToken,
        verificationExpires: {
          gt: new Date()
        },
        emailVerified: false
      }
    });
    
    if (!user) {
      throw new ApiError(400, 'Token verifikasi tidak valid atau sudah kedaluwarsa');
    }
    
    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpires: null,
        isActive: true // Activate user
      }
    });
    
    // Redirect to frontend or response with success
    if (req.accepts('html')) {
      // For browser request
      res.redirect(process.env.FRONTEND_URL || '/login?verified=true');
    } else {
      // For API request
      res.json({
        status: 'success',
        message: 'Email berhasil diverifikasi. Silakan login'
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Resend verification email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      throw new ApiError(400, 'Email harus diisi');
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    // Don't reveal if user exists or not
    if (!user || user.emailVerified) {
      return res.json({
        status: 'success',
        message: 'Jika email terdaftar dan belum diverifikasi, email verifikasi baru akan dikirim'
      });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    
    // Set new expiry (24 hours from now)
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Update user with new token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashedToken,
        verificationExpires
      }
    });
    
    // Create verification URL
    const verificationURL = `${req.protocol}://${req.get('host')}/api/v1/register/verify/${verificationToken}`;
    
    // Create email message
    const message = `
      <h1>Verifikasi Akun</h1>
      <p>Anda menerima email ini karena Anda (atau seseorang) telah meminta pengiriman ulang email verifikasi.</p>
      <p>Silakan klik link berikut untuk verifikasi email Anda:</p>
      <a href="${verificationURL}" target="_blank">Verifikasi Email</a>
      <p>Link ini hanya valid selama 24 jam.</p>
      <p>Jika Anda tidak mendaftar di aplikasi ini, abaikan email ini.</p>
    `;
    
    try {
      // Send verification email
      await emailService.sendEmail({
        to: email,
        subject: 'Verifikasi Akun - Absensi App',
        html: message
      });
    } catch (emailError) {
      logger.error(`Failed to send verification email: ${emailError.message}`);
      throw new ApiError(500, 'Gagal mengirim email verifikasi');
    }
    
    res.json({
      status: 'success',
      message: 'Email verifikasi baru telah dikirim. Silakan periksa inbox Anda'
    });
  } catch (error) {
    next(error);
  }
};