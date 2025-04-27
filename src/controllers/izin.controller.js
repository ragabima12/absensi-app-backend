const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * Get all jenis izin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllJenisIzin = async (req, res, next) => {
  try {
    const jenisIzin = await prisma.jenisIzin.findMany({
      orderBy: {
        nama: 'asc'
      }
    });
    
    res.json({
      status: 'success',
      data: jenisIzin
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new jenis izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createJenisIzin = async (req, res, next) => {
  try {
    const { nama, deskripsi, memerlukanBukti } = req.body;
    
    // Check if jenis izin already exists
    const existingJenisIzin = await prisma.jenisIzin.findUnique({
      where: { nama }
    });
    
    if (existingJenisIzin) {
      throw new ApiError(400, 'Jenis izin dengan nama tersebut sudah ada');
    }
    
    // Create jenis izin
    const jenisIzin = await prisma.jenisIzin.create({
      data: {
        nama,
        deskripsi,
        memerlukanBukti: memerlukanBukti || false
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Jenis izin berhasil dibuat',
      data: jenisIzin
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update jenis izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateJenisIzin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, memerlukanBukti } = req.body;
    
    // Check if jenis izin exists
    const jenisIzin = await prisma.jenisIzin.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!jenisIzin) {
      throw new ApiError(404, 'Jenis izin tidak ditemukan');
    }
    
    // Check if nama already exists (if changed)
    if (nama && nama !== jenisIzin.nama) {
      const existingJenisIzin = await prisma.jenisIzin.findUnique({
        where: { nama }
      });
      
      if (existingJenisIzin) {
        throw new ApiError(400, 'Jenis izin dengan nama tersebut sudah ada');
      }
    }
    
    // Update jenis izin
    const updatedJenisIzin = await prisma.jenisIzin.update({
      where: { id: parseInt(id) },
      data: {
        nama: nama !== undefined ? nama : undefined,
        deskripsi: deskripsi !== undefined ? deskripsi : undefined,
        memerlukanBukti: memerlukanBukti !== undefined ? memerlukanBukti : undefined
      }
    });
    
    res.json({
      status: 'success',
      message: 'Jenis izin berhasil diperbarui',
      data: updatedJenisIzin
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete jenis izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteJenisIzin = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if jenis izin exists
    const jenisIzin = await prisma.jenisIzin.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!jenisIzin) {
      throw new ApiError(404, 'Jenis izin tidak ditemukan');
    }
    
    // Check if jenis izin is used in any pengajuan izin
    const pengajuanCount = await prisma.pengajuanIzin.count({
      where: { jenisIzinId: parseInt(id) }
    });
    
    if (pengajuanCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus jenis izin yang sudah digunakan');
    }
    
    // Delete jenis izin
    await prisma.jenisIzin.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'Jenis izin berhasil dihapus'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all pengajuan izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllPengajuanIzin = async (req, res, next) => {
  try {
    const { 
      status, 
      kelasId,
      tanggalMulai,
      tanggalSelesai,
      page = 1, 
      limit = 10,
      search
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (kelasId) {
      filter.siswa = {
        kelasId: parseInt(kelasId)
      };
    }
    
    if (tanggalMulai) {
      filter.tanggalMulai = {
        gte: new Date(tanggalMulai)
      };
    }
    
    if (tanggalSelesai) {
      filter.tanggalSelesai = {
        lte: new Date(tanggalSelesai)
      };
    }
    
    // Add search filter
    if (search) {
      filter.siswa = {
        ...filter.siswa,
        OR: [
          { namaLengkap: { contains: search, mode: 'insensitive' } },
          { nis: { contains: search, mode: 'insensitive' } }
        ]
      };
    }
    
    // Get total count for pagination
    const totalCount = await prisma.pengajuanIzin.count({
      where: filter
    });
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findMany({
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
        jenisIzin: true,
        admin: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = pengajuanIzin.map(izin => ({
      id: izin.id,
      jenisIzin: izin.jenisIzin.nama,
      tanggalMulai: izin.tanggalMulai,
      tanggalSelesai: izin.tanggalSelesai,
      alasan: izin.alasan,
      buktiPath: izin.buktiPath ? `/uploads/${izin.buktiPath}` : null,
      status: izin.status,
      createdAt: izin.createdAt,
      updatedAt: izin.updatedAt,
      siswa: {
        id: izin.siswa.id,
        nis: izin.siswa.nis,
        nama: izin.siswa.namaLengkap,
        kelas: `${izin.siswa.kelas.nama} ${izin.siswa.kelas.jurusan.nama}`
      },
      approvedBy: izin.admin ? {
        id: izin.admin.id,
        nama: izin.admin.namaLengkap
      } : null,
      approvedAt: izin.approvedAt
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
 * Get pengajuan izin by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getPengajuanIzinById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findUnique({
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
        jenisIzin: true,
        admin: true
      }
    });
    
    if (!pengajuanIzin) {
      throw new ApiError(404, 'Pengajuan izin tidak ditemukan');
    }
    
    // Check if user is authorized (admin or the siswa who submitted)
    if (req.user.role !== 'admin' && req.user.id !== pengajuanIzin.siswa.user.id) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke pengajuan izin ini');
    }
    
    // Format response
    const formattedData = {
      id: pengajuanIzin.id,
      jenisIzin: {
        id: pengajuanIzin.jenisIzin.id,
        nama: pengajuanIzin.jenisIzin.nama,
        deskripsi: pengajuanIzin.jenisIzin.deskripsi,
        memerlukanBukti: pengajuanIzin.jenisIzin.memerlukanBukti
      },
      tanggalMulai: pengajuanIzin.tanggalMulai,
      tanggalSelesai: pengajuanIzin.tanggalSelesai,
      alasan: pengajuanIzin.alasan,
      buktiPath: pengajuanIzin.buktiPath ? `/uploads/${pengajuanIzin.buktiPath}` : null,
      status: pengajuanIzin.status,
      createdAt: pengajuanIzin.createdAt,
      updatedAt: pengajuanIzin.updatedAt,
      siswa: {
        id: pengajuanIzin.siswa.id,
        nis: pengajuanIzin.siswa.nis,
        nama: pengajuanIzin.siswa.namaLengkap,
        kelas: `${pengajuanIzin.siswa.kelas.nama} ${pengajuanIzin.siswa.kelas.jurusan.nama}`
      },
      approvedBy: pengajuanIzin.admin ? {
        id: pengajuanIzin.admin.id,
        nama: pengajuanIzin.admin.namaLengkap
      } : null,
      approvedAt: pengajuanIzin.approvedAt
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
 * Submit pengajuan izin (siswa only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.submitPengajuanIzin = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { jenisIzinId, tanggalMulai, tanggalSelesai, alasan } = req.body;
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Get jenis izin
    const jenisIzin = await prisma.jenisIzin.findUnique({
      where: { id: parseInt(jenisIzinId) }
    });
    
    if (!jenisIzin) {
      throw new ApiError(404, 'Jenis izin tidak ditemukan');
    }
    
    // Check if bukti is required but not provided
    if (jenisIzin.memerlukanBukti && !req.file) {
      throw new ApiError(400, 'Bukti diperlukan untuk jenis izin ini');
    }
    
    // Check if tanggalMulai is before tanggalSelesai
    const startDate = new Date(tanggalMulai);
    const endDate = new Date(tanggalSelesai);
    
    if (startDate > endDate) {
      throw new ApiError(400, 'Tanggal mulai tidak boleh setelah tanggal selesai');
    }
    
    // Check for overlapping izin on the same dates
    const overlappingIzin = await prisma.pengajuanIzin.findFirst({
      where: {
        siswaId: siswa.id,
        OR: [
          {
            tanggalMulai: {
              lte: endDate
            },
            tanggalSelesai: {
              gte: startDate
            }
          }
        ]
      }
    });
    
    if (overlappingIzin) {
      throw new ApiError(400, 'Anda sudah memiliki pengajuan izin pada tanggal yang sama');
    }
    
    // Create pengajuan izin
    const pengajuanIzin = await prisma.pengajuanIzin.create({
      data: {
        siswaId: siswa.id,
        jenisIzinId: parseInt(jenisIzinId),
        tanggalMulai: startDate,
        tanggalSelesai: endDate,
        alasan,
        buktiPath: req.file ? path.relative(path.join(__dirname, '../../uploads'), req.file.path) : null,
        status: 'pending'
      }
    });
    
    // Notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('izin:new', {
        id: pengajuanIzin.id,
        siswaId: siswa.id,
        nama: siswa.namaLengkap,
        jenisIzin: jenisIzin.nama,
        tanggalMulai: startDate,
        tanggalSelesai: endDate
      });
    }
    
    res.status(201).json({
      status: 'success',
      message: 'Pengajuan izin berhasil dikirim',
      data: {
        id: pengajuanIzin.id,
        tanggalMulai: pengajuanIzin.tanggalMulai,
        tanggalSelesai: pengajuanIzin.tanggalSelesai,
        status: pengajuanIzin.status
      }
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

/**
 * Get siswa's pengajuan izin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaPengajuanIzin = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Build filter
    const filter = {
      siswaId: siswa.id
    };
    
    if (status) {
      filter.status = status;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.pengajuanIzin.count({
      where: filter
    });
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findMany({
      where: filter,
      include: {
        jenisIzin: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = pengajuanIzin.map(izin => ({
      id: izin.id,
      jenisIzin: izin.jenisIzin.nama,
      tanggalMulai: izin.tanggalMulai,
      tanggalSelesai: izin.tanggalSelesai,
      alasan: izin.alasan,
      buktiPath: izin.buktiPath ? `/uploads/${izin.buktiPath}` : null,
      status: izin.status,
      createdAt: izin.createdAt,
      approvedAt: izin.approvedAt
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
 * Get siswa's pengajuan izin by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaPengajuanIzinById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findFirst({
      where: {
        id: parseInt(id),
        siswaId: siswa.id
      },
      include: {
        jenisIzin: true
      }
    });
    
    if (!pengajuanIzin) {
      throw new ApiError(404, 'Pengajuan izin tidak ditemukan');
    }
    
    // Format response
    const formattedData = {
      id: pengajuanIzin.id,
      jenisIzin: {
        id: pengajuanIzin.jenisIzin.id,
        nama: pengajuanIzin.jenisIzin.nama
      },
      tanggalMulai: pengajuanIzin.tanggalMulai,
      tanggalSelesai: pengajuanIzin.tanggalSelesai,
      alasan: pengajuanIzin.alasan,
      buktiPath: pengajuanIzin.buktiPath ? `/uploads/${pengajuanIzin.buktiPath}` : null,
      status: pengajuanIzin.status,
      createdAt: pengajuanIzin.createdAt,
      approvedAt: pengajuanIzin.approvedAt
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
 * Approve pengajuan izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.approveIzin = async (req, res, next) => {
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
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findUnique({
      where: { id: parseInt(id) },
      include: {
        siswa: true,
        jenisIzin: true
      }
    });
    
    if (!pengajuanIzin) {
      throw new ApiError(404, 'Pengajuan izin tidak ditemukan');
    }
    
    if (pengajuanIzin.status !== 'pending') {
      throw new ApiError(400, `Pengajuan izin sudah ${pengajuanIzin.status}`);
    }
    
    // Update pengajuan izin
    await prisma.pengajuanIzin.update({
      where: { id: parseInt(id) },
      data: {
        status: 'approved',
        approvedBy: admin.id,
        approvedAt: new Date()
      }
    });
    
    // Update absensi records for the days covered by the izin
    const startDate = new Date(pengajuanIzin.tanggalMulai);
    const endDate = new Date(pengajuanIzin.tanggalSelesai);
    
    // For each day in the range
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      // Check if there's already an absensi record for this day
      const existingAbsensi = await prisma.absensi.findFirst({
        where: {
          siswaId: pengajuanIzin.siswaId,
          tanggal: {
            equals: new Date(date)
          }
        }
      });
      
      // Determine status based on jenis izin
      const status = pengajuanIzin.jenisIzin.nama.toLowerCase() === 'sakit' ? 'sakit' : 'izin';
      
      if (existingAbsensi) {
        // Don't update if status is 'hadir' or already 'izin'/'sakit'
        if (!['hadir', 'izin', 'sakit'].includes(existingAbsensi.status)) {
          // Update existing record
          await prisma.absensi.update({
            where: { id: existingAbsensi.id },
            data: {
              status,
              keterangan: `${pengajuanIzin.jenisIzin.nama}: ${pengajuanIzin.alasan}`
            }
          });
        }
      } else {
        // Only create records for past or current dates, not future dates
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        if (date <= currentDate) {
          // Create new record
          await prisma.absensi.create({
            data: {
              siswaId: pengajuanIzin.siswaId,
              tanggal: new Date(date.setHours(0, 0, 0, 0)),
              status,
              keterangan: `${pengajuanIzin.jenisIzin.nama}: ${pengajuanIzin.alasan}`
            }
          });
        }
      }
    }
    
    // Notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('izin:approved', {
        id: pengajuanIzin.id,
        siswaId: pengajuanIzin.siswaId,
        namaAdmin: admin.namaLengkap
      });
    }
    
    res.json({
      status: 'success',
      message: 'Pengajuan izin berhasil disetujui'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject pengajuan izin (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.rejectIzin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { alasan } = req.body;
    const adminId = req.user.id;
    
    // Get admin data
    const admin = await prisma.admin.findFirst({
      where: { userId: adminId }
    });
    
    if (!admin) {
      throw new ApiError(404, 'Data admin tidak ditemukan');
    }
    
    // Get pengajuan izin data
    const pengajuanIzin = await prisma.pengajuanIzin.findUnique({
      where: { id: parseInt(id) },
      include: {
        siswa: true
      }
    });
    
    if (!pengajuanIzin) {
      throw new ApiError(404, 'Pengajuan izin tidak ditemukan');
    }
    
    if (pengajuanIzin.status !== 'pending') {
      throw new ApiError(400, `Pengajuan izin sudah ${pengajuanIzin.status}`);
    }
    
    // Update pengajuan izin
    await prisma.pengajuanIzin.update({
      where: { id: parseInt(id) },
      data: {
        status: 'rejected',
        approvedBy: admin.id,
        approvedAt: new Date(),
        keterangan: alasan
      }
    });
    
    // Notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('izin:rejected', {
        id: pengajuanIzin.id,
        siswaId: pengajuanIzin.siswaId,
        namaAdmin: admin.namaLengkap,
        alasan
      });
    }
    
    res.json({
      status: 'success',
      message: 'Pengajuan izin berhasil ditolak'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export izin data sebagai file CSV
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.exportIzinData = async (req, res, next) => {
    try {
      const { status, kelasId, tanggalMulai, tanggalSelesai, search } = req.query;
      
      // Build filter
      let filter = {};
      
      if (status) {
        filter.status = status;
      }
      
      if (kelasId) {
        filter.siswa = {
          kelasId: parseInt(kelasId)
        };
      }
      
      if (tanggalMulai) {
        filter.tanggalMulai = {
          gte: new Date(tanggalMulai)
        };
      }
      
      if (tanggalSelesai) {
        filter.tanggalSelesai = {
          lte: new Date(tanggalSelesai)
        };
      }
      
      if (search) {
        filter.siswa = {
          ...filter.siswa,
          OR: [
            { namaLengkap: { contains: search, mode: 'insensitive' } },
            { nis: { contains: search, mode: 'insensitive' } }
          ]
        };
      }
      
      // Import export service
      const exportService = require('../services/export.service');
      
      // Generate CSV
      const csvContent = await exportService.exportIzinToCSV(filter);
      
      // Format tanggal untuk nama file
      const dateStr = new Date().toISOString().split('T')[0];
      
      // Set header untuk download file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="data-izin-${dateStr}.csv"`);
      
      // Kirim response
      res.send(csvContent);
    } catch (error) {
      next(error);
    }
  };

module.exports = exports;