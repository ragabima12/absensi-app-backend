const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Get all users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, roleId } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    let filter = {};
    
    if (search) {
      filter = {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      };
    }
    
    if (roleId) {
      filter = {
        ...filter,
        roleId: parseInt(roleId)
      };
    }
    
    // Get total count for pagination
    const totalCount = await prisma.user.count({
      where: filter
    });
    
    // Get users
    const users = await prisma.user.findMany({
      where: filter,
      include: {
        role: true
      },
      orderBy: {
        username: 'asc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format users (exclude password)
    const formattedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    }));
    
    // Pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.json({
      status: 'success',
      data: formattedUsers,
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
 * Get user by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        role: true,
        siswa: true,
        admin: true
      }
    });
    
    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }
    
    // Format user (exclude password)
    const formattedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.role.name === 'siswa' 
        ? user.siswa 
        : user.role.name === 'admin' 
          ? user.admin 
          : null
    };
    
    res.json({
      status: 'success',
      data: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, roleId } = req.body;
    
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
    
    // Get role
    const role = await prisma.role.findUnique({
      where: { id: parseInt(roleId) }
    });
    
    if (!role) {
      throw new ApiError(404, 'Role tidak ditemukan');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        roleId: parseInt(roleId),
        isActive: true
      }
    });
    
    // Create profile based on role
    if (role.name === 'admin') {
      await prisma.admin.create({
        data: {
          userId: user.id,
          namaLengkap: username,
          jabatan: 'Staff'
        }
      });
    }
    
    res.status(201).json({
      status: 'success',
      message: 'User berhasil dibuat',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: role.name
      }
    });
    
    logger.info(`User baru dibuat: ${username} (ID: ${user.id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password, isActive } = req.body;
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }
    
    // Check if email already exists (if changed)
    if (email && email !== user.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingEmail) {
        throw new ApiError(400, 'Email sudah digunakan');
      }
    }
    
    // Prepare update data
    const updateData = {};
    
    if (email !== undefined) {
      updateData.email = email;
    }
    
    if (password !== undefined) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        role: true
      }
    });
    
    res.json({
      status: 'success',
      message: 'User berhasil diperbarui',
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role.name,
        isActive: updatedUser.isActive
      }
    });
    
    logger.info(`User diperbarui: ${user.username} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

// Tambahkan fungsi ini di user.controller.js
exports.getUnverifiedSiswa = async (req, res, next) => {
    try {
      const unverifiedSiswa = await prisma.siswa.findMany({
        where: {
          user: {
            emailVerified: false,
            verificationExpires: {
              gt: new Date()
            }
          }
        },
        include: {
          user: {
            select: {
              username: true,
              email: true,
              emailVerified: true,
              isActive: true,
              verificationExpires: true
            }
          },
          kelas: {
            include: {
              jurusan: true
            }
          }
        },
        orderBy: {
          user: {
            createdAt: 'desc'
          }
        }
      });
      
      res.json({
        status: 'success',
        data: unverifiedSiswa
      });
    } catch (error) {
      next(error);
    }
  };

/**
 * Export siswa data sebagai file CSV
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.exportSiswaData = async (req, res, next) => {
    try {
      const { kelasId, jurusanId, isActive, search } = req.query;
      
      // Build filter
      let filter = {};
      
      if (kelasId) {
        filter.kelasId = parseInt(kelasId);
      }
      
      if (jurusanId) {
        filter.kelas = {
          jurusanId: parseInt(jurusanId)
        };
      }
      
      if (isActive !== undefined) {
        filter.user = {
          isActive: isActive === 'true'
        };
      }
      
      if (search) {
        filter = {
          ...filter,
          OR: [
            { namaLengkap: { contains: search, mode: 'insensitive' } },
            { nis: { contains: search, mode: 'insensitive' } }
          ]
        };
      }
      
      // Import export service
      const exportService = require('../services/export.service');
      
      // Generate CSV
      const csvContent = await exportService.exportSiswaToCSV(filter);
      
      // Format tanggal untuk nama file
      const dateStr = new Date().toISOString().split('T')[0];
      
      // Set header untuk download file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="data-siswa-${dateStr}.csv"`);
      
      // Kirim response
      res.send(csvContent);
    } catch (error) {
      next(error);
    }
  };

/**
 * Delete user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        role: true
      }
    });
    
    if (!user) {
      throw new ApiError(404, 'User tidak ditemukan');
    }
    
    // Cannot delete own account
    if (user.id === req.user.id) {
      throw new ApiError(400, 'Tidak dapat menghapus akun sendiri');
    }
    
    // Check if user has related data based on role
    if (user.role.name === 'siswa') {
      const siswa = await prisma.siswa.findFirst({
        where: { userId: parseInt(id) }
      });
      
      if (siswa) {
        const absensiCount = await prisma.absensi.count({
          where: { siswaId: siswa.id }
        });
        
        if (absensiCount > 0) {
          throw new ApiError(400, 'Tidak dapat menghapus user yang memiliki data absensi');
        }
        
        // Delete siswa first
        await prisma.siswa.delete({
          where: { userId: parseInt(id) }
        });
      }
    } else if (user.role.name === 'admin') {
      const admin = await prisma.admin.findFirst({
        where: { userId: parseInt(id) }
      });
      
      if (admin) {
        // Check if admin has approved any izin
        const izinCount = await prisma.pengajuanIzin.count({
          where: { approvedBy: admin.id }
        });
        
        if (izinCount > 0) {
          throw new ApiError(400, 'Tidak dapat menghapus admin yang memiliki data persetujuan izin');
        }
        
        // Check if admin has processed any feedback
        const feedbackCount = await prisma.feedback.count({
          where: { processedBy: admin.id }
        });
        
        if (feedbackCount > 0) {
          throw new ApiError(400, 'Tidak dapat menghapus admin yang memiliki data pemrosesan feedback');
        }
        
        // Delete admin first
        await prisma.admin.delete({
          where: { userId: parseInt(id) }
        });
      }
    }
    
    // Delete user
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'User berhasil dihapus'
    });
    
    logger.info(`User dihapus: ${user.username} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

module.exports = exports;