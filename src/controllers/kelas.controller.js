const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Get all jurusan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllJurusan = async (req, res, next) => {
  try {
    const jurusan = await prisma.jurusan.findMany({
      orderBy: {
        nama: 'asc'
      }
    });
    
    res.json({
      status: 'success',
      data: jurusan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new jurusan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createJurusan = async (req, res, next) => {
  try {
    const { nama, kode, deskripsi } = req.body;
    
    // Check if kode already exists
    const existingJurusan = await prisma.jurusan.findUnique({
      where: { kode }
    });
    
    if (existingJurusan) {
      throw new ApiError(400, 'Kode jurusan sudah digunakan');
    }
    
    // Create jurusan
    const jurusan = await prisma.jurusan.create({
      data: {
        nama,
        kode,
        deskripsi
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Jurusan berhasil dibuat',
      data: jurusan
    });
    
    logger.info(`Jurusan baru dibuat: ${nama} (ID: ${jurusan.id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update jurusan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateJurusan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nama, kode, deskripsi } = req.body;
    
    // Check if jurusan exists
    const jurusan = await prisma.jurusan.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!jurusan) {
      throw new ApiError(404, 'Jurusan tidak ditemukan');
    }
    
    // Check if kode already exists (if changed)
    if (kode && kode !== jurusan.kode) {
      const existingJurusan = await prisma.jurusan.findUnique({
        where: { kode }
      });
      
      if (existingJurusan) {
        throw new ApiError(400, 'Kode jurusan sudah digunakan');
      }
    }
    
    // Update jurusan
    const updatedJurusan = await prisma.jurusan.update({
      where: { id: parseInt(id) },
      data: {
        nama: nama !== undefined ? nama : undefined,
        kode: kode !== undefined ? kode : undefined,
        deskripsi: deskripsi !== undefined ? deskripsi : undefined
      }
    });
    
    res.json({
      status: 'success',
      message: 'Jurusan berhasil diperbarui',
      data: updatedJurusan
    });
    
    logger.info(`Jurusan diperbarui: ${updatedJurusan.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete jurusan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteJurusan = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if jurusan exists
    const jurusan = await prisma.jurusan.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!jurusan) {
      throw new ApiError(404, 'Jurusan tidak ditemukan');
    }
    
    // Check if jurusan is used in any kelas
    const kelasCount = await prisma.kelas.count({
      where: { jurusanId: parseInt(id) }
    });
    
    if (kelasCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus jurusan yang memiliki kelas');
    }
    
    // Delete jurusan
    await prisma.jurusan.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'Jurusan berhasil dihapus'
    });
    
    logger.info(`Jurusan dihapus: ${jurusan.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAllKelas = async (req, res, next) => {
  try {
    const { jurusanId, tahunAjaran, page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    
    if (jurusanId) {
      filter.jurusanId = parseInt(jurusanId);
    }
    
    if (tahunAjaran) {
      filter.tahunAjaran = tahunAjaran;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.kelas.count({
      where: filter
    });
    
    // Get kelas data
    const kelasData = await prisma.kelas.findMany({
      where: filter,
      include: {
        jurusan: true,
        kelasLokasi: {
          include: {
            lokasi: true
          }
        },
        _count: {
          select: {
            siswa: true
          }
        }
      },
      orderBy: [
        { tahunAjaran: 'desc' },
        { nama: 'asc' }
      ],
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = kelasData.map(kelas => ({
      id: kelas.id,
      nama: kelas.nama,
      tahunAjaran: kelas.tahunAjaran,
      jumlahSiswa: kelas._count.siswa,
      jurusan: {
        id: kelas.jurusan.id,
        nama: kelas.jurusan.nama,
        kode: kelas.jurusan.kode
      },
      lokasi: kelas.kelasLokasi.map(kl => ({
        id: kl.lokasi.id,
        nama: kl.lokasi.nama
      }))
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
 * Create new kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createKelas = async (req, res, next) => {
  try {
    const { nama, jurusanId, tahunAjaran } = req.body;
    
    // Check if jurusan exists
    const jurusan = await prisma.jurusan.findUnique({
      where: { id: parseInt(jurusanId) }
    });
    
    if (!jurusan) {
      throw new ApiError(404, 'Jurusan tidak ditemukan');
    }
    
    // Check if kelas with same name and tahun ajaran already exists
    const existingKelas = await prisma.kelas.findFirst({
      where: {
        nama,
        tahunAjaran
      }
    });
    
    if (existingKelas) {
      throw new ApiError(400, 'Kelas dengan nama dan tahun ajaran tersebut sudah ada');
    }
    
    // Create kelas
    const kelas = await prisma.kelas.create({
      data: {
        nama,
        jurusanId: parseInt(jurusanId),
        tahunAjaran
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Kelas berhasil dibuat',
      data: kelas
    });
    
    logger.info(`Kelas baru dibuat: ${nama} (ID: ${kelas.id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Update kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateKelas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nama, jurusanId, tahunAjaran } = req.body;
    
    // Check if kelas exists
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Check if jurusan exists (if changed)
    if (jurusanId) {
      const jurusan = await prisma.jurusan.findUnique({
        where: { id: parseInt(jurusanId) }
      });
      
      if (!jurusan) {
        throw new ApiError(404, 'Jurusan tidak ditemukan');
      }
    }
    
    // Check if kelas with same name and tahun ajaran already exists (if changed)
    if ((nama && nama !== kelas.nama) || (tahunAjaran && tahunAjaran !== kelas.tahunAjaran)) {
      const existingKelas = await prisma.kelas.findFirst({
        where: {
          nama: nama || kelas.nama,
          tahunAjaran: tahunAjaran || kelas.tahunAjaran,
          id: {
            not: parseInt(id)
          }
        }
      });
      
      if (existingKelas) {
        throw new ApiError(400, 'Kelas dengan nama dan tahun ajaran tersebut sudah ada');
      }
    }
    
    // Update kelas
    const updatedKelas = await prisma.kelas.update({
      where: { id: parseInt(id) },
      data: {
        nama: nama !== undefined ? nama : undefined,
        jurusanId: jurusanId !== undefined ? parseInt(jurusanId) : undefined,
        tahunAjaran: tahunAjaran !== undefined ? tahunAjaran : undefined
      }
    });
    
    res.json({
      status: 'success',
      message: 'Kelas berhasil diperbarui',
      data: updatedKelas
    });
    
    logger.info(`Kelas diperbarui: ${updatedKelas.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteKelas = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if kelas exists
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Check if kelas has siswa
    const siswaCount = await prisma.siswa.count({
      where: { kelasId: parseInt(id) }
    });
    
    if (siswaCount > 0) {
      throw new ApiError(400, 'Tidak dapat menghapus kelas yang memiliki siswa');
    }
    
    // Delete kelas_lokasi records first
    await prisma.kelasLokasi.deleteMany({
      where: { kelasId: parseInt(id) }
    });
    
    // Delete kelas
    await prisma.kelas.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      message: 'Kelas berhasil dihapus'
    });
    
    logger.info(`Kelas dihapus: ${kelas.nama} (ID: ${id})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Add lokasi to kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.addLokasiToKelas = async (req, res, next) => {
  try {
    const { kelasId, lokasiId } = req.params;
    
    // Check if kelas exists
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(kelasId) }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Check if lokasi exists
    const lokasi = await prisma.lokasiAbsensi.findUnique({
      where: { id: parseInt(lokasiId) }
    });
    
    if (!lokasi) {
      throw new ApiError(404, 'Lokasi tidak ditemukan');
    }
    
    // Check if mapping already exists
    const existingMapping = await prisma.kelasLokasi.findUnique({
      where: {
        kelasId_lokasiId: {
          kelasId: parseInt(kelasId),
          lokasiId: parseInt(lokasiId)
        }
      }
    });
    
    if (existingMapping) {
      throw new ApiError(400, 'Lokasi sudah ditambahkan ke kelas ini');
    }
    
    // Create mapping
    await prisma.kelasLokasi.create({
      data: {
        kelasId: parseInt(kelasId),
        lokasiId: parseInt(lokasiId)
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Lokasi berhasil ditambahkan ke kelas'
    });
    
    logger.info(`Lokasi (ID: ${lokasiId}) ditambahkan ke Kelas (ID: ${kelasId})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Remove lokasi from kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.removeLokasiFromKelas = async (req, res, next) => {
  try {
    const { kelasId, lokasiId } = req.params;
    
    // Check if mapping exists
    const mapping = await prisma.kelasLokasi.findUnique({
      where: {
        kelasId_lokasiId: {
          kelasId: parseInt(kelasId),
          lokasiId: parseInt(lokasiId)
        }
      }
    });
    
    if (!mapping) {
      throw new ApiError(404, 'Lokasi tidak ditemukan pada kelas ini');
    }
    
    // Delete mapping
    await prisma.kelasLokasi.delete({
      where: {
        kelasId_lokasiId: {
          kelasId: parseInt(kelasId),
          lokasiId: parseInt(lokasiId)
        }
      }
    });
    
    res.json({
      status: 'success',
      message: 'Lokasi berhasil dihapus dari kelas'
    });
    
    logger.info(`Lokasi (ID: ${lokasiId}) dihapus dari Kelas (ID: ${kelasId})`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get kelas by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getKelasById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(id) },
      include: {
        jurusan: true,
        kelasLokasi: {
          include: {
            lokasi: true
          }
        },
        _count: {
          select: {
            siswa: true
          }
        }
      }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Format response
    const formattedData = {
      id: kelas.id,
      nama: kelas.nama,
      tahunAjaran: kelas.tahunAjaran,
      jumlahSiswa: kelas._count.siswa,
      jurusan: {
        id: kelas.jurusan.id,
        nama: kelas.jurusan.nama,
        kode: kelas.jurusan.kode
      },
      lokasi: kelas.kelasLokasi.map(kl => ({
        id: kl.lokasi.id,
        nama: kl.lokasi.nama,
        latitude: kl.lokasi.latitude.toString(),
        longitude: kl.lokasi.longitude.toString(),
        radius: kl.lokasi.radius,
        isActive: kl.lokasi.isActive
      }))
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
 * Get siswa by kelas
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaByKelas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, search } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {
      kelasId: parseInt(id)
    };
    
    if (search) {
      filter.OR = [
        { namaLengkap: { contains: search, mode: 'insensitive' } },
        { nis: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Check if kelas exists
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(id) },
      include: {
        jurusan: true
      }
    });
    
    if (!kelas) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
    
    // Get total count for pagination
    const totalCount = await prisma.siswa.count({
      where: filter
    });
    
    // Get siswa data
    const siswaData = await prisma.siswa.findMany({
      where: filter,
      include: {
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
      nomorTelepon: siswa.nomorTelepon,
      user: {
        username: siswa.user.username,
        isActive: siswa.user.isActive
      },
      hasFaceData: !!siswa.faceData
    }));
    
    // Pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.json({
      status: 'success',
      data: {
        kelas: {
          id: kelas.id,
          nama: kelas.nama,
          tahunAjaran: kelas.tahunAjaran,
          jurusan: {
            id: kelas.jurusan.id,
            nama: kelas.jurusan.nama
          }
        },
        siswa: formattedData,
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalRecords: totalCount,
          totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get jurusan by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getJurusanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const jurusan = await prisma.jurusan.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            kelas: true
          }
        }
      }
    });
    
    if (!jurusan) {
      throw new ApiError(404, 'Jurusan tidak ditemukan');
    }
    
    // Format response
    const formattedData = {
      id: jurusan.id,
      nama: jurusan.nama,
      kode: jurusan.kode,
      deskripsi: jurusan.deskripsi,
      jumlahKelas: jurusan._count.kelas
    };
    
    res.json({
      status: 'success',
      data: formattedData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;