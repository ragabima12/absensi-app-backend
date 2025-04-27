const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Get all feedback (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllFeedback = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.feedback.count({
      where: filter
    });
    
    // Get feedback data
    const feedbackData = await prisma.feedback.findMany({
      where: filter,
      include: {
        siswa: {
          include: {
            kelas: {
              include: {
                jurusan: true
              }
            }
          }
        },
        admin: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = feedbackData.map(feedback => ({
      id: feedback.id,
      judul: feedback.judul,
      isi: feedback.isi,
      status: feedback.status,
      isAnonymous: feedback.isAnonymous,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      siswa: feedback.isAnonymous ? null : {
        id: feedback.siswa.id,
        nama: feedback.siswa.namaLengkap,
        kelas: `${feedback.siswa.kelas.nama} ${feedback.siswa.kelas.jurusan.nama}`
      },
      processedBy: feedback.admin ? {
        id: feedback.admin.id,
        nama: feedback.admin.namaLengkap
      } : null,
      processedAt: feedback.processedAt
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
 * Get feedback by ID (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getFeedbackById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(id) },
      include: {
        siswa: {
          include: {
            kelas: {
              include: {
                jurusan: true
              }
            }
          }
        },
        admin: true
      }
    });
    
    if (!feedback) {
      throw new ApiError(404, 'Feedback tidak ditemukan');
    }
    
    // Format response
    const formattedData = {
      id: feedback.id,
      judul: feedback.judul,
      isi: feedback.isi,
      status: feedback.status,
      isAnonymous: feedback.isAnonymous,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      siswa: feedback.isAnonymous ? null : {
        id: feedback.siswa.id,
        nama: feedback.siswa.namaLengkap,
        kelas: `${feedback.siswa.kelas.nama} ${feedback.siswa.kelas.jurusan.nama}`
      },
      processedBy: feedback.admin ? {
        id: feedback.admin.id,
        nama: feedback.admin.namaLengkap
      } : null,
      processedAt: feedback.processedAt
    };
    
    res.json({
      status: 'success',
      data: formattedData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit feedback (siswa only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { judul, isi, isAnonymous } = req.body;
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        siswaId: siswa.id,
        judul,
        isi,
        isAnonymous: isAnonymous || false,
        status: 'unread'
      }
    });
    
    // Notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('feedback:new', {
        id: feedback.id,
        judul: feedback.judul,
        isAnonymous: feedback.isAnonymous,
        siswa: feedback.isAnonymous ? null : {
          id: siswa.id,
          nama: siswa.namaLengkap
        },
        createdAt: feedback.createdAt
      });
    }
    
    res.status(201).json({
      status: 'success',
      message: 'Feedback berhasil dikirim',
      data: {
        id: feedback.id,
        judul: feedback.judul,
        isAnonymous: feedback.isAnonymous,
        createdAt: feedback.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get siswa's feedback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Get total count for pagination
    const totalCount = await prisma.feedback.count({
      where: {
        siswaId: siswa.id
      }
    });
    
    // Get feedback data
    const feedbackData = await prisma.feedback.findMany({
      where: {
        siswaId: siswa.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = feedbackData.map(feedback => ({
      id: feedback.id,
      judul: feedback.judul,
      isi: feedback.isi,
      status: feedback.status,
      isAnonymous: feedback.isAnonymous,
      createdAt: feedback.createdAt
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
 * Mark feedback as read (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.markFeedbackAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    // Get admin data
    const admin = await prisma.admin.findFirst({
      where: { userId: adminId }
    });
    
    if (!admin) {
      throw new ApiError(404, 'Data admin tidak ditemukan');
    }
    
    // Get feedback data
    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!feedback) {
      throw new ApiError(404, 'Feedback tidak ditemukan');
    }
    
    if (feedback.status !== 'unread') {
      throw new ApiError(400, `Feedback sudah dalam status ${feedback.status}`);
    }
    
    // Update feedback
    await prisma.feedback.update({
      where: { id: parseInt(id) },
      data: {
        status: 'read'
      }
    });
    
    res.json({
      status: 'success',
      message: 'Feedback berhasil ditandai sebagai dibaca'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark feedback as processed (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.markFeedbackAsProcessed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    // Get admin data
    const admin = await prisma.admin.findFirst({
      where: { userId: adminId }
    });
    
    if (!admin) {
      throw new ApiError(404, 'Data admin tidak ditemukan');
    }
    
    // Get feedback data
    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!feedback) {
      throw new ApiError(404, 'Feedback tidak ditemukan');
    }
    
    if (feedback.status === 'processed') {
      throw new ApiError(400, 'Feedback sudah diproses');
    }
    
    // Update feedback
    await prisma.feedback.update({
      where: { id: parseInt(id) },
      data: {
        status: 'processed',
        processedBy: admin.id,
        processedAt: new Date()
      }
    });
    
    res.json({
      status: 'success',
      message: 'Feedback berhasil ditandai sebagai diproses'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete feedback (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get feedback data
    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!feedback) {
      throw new ApiError(404, 'Feedback tidak ditemukan');
    }
    
    // Delete feedback
    await prisma.feedback.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'Feedback berhasil dihapus'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;