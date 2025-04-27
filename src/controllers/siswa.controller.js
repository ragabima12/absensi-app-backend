const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');
const faceRecognitionService = require('../services/face-recognition.service');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * Get all siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllSiswa = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, kelasId } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    let filter = {};
    
    if (search) {
      filter = {
        OR: [
          { namaLengkap: { contains: search, mode: 'insensitive' } },
          { nis: { contains: search, mode: 'insensitive' } }
        ]
      };
    }
    
    if (kelasId) {
      filter = {
        ...filter,
        kelasId: parseInt(kelasId)
      };
    }
    
    // Get total count for pagination
    const totalCount = await prisma.siswa.count({
      where: filter
    });
    
    // Get siswa data
    const siswaData = await prisma.siswa.findMany({
      where: filter,
      include: {
        kelas: {
          include: {
            jurusan: true
          }
        },
        user: {
          select: {
            username: true,
            email: true,
            isActive: true
          }
        }
      },
      orderBy: {
        namaLengkap: 'asc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = siswaData.map(siswa => ({
      id: siswa.id,
      nis: siswa.nis,
      namaLengkap: siswa.namaLengkap,
      jenisKelamin: siswa.jenisKelamin,
      tanggalLahir: siswa.tanggalLahir,
      alamat: siswa.alamat,
      nomorTelepon: siswa.nomorTelepon,
      kelas: {
        id: siswa.kelas.id,
        nama: siswa.kelas.nama,
        jurusan: {
          id: siswa.kelas.jurusan.id,
          nama: siswa.kelas.jurusan.nama
        }
      },
      user: {
        username: siswa.user.username,
        email: siswa.user.email,
        isActive: siswa.user.isActive
      },
      hasFaceData: !!siswa.faceData
    }));
    
    // Pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.json({
      status: 'success',
      data: formattedData,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalRecords: totalCount,
        totalPages
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get siswa by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(id) },
      include: {
        kelas: {
          include: {
            jurusan: true
          }
        },
        user: {
          select: {
            username: true,
            email: true,
            isActive: true
          }
        }
      }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    res.json({
      status: 'success',
      data: {
        id: siswa.id,
        nis: siswa.nis,
        namaLengkap: siswa.namaLengkap,
        jenisKelamin: siswa.jenisKelamin,
        tanggalLahir: siswa.tanggalLahir,
        alamat: siswa.alamat,
        nomorTelepon: siswa.nomorTelepon,
        kelas: {
          id: siswa.kelas.id,
          nama: siswa.kelas.nama,
          jurusan: {
            id: siswa.kelas.jurusan.id,
            nama: siswa.kelas.jurusan.nama
          }
        },
        user: {
          username: siswa.user.username,
          email: siswa.user.email,
          isActive: siswa.user.isActive
        },
        hasFaceData: !!siswa.faceData
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createSiswa = async (req, res, next) => {
  try {
    const {
      nis,
      namaLengkap,
      jenisKelamin,
      tanggalLahir,
      alamat,
      nomorTelepon,
      kelasId,
      username,
      email,
      password
    } = req.body;
    
    // Check if NIS already exists
    if (nis) {
      const existingNIS = await prisma.siswa.findUnique({
        where: { nis }
      });
      
      if (existingNIS) {
        throw new ApiError(400, 'NIS sudah terdaftar');
      }
    }
    
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
    
    // Get siswa role
    const siswaRole = await prisma.role.findFirst({
      where: { name: 'siswa' }
    });
    
    if (!siswaRole) {
      throw new ApiError(500, 'Role siswa tidak ditemukan');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);
    
    // Create user and siswa in a transaction
    const siswa = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          username,
          email: email || `${username}@sekolah.com`,
          password: hashedPassword,
          roleId: siswaRole.id,
          isActive: true
        }
      });
      
      // Create siswa
      return tx.siswa.create({
        data: {
          userId: user.id,
          nis,
          namaLengkap,
          jenisKelamin,
          tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
          alamat,
          nomorTelepon,
          kelasId: parseInt(kelasId)
        }
      });
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Siswa berhasil ditambahkan',
      data: {
        id: siswa.id,
        nis: siswa.nis,
        namaLengkap: siswa.namaLengkap
      }
    });
    
    logger.info(`Siswa baru dibuat: ${namaLengkap} (ID: ${siswa.id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateSiswa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nis,
      namaLengkap,
      jenisKelamin,
      tanggalLahir,
      alamat,
      nomorTelepon,
      kelasId,
      email,
      isActive
    } = req.body;
    
    // Check if siswa exists
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: true
      }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    // Check if NIS already exists
    if (nis && nis !== siswa.nis) {
      const existingNIS = await prisma.siswa.findUnique({
        where: { nis }
      });
      
      if (existingNIS && existingNIS.id !== parseInt(id)) {
        throw new ApiError(400, 'NIS sudah terdaftar');
      }
    }
    
    // Check if email already exists
    if (email && email !== siswa.user.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingEmail && existingEmail.id !== siswa.userId) {
        throw new ApiError(400, 'Email sudah digunakan');
      }
    }
    
    // Update user and siswa in a transaction
    await prisma.$transaction(async (tx) => {
      // Update user
      if (email !== undefined || isActive !== undefined) {
        await tx.user.update({
          where: { id: siswa.userId },
          data: {
            email: email !== undefined ? email : undefined,
            isActive: isActive !== undefined ? isActive : undefined
          }
        });
      }
      
      // Update siswa
      await tx.siswa.update({
        where: { id: parseInt(id) },
        data: {
          nis: nis !== undefined ? nis : undefined,
          namaLengkap: namaLengkap !== undefined ? namaLengkap : undefined,
          jenisKelamin: jenisKelamin !== undefined ? jenisKelamin : undefined,
          tanggalLahir: tanggalLahir !== undefined ? new Date(tanggalLahir) : undefined,
          alamat: alamat !== undefined ? alamat : undefined,
          nomorTelepon: nomorTelepon !== undefined ? nomorTelepon : undefined,
          kelasId: kelasId !== undefined ? parseInt(kelasId) : undefined
        }
      });
    });
    
    res.json({
      status: 'success',
      message: 'Data siswa berhasil diperbarui'
    });
    
    logger.info(`Siswa diperbarui: ${namaLengkap || siswa.namaLengkap} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteSiswa = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if siswa exists
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: true
      }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    // Check if siswa has absensi records
    const absensiCount = await prisma.absensi.count({
      where: { siswaId: parseInt(id) }
    });
    
    if (absensiCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus siswa yang memiliki data absensi');
    }
    
    // Delete siswa and user in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete siswa first (because of foreign key constraint)
      await tx.siswa.delete({
        where: { id: parseInt(id) }
      });
      
      // Delete user
      await tx.user.delete({
        where: { id: siswa.userId }
      });
    });
    
    res.json({
      status: 'success',
      message: 'Siswa berhasil dihapus'
    });
    
    logger.info(`Siswa dihapus: ${siswa.namaLengkap} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Enroll face data for siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.enrollFaceData = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if file exists
    if (!req.file) {
      throw new ApiError(400, 'Foto wajah harus diunggah');
    }
    
    // Check if siswa exists
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    // Extract face data from image
    const faceData = await faceRecognitionService.extractFaceData(req.file.path);
    
    if (!faceData) {
      throw new ApiError(400, 'Tidak dapat mendeteksi wajah pada gambar. Pastikan wajah terlihat jelas');
    }
    
    // Save the face data
    await prisma.siswa.update({
      where: { id: parseInt(id) },
      data: {
        faceData: JSON.stringify(faceData)
      }
    });
    
    res.json({
      status: 'success',
      message: 'Data wajah berhasil didaftarkan'
    });
    
    logger.info(`Data wajah didaftarkan untuk siswa ID: ${id}`);
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

/**
 * Delete face data for siswa
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteFaceData = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if siswa exists
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    // Update the siswa to remove face data
    await prisma.siswa.update({
      where: { id: parseInt(id) },
      data: {
        faceData: null
      }
    });
    
    res.json({
      status: 'success',
      message: 'Data wajah berhasil dihapus'
    });
    
    logger.info(`Data wajah dihapus untuk siswa ID: ${id}`);
  } catch (error) {
    next(error);
  }
};

module.exports = exports;