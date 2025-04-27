const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Get all lokasi absensi
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllLokasi = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    
    if (search) {
      filter.nama = {
        contains: search,
        mode: 'insensitive'
      };
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Get total count for pagination
    const totalCount = await prisma.lokasiAbsensi.count({
      where: filter
    });
    
    // Get lokasi data
    const lokasiData = await prisma.lokasiAbsensi.findMany({
      where: filter,
      orderBy: {
        nama: 'asc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format data for response
    const formattedData = lokasiData.map(lokasi => ({
      id: lokasi.id,
      nama: lokasi.nama,
      latitude: lokasi.latitude.toString(),
      longitude: lokasi.longitude.toString(),
      radius: lokasi.radius,
      isActive: lokasi.isActive,
      createdAt: lokasi.createdAt,
      updatedAt: lokasi.updatedAt
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
 * Create new lokasi absensi
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createLokasi = async (req, res, next) => {
  try {
    const { nama, latitude, longitude, radius, isActive } = req.body;
    
    // Validate coordinates
    const latNum = parseFloat(latitude);
    const longNum = parseFloat(longitude);
    
    if (isNaN(latNum) || isNaN(longNum)) {
      throw new ApiError(400, 'Latitude dan longitude harus berupa angka');
    }
    
    if (latNum < -90 || latNum > 90) {
      throw new ApiError(400, 'Latitude harus berada di antara -90 dan 90');
    }
    
    if (longNum < -180 || longNum > 180) {
      throw new ApiError(400, 'Longitude harus berada di antara -180 dan 180');
    }
    
    // Create lokasi
    const lokasi = await prisma.lokasiAbsensi.create({
      data: {
        nama,
        latitude: latNum,
        longitude: longNum,
        radius: parseInt(radius),
        isActive: isActive !== undefined ? isActive : true
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Lokasi absensi berhasil dibuat',
      data: {
        id: lokasi.id,
        nama: lokasi.nama,
        latitude: lokasi.latitude.toString(),
        longitude: lokasi.longitude.toString(),
        radius: lokasi.radius,
        isActive: lokasi.isActive
      }
    });
    
    logger.info(`Lokasi absensi baru dibuat: ${nama} (ID: ${lokasi.id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update lokasi absensi
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateLokasi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nama, latitude, longitude, radius, isActive } = req.body;
    
    // Check if lokasi exists
    const lokasi = await prisma.lokasiAbsensi.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!lokasi) {
      throw new ApiError(404, 'Lokasi absensi tidak ditemukan');
    }
    
    // Prepare update data
    const updateData = {};
    
    if (nama !== undefined) {
      updateData.nama = nama;
    }
    
    if (latitude !== undefined) {
      const latNum = parseFloat(latitude);
      
      if (isNaN(latNum)) {
        throw new ApiError(400, 'Latitude harus berupa angka');
      }
      
      if (latNum < -90 || latNum > 90) {
        throw new ApiError(400, 'Latitude harus berada di antara -90 dan 90');
      }
      
      updateData.latitude = latNum;
    }
    
    if (longitude !== undefined) {
      const longNum = parseFloat(longitude);
      
      if (isNaN(longNum)) {
        throw new ApiError(400, 'Longitude harus berupa angka');
      }
      
      if (longNum < -180 || longNum > 180) {
        throw new ApiError(400, 'Longitude harus berada di antara -180 dan 180');
      }
      
      updateData.longitude = longNum;
    }
    
    if (radius !== undefined) {
      updateData.radius = parseInt(radius);
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    
    // Update lokasi
    const updatedLokasi = await prisma.lokasiAbsensi.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    
    res.json({
      status: 'success',
      message: 'Lokasi absensi berhasil diperbarui',
      data: {
        id: updatedLokasi.id,
        nama: updatedLokasi.nama,
        latitude: updatedLokasi.latitude.toString(),
        longitude: updatedLokasi.longitude.toString(),
        radius: updatedLokasi.radius,
        isActive: updatedLokasi.isActive
      }
    });
    
    logger.info(`Lokasi absensi diperbarui: ${updatedLokasi.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete lokasi absensi
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteLokasi = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if lokasi exists
    const lokasi = await prisma.lokasiAbsensi.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!lokasi) {
      throw new ApiError(404, 'Lokasi absensi tidak ditemukan');
    }
    
    // Check if lokasi is used in any kelas
    const kelasLokasiCount = await prisma.kelasLokasi.count({
      where: { lokasiId: parseInt(id) }
    });
    
    if (kelasLokasiCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus lokasi yang digunakan oleh kelas');
    }
    
    // Check if lokasi is used in any absensi
    const absensiCount = await prisma.absensi.count({
      where: { lokasiId: parseInt(id) }
    });
    
    if (absensiCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus lokasi yang memiliki data absensi');
    }
    
    // Delete lokasi
    await prisma.lokasiAbsensi.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'Lokasi absensi berhasil dihapus'
    });
    
    logger.info(`Lokasi absensi dihapus: ${lokasi.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

module.exports = exports;