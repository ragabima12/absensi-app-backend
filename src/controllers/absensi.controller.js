const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');
const faceRecognitionService = require('../services/face-recognition.service');
const locationService = require('../services/location.service');

const prisma = new PrismaClient();

/**
 * Submit absensi with face recognition and location check
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.submitAbsensi = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.body;
    
    // Check if file exists
    if (!req.file) {
      throw new ApiError(400, 'Foto wajah harus diunggah');
    }

    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId },
      include: {
        kelas: {
          include: {
            kelasLokasi: {
              include: {
                lokasi: true
              }
            }
          }
        }
      }
    });

    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }

    // Check if siswa has face data registered
    if (!siswa.faceData) {
      throw new ApiError(400, 'Data wajah belum terdaftar. Silakan hubungi administrator');
    }

    // Get current time and settings
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Convert to minutes since midnight

    const jamMasukSetting = await prisma.setting.findUnique({
      where: { key: 'jam_masuk' }
    });

    const batasTelat = await prisma.setting.findUnique({
      where: { key: 'batas_telat' }
    });

    // Parse time settings to minutes
    const jamMasuk = parseTimeToMinutes(jamMasukSetting?.value || '07:30:00');
    const batasTelateTime = parseTimeToMinutes(batasTelat?.value || '08:30:00');

    // Check if already submitted attendance today
    const existingAbsensi = await prisma.absensi.findFirst({
      where: {
        siswaId: siswa.id,
        tanggal: {
          equals: new Date(now.setHours(0, 0, 0, 0))
        }
      }
    });

    if (existingAbsensi) {
      throw new ApiError(400, 'Anda sudah melakukan absensi hari ini');
    }

    // Check valid locations
    if (siswa.kelas.kelasLokasi.length === 0) {
      throw new ApiError(400, 'Tidak ada lokasi absensi yang dikonfigurasi untuk kelas Anda');
    }

    // Find nearest valid location within allowed radius
    const validLocations = siswa.kelas.kelasLokasi.map(kl => kl.lokasi).filter(loc => loc.isActive);
    
    if (validLocations.length === 0) {
      throw new ApiError(400, 'Tidak ada lokasi absensi aktif untuk kelas Anda');
    }

    const nearestLocation = locationService.findNearestLocation(
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
      validLocations
    );

    if (!nearestLocation) {
      throw new ApiError(400, 'Anda berada di luar area absensi yang diperbolehkan');
    }

    // Perform face recognition
    const verificationResult = await faceRecognitionService.verifyFace(
      req.file.path,
      JSON.parse(siswa.faceData)
    );

    if (!verificationResult.isMatch) {
      // Delete uploaded file if face doesn't match
      fs.unlinkSync(req.file.path);
      throw new ApiError(400, 'Verifikasi wajah gagal. Silakan coba lagi');
    }

    // Determine attendance status
    let status;
    if (currentTime <= jamMasuk) {
      status = 'hadir';
    } else if (currentTime <= batasTelateTime) {
      status = 'telat';
    } else {
      status = 'alpa'; // Default to ALPA if beyond telat threshold
      
      // Check if student has permission for this day
      const activeIzin = await prisma.pengajuanIzin.findFirst({
        where: {
          siswaId: siswa.id,
          status: 'approved',
          tanggalMulai: {
            lte: new Date(now.setHours(0, 0, 0, 0))
          },
          tanggalSelesai: {
            gte: new Date(now.setHours(0, 0, 0, 0))
          }
        },
        include: {
          jenisIzin: true
        }
      });
      
      if (activeIzin) {
        status = activeIzin.jenisIzin.nama === 'Sakit' ? 'sakit' : 'izin';
      }
    }

    // Create absensi record
    const absensi = await prisma.absensi.create({
      data: {
        siswaId: siswa.id,
        lokasiId: nearestLocation.id,
        tanggal: new Date(now.setHours(0, 0, 0, 0)),
        waktuAbsen: new Date(),
        status,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        fotoWajahPath: path.relative(path.join(__dirname, '../../uploads'), req.file.path),
        keterangan: status === 'telat' ? 'Terlambat masuk' : null
      }
    });

    // Notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.emit('absensi:new', {
        siswaId: siswa.id,
        nama: siswa.namaLengkap,
        kelas: siswa.kelas.nama,
        status,
        waktu: new Date().toISOString()
      });
    }

    res.status(201).json({
      status: 'success',
      message: `Absensi berhasil dicatat dengan status: ${status}`,
      data: {
        id: absensi.id,
        tanggal: absensi.tanggal,
        waktuAbsen: absensi.waktuAbsen,
        status: absensi.status,
        lokasi: {
          nama: nearestLocation.nama,
          latitude: nearestLocation.latitude.toString(),
          longitude: nearestLocation.longitude.toString()
        }
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

// Tambahkan fungsi ini di absensi.controller.js
/**
 * Submit absensi pulang dengan face recognition dan location check
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.submitAbsensiPulang = async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { latitude, longitude } = req.body;
      
      // Check if file exists
      if (!req.file) {
        throw new ApiError(400, 'Foto wajah harus diunggah');
      }
  
      // Get siswa data
      const siswa = await prisma.siswa.findFirst({
        where: { userId },
        include: {
          kelas: {
            include: {
              kelasLokasi: {
                include: {
                  lokasi: true
                }
              }
            }
          }
        }
      });
  
      if (!siswa) {
        throw new ApiError(404, 'Data siswa tidak ditemukan');
      }
  
      // Check if siswa has face data registered
      if (!siswa.faceData) {
        throw new ApiError(400, 'Data wajah belum terdaftar. Silakan hubungi administrator');
      }
  
      // Get current day and time
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Check if already submitted checkout attendance today
      const existingCheckout = await prisma.absensi.findFirst({
        where: {
          siswaId: siswa.id,
          tanggal: {
            equals: today
          },
          tipe: 'pulang'
        }
      });
  
      if (existingCheckout) {
        throw new ApiError(400, 'Anda sudah melakukan absensi pulang hari ini');
      }
  
      // Check if already submitted checkin attendance today
      const existingCheckin = await prisma.absensi.findFirst({
        where: {
          siswaId: siswa.id,
          tanggal: {
            equals: today
          },
          tipe: 'masuk'
        }
      });
  
      if (!existingCheckin) {
        throw new ApiError(400, 'Anda belum melakukan absensi masuk hari ini');
      }
  
      // Get setting for jam pulang
      const jamPulangSetting = await prisma.setting.findUnique({
        where: { key: 'jam_pulang' }
      });
  
      const jamPulang = jamPulangSetting 
        ? parseTimeToMinutes(jamPulangSetting.value || '15:30:00') 
        : parseTimeToMinutes('15:30:00');
  
      // Current time in minutes
      const currentTime = now.getHours() * 60 + now.getMinutes();
  
      // Check if too early for checkout
      if (currentTime < jamPulang) {
        throw new ApiError(400, 'Belum mencapai waktu pulang minimum');
      }
  
      // Check valid locations
      if (siswa.kelas.kelasLokasi.length === 0) {
        throw new ApiError(400, 'Tidak ada lokasi absensi yang dikonfigurasi untuk kelas Anda');
      }
  
      // Find nearest valid location within allowed radius
      const validLocations = siswa.kelas.kelasLokasi.map(kl => kl.lokasi).filter(loc => loc.isActive);
      
      if (validLocations.length === 0) {
        throw new ApiError(400, 'Tidak ada lokasi absensi aktif untuk kelas Anda');
      }
  
      const nearestLocation = locationService.findNearestLocation(
        { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        validLocations
      );
  
      if (!nearestLocation) {
        throw new ApiError(400, 'Anda berada di luar area absensi yang diperbolehkan');
      }
  
      // Perform face recognition
      const verificationResult = await faceRecognitionService.verifyFace(
        req.file.path,
        JSON.parse(siswa.faceData)
      );
  
      if (!verificationResult.isMatch) {
        // Delete uploaded file if face doesn't match
        fs.unlinkSync(req.file.path);
        throw new ApiError(400, 'Verifikasi wajah gagal. Silakan coba lagi');
      }
  
      // Create absensi pulang record
      const absensi = await prisma.absensi.create({
        data: {
          siswaId: siswa.id,
          lokasiId: nearestLocation.id,
          tanggal: today,
          waktuAbsen: now,
          status: 'hadir',  // Untuk absensi pulang, status selalu hadir
          tipe: 'pulang',   // Menandakan ini absensi pulang
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          fotoWajahPath: path.relative(path.join(__dirname, '../../uploads'), req.file.path)
        }
      });
  
      // Notify via socket if available
      const io = req.app.get('io');
      if (io) {
        io.emit('absensi:checkout', {
          siswaId: siswa.id,
          nama: siswa.namaLengkap,
          kelas: siswa.kelas.nama,
          waktu: now.toISOString()
        });
      }
  
      res.status(201).json({
        status: 'success',
        message: 'Absensi pulang berhasil dicatat',
        data: {
          id: absensi.id,
          tanggal: absensi.tanggal,
          waktuAbsen: absensi.waktuAbsen,
          tipe: absensi.tipe,
          lokasi: {
            nama: nearestLocation.nama,
            latitude: nearestLocation.latitude.toString(),
            longitude: nearestLocation.longitude.toString()
          }
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
 * Create manual absensi (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createManualAbsensi = async (req, res, next) => {
  try {
    const { siswaId, status, tanggal, keterangan, lokasiId } = req.body;
    
    // Validate siswa exists
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(siswaId) }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Siswa tidak ditemukan');
    }
    
    // Check if already has absensi for the date
    const absensiDate = new Date(tanggal);
    absensiDate.setHours(0, 0, 0, 0);
    
    const existingAbsensi = await prisma.absensi.findFirst({
      where: {
        siswaId: parseInt(siswaId),
        tanggal: {
          equals: absensiDate
        }
      }
    });
    
    if (existingAbsensi) {
      throw new ApiError(400, `Siswa sudah memiliki absensi pada tanggal ${tanggal}`);
    }
    
    // Create absensi
    const absensi = await prisma.absensi.create({
      data: {
        siswaId: parseInt(siswaId),
        lokasiId: lokasiId ? parseInt(lokasiId) : null,
        tanggal: absensiDate,
        waktuAbsen: new Date(),
        status,
        keterangan
      }
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Absensi manual berhasil dicatat',
      data: absensi
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get absensi report (admin)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAbsensiReport = async (req, res, next) => {
  try {
    const { 
      kelasId, 
      tanggalMulai, 
      tanggalSelesai, 
      status, 
      page = 1, 
      limit = 10,
      search
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    
    if (tanggalMulai) {
      const startDate = new Date(tanggalMulai);
      startDate.setHours(0, 0, 0, 0);
      
      filter.tanggal = {
        gte: startDate
      };
    }
    
    if (tanggalSelesai) {
      const endDate = new Date(tanggalSelesai);
      endDate.setHours(23, 59, 59, 999);
      
      filter.tanggal = {
        ...filter.tanggal,
        lte: endDate
      };
    }
    
    if (status) {
      filter.status = status;
    }
    
    // Add kelas filter if specified
    if (kelasId) {
      filter.siswa = {
        kelasId: parseInt(kelasId)
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
    const totalCount = await prisma.absensi.count({
      where: filter
    });
    
    // Get absensi data
    const absensiData = await prisma.absensi.findMany({
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
        lokasi: true
      },
      orderBy: {
        tanggal: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = absensiData.map(absensi => ({
      id: absensi.id,
      tanggal: absensi.tanggal,
      waktuAbsen: absensi.waktuAbsen,
      status: absensi.status,
      keterangan: absensi.keterangan,
      siswa: {
        id: absensi.siswa.id,
        nis: absensi.siswa.nis,
        nama: absensi.siswa.namaLengkap,
        kelas: `${absensi.siswa.kelas.nama} ${absensi.siswa.kelas.jurusan.nama}`
      },
      lokasi: absensi.lokasi ? {
        nama: absensi.lokasi.nama,
        latitude: absensi.lokasi.latitude.toString(),
        longitude: absensi.lokasi.longitude.toString()
      } : null
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
 * Get absensi by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAbsensiById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const absensi = await prisma.absensi.findUnique({
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
        lokasi: true
      }
    });
    
    if (!absensi) {
      throw new ApiError(404, 'Data absensi tidak ditemukan');
    }
    
    res.json({
      status: 'success',
      data: {
        id: absensi.id,
        tanggal: absensi.tanggal,
        waktuAbsen: absensi.waktuAbsen,
        status: absensi.status,
        keterangan: absensi.keterangan,
        fotoWajahPath: absensi.fotoWajahPath ? `/uploads/${absensi.fotoWajahPath}` : null,
        siswa: {
          id: absensi.siswa.id,
          nis: absensi.siswa.nis,
          nama: absensi.siswa.namaLengkap,
          kelas: `${absensi.siswa.kelas.nama} ${absensi.siswa.kelas.jurusan.nama}`
        },
        lokasi: absensi.lokasi ? {
          nama: absensi.lokasi.nama,
          latitude: absensi.lokasi.latitude.toString(),
          longitude: absensi.lokasi.longitude.toString()
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update absensi (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateAbsensi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, keterangan } = req.body;
    
    const absensi = await prisma.absensi.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!absensi) {
      throw new ApiError(404, 'Data absensi tidak ditemukan');
    }
    
    const updatedAbsensi = await prisma.absensi.update({
      where: { id: parseInt(id) },
      data: {
        status,
        keterangan,
        updatedAt: new Date()
      }
    });
    
    res.json({
      status: 'success',
      message: 'Data absensi berhasil diperbarui',
      data: updatedAbsensi
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get siswa's absensi history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaAbsensiHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bulan, tahun, page = 1, limit = 10 } = req.query;
    
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
    
    // Add month and year filter if specified
    if (bulan && tahun) {
      const startDate = new Date(parseInt(tahun), parseInt(bulan) - 1, 1);
      const endDate = new Date(parseInt(tahun), parseInt(bulan), 0);
      
      filter.tanggal = {
        gte: startDate,
        lte: endDate
      };
    }
    
    // Get total count for pagination
    const totalCount = await prisma.absensi.count({
      where: filter
    });
    
    // Get absensi data
    const absensiData = await prisma.absensi.findMany({
      where: filter,
      include: {
        lokasi: true
      },
      orderBy: {
        tanggal: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Format response
    const formattedData = absensiData.map(absensi => ({
      id: absensi.id,
      tanggal: absensi.tanggal,
      waktuAbsen: absensi.waktuAbsen,
      status: absensi.status,
      keterangan: absensi.keterangan,
      lokasi: absensi.lokasi ? absensi.lokasi.nama : null
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
 * Get siswa's today absensi
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaTodayAbsensi = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get siswa data
    const siswa = await prisma.siswa.findFirst({
      where: { userId }
    });
    
    if (!siswa) {
      throw new ApiError(404, 'Data siswa tidak ditemukan');
    }
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's absensi
    const absensi = await prisma.absensi.findFirst({
      where: {
        siswaId: siswa.id,
        tanggal: {
          equals: today
        }
      },
      include: {
        lokasi: true
      }
    });
    
    if (!absensi) {
      return res.json({
        status: 'success',
        data: null,
        message: 'Belum ada absensi hari ini'
      });
    }
    
    res.json({
      status: 'success',
      data: {
        id: absensi.id,
        tanggal: absensi.tanggal,
        waktuAbsen: absensi.waktuAbsen,
        status: absensi.status,
        keterangan: absensi.keterangan,
        lokasi: absensi.lokasi ? absensi.lokasi.nama : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get siswa's absensi summary
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getSiswaAbsensiSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bulan, tahun } = req.query;
    
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
    
    // Add month and year filter if specified
    if (bulan && tahun) {
      const startDate = new Date(parseInt(tahun), parseInt(bulan) - 1, 1);
      const endDate = new Date(parseInt(tahun), parseInt(bulan), 0);
      
      filter.tanggal = {
        gte: startDate,
        lte: endDate
      };
    }
    
    // Get absensi summary
    const absensiCount = await prisma.absensi.groupBy({
      by: ['status'],
      where: filter,
      _count: {
        status: true
      }
    });
    
    // Format response
    const summary = {
      hadir: 0,
      telat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0
    };
    
    absensiCount.forEach(item => {
      summary[item.status] = item._count.status;
    });
    
    // Calculate total
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    
    // Calculate percentage if total > 0
    const percentage = total > 0 ? {
      hadir: Math.round((summary.hadir / total) * 100),
      telat: Math.round((summary.telat / total) * 100),
      izin: Math.round((summary.izin / total) * 100),
      sakit: Math.round((summary.sakit / total) * 100),
      alpa: Math.round((summary.alpa / total) * 100)
    } : {
      hadir: 0,
      telat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0
    };
    
    res.json({
      status: 'success',
      data: {
        summary,
        total,
        percentage
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard data (admin)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getDashboardData = async (req, res, next) => {
  try {
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get total siswa
    const totalSiswa = await prisma.siswa.count();
    
    // Get today's absensi summary
    const todayAbsensi = await prisma.absensi.groupBy({
      by: ['status'],
      where: {
        tanggal: {
          equals: today
        }
      },
      _count: {
        status: true
      }
    });
    
    // Format today's absensi
    const todaySummary = {
      hadir: 0,
      telat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0
    };
    
    todayAbsensi.forEach(item => {
      todaySummary[item.status] = item._count.status;
    });
    
    // Get total absensi today
    const totalToday = Object.values(todaySummary).reduce((a, b) => a + b, 0);
    
    // Calculate belum absen
    const belumAbsen = totalSiswa - totalToday;
    
    // Get 7 days absensi trend
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      last7Days.push(date);
    }
    
    // Get absensi data for last 7 days
    const absensiTrend = await Promise.all(
      last7Days.map(async (date) => {
        const dayAbsensi = await prisma.absensi.groupBy({
          by: ['status'],
          where: {
            tanggal: {
              equals: date
            }
          },
          _count: {
            status: true
          }
        });
        
        const summary = {
          hadir: 0,
          telat: 0,
          izin: 0,
          sakit: 0,
          alpa: 0
        };
        
        dayAbsensi.forEach(item => {
          summary[item.status] = item._count.status;
        });
        
        return {
          tanggal: date.toISOString().split('T')[0],
          ...summary
        };
      })
    );
    
    // Get pending izin count
    const pendingIzin = await prisma.pengajuanIzin.count({
      where: {
        status: 'pending'
      }
    });
    
    // Get unread feedback count
    const unreadFeedback = await prisma.feedback.count({
      where: {
        status: 'unread'
      }
    });
    
    res.json({
      status: 'success',
      data: {
        totalSiswa,
        todaySummary,
        belumAbsen,
        absensiTrend,
        pendingIzin,
        unreadFeedback
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export absensi report
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.exportAbsensiReport = async (req, res, next) => {
  try {
    const { kelasId, tanggalMulai, tanggalSelesai, format = 'json' } = req.query;
    
    // Build filter
    const filter = {};
    
    if (tanggalMulai) {
      const startDate = new Date(tanggalMulai);
      startDate.setHours(0, 0, 0, 0);
      
      filter.tanggal = {
        gte: startDate
      };
    }
    
    if (tanggalSelesai) {
      const endDate = new Date(tanggalSelesai);
      endDate.setHours(23, 59, 59, 999);
      
      filter.tanggal = {
        ...filter.tanggal,
        lte: endDate
      };
    }
    
    // Add kelas filter if specified
    if (kelasId) {
      filter.siswa = {
        kelasId: parseInt(kelasId)
      };
    }
    
    // Get absensi data
    const absensiData = await prisma.absensi.findMany({
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
        lokasi: true
      },
      orderBy: [
        { tanggal: 'asc' },
        { siswa: { namaLengkap: 'asc' } }
      ]
    });
    
    // Format data
    const formattedData = absensiData.map(absensi => ({
      id: absensi.id,
      tanggal: absensi.tanggal.toISOString().split('T')[0],
      waktuAbsen: absensi.waktuAbsen ? absensi.waktuAbsen.toISOString() : null,
      nis: absensi.siswa.nis,
      namaSiswa: absensi.siswa.namaLengkap,
      kelas: absensi.siswa.kelas.nama,
      jurusan: absensi.siswa.kelas.jurusan.nama,
      status: absensi.status,
      keterangan: absensi.keterangan,
      lokasi: absensi.lokasi ? absensi.lokasi.nama : null
    }));
    
    // Return data based on format
    if (format === 'json') {
      return res.json({
        status: 'success',
        data: formattedData
      });
    }
    
    // For other formats, we would implement CSV/Excel export here
    // This is a placeholder for future implementation
    res.json({
      status: 'error',
      message: `Format ${format} belum didukung`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export absensi data sebagai file unduhan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.exportAbsensiData = async (req, res, next) => {
    try {
      const { kelasId, tanggalMulai, tanggalSelesai, format = 'csv' } = req.query;
      
      // Build filter
      const filter = {};
      
      if (tanggalMulai) {
        const startDate = new Date(tanggalMulai);
        startDate.setHours(0, 0, 0, 0);
        
        filter.tanggal = {
          gte: startDate
        };
      }
      
      if (tanggalSelesai) {
        const endDate = new Date(tanggalSelesai);
        endDate.setHours(23, 59, 59, 999);
        
        filter.tanggal = {
          ...filter.tanggal,
          lte: endDate
        };
      }
      
      if (kelasId) {
        filter.siswa = {
          kelasId: parseInt(kelasId)
        };
      }
      
      // Default ke CSV jika format tidak ditentukan atau format yang tidak didukung
      if (format.toLowerCase() === 'csv') {
        // Import service
        const exportService = require('../services/export.service');
        
        // Generate CSV
        const csvContent = await exportService.exportAbsensiToCSV(filter);
        
        // Format tanggal untuk nama file
        const dateStr = new Date().toISOString().split('T')[0];
        
        // Set header untuk download file
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="absensi-data-${dateStr}.csv"`);
        
        // Kirim response
        return res.send(csvContent);
      }
      
      // Jika format bukan CSV, gunakan exportAbsensiReport untuk JSON
      return this.exportAbsensiReport(req, res, next);
    } catch (error) {
      next(error);
    }
  };



/**
 * Helper function to convert time string to minutes
 * @param {String} timeString - Time string in format "HH:MM:SS"
 * @returns {Number} Minutes since midnight
 */
function parseTimeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

module.exports = exports;