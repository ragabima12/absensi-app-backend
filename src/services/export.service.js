const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Export absensi data to CSV format
 * @param {Object} filter - Filter criteria for absensi data
 * @returns {String} CSV content as string
 */
exports.exportAbsensiToCSV = async (filter = {}) => {
  try {
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
    
    // Format data for CSV
    const csvRows = [];
    
    // Add headers
    csvRows.push([
      'No',
      'Tanggal',
      'Waktu',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Jurusan',
      'Status',
      'Lokasi',
      'Keterangan'
    ].join(','));
    
    // Add data rows
    absensiData.forEach((absensi, index) => {
      const row = [
        index + 1,
        absensi.tanggal.toISOString().split('T')[0],
        absensi.waktuAbsen ? absensi.waktuAbsen.toISOString().split('T')[1].substring(0, 8) : '',
        absensi.siswa.nis || '',
        `"${absensi.siswa.namaLengkap.replace(/"/g, '""')}"`,
        absensi.siswa.kelas.nama,
        absensi.siswa.kelas.jurusan.nama,
        helpers.translateStatus(absensi.status),
        absensi.lokasi ? absensi.lokasi.nama : '',
        `"${(absensi.keterangan || '').replace(/"/g, '""')}"`
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error exporting absensi to CSV: ${error.message}`);
    throw error;
  }
};

/**
 * Export izin data to CSV format
 * @param {Object} filter - Filter criteria for izin data
 * @returns {String} CSV content as string
 */
exports.exportIzinToCSV = async (filter = {}) => {
  try {
    // Get izin data
    const izinData = await prisma.pengajuanIzin.findMany({
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
      orderBy: [
        { createdAt: 'desc' }
      ]
    });
    
    // Format data for CSV
    const csvRows = [];
    
    // Add headers
    csvRows.push([
      'No',
      'Tanggal Pengajuan',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Jurusan',
      'Jenis Izin',
      'Dari Tanggal',
      'Sampai Tanggal',
      'Status',
      'Disetujui/Ditolak Oleh',
      'Tanggal Persetujuan',
      'Alasan'
    ].join(','));
    
    // Add data rows
    izinData.forEach((izin, index) => {
      const row = [
        index + 1,
        izin.createdAt.toISOString().split('T')[0],
        izin.siswa.nis || '',
        `"${izin.siswa.namaLengkap.replace(/"/g, '""')}"`,
        izin.siswa.kelas.nama,
        izin.siswa.kelas.jurusan.nama,
        izin.jenisIzin.nama,
        izin.tanggalMulai.toISOString().split('T')[0],
        izin.tanggalSelesai.toISOString().split('T')[0],
        helpers.translateStatus(izin.status),
        izin.admin ? izin.admin.namaLengkap : '',
        izin.approvedAt ? izin.approvedAt.toISOString().split('T')[0] : '',
        `"${(izin.alasan || '').replace(/"/g, '""')}"`
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error exporting izin to CSV: ${error.message}`);
    throw error;
  }
};

/**
 * Export siswa data to CSV format
 * @param {Object} filter - Filter criteria for siswa data
 * @returns {String} CSV content as string
 */
exports.exportSiswaToCSV = async (filter = {}) => {
  try {
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
      orderBy: [
        { kelas: { jurusan: { nama: 'asc' } } },
        { kelas: { nama: 'asc' } },
        { namaLengkap: 'asc' }
      ]
    });
    
    // Format data for CSV
    const csvRows = [];
    
    // Add headers
    csvRows.push([
      'No',
      'NIS',
      'Nama Lengkap',
      'Jenis Kelamin',
      'Tanggal Lahir',
      'Kelas',
      'Jurusan',
      'Alamat',
      'Nomor Telepon',
      'Username',
      'Email',
      'Status Akun',
      'Face Data'
    ].join(','));
    
    // Add data rows
    siswaData.forEach((siswa, index) => {
      const row = [
        index + 1,
        siswa.nis || '',
        `"${siswa.namaLengkap.replace(/"/g, '""')}"`,
        siswa.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
        siswa.tanggalLahir ? siswa.tanggalLahir.toISOString().split('T')[0] : '',
        siswa.kelas.nama,
        siswa.kelas.jurusan.nama,
        `"${(siswa.alamat || '').replace(/"/g, '""')}"`,
        siswa.nomorTelepon || '',
        siswa.user.username,
        siswa.user.email || '',
        siswa.user.isActive ? 'Aktif' : 'Tidak Aktif',
        siswa.faceData ? 'Terdaftar' : 'Belum Terdaftar'
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error exporting siswa to CSV: ${error.message}`);
    throw error;
  }
};

/**
 * Generate weekly report for a class
 * @param {Number} kelasId - Kelas ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {String} CSV content as string
 */
exports.generateWeeklyReportByKelas = async (kelasId, startDate, endDate) => {
  try {
    // Validate dates
    if (!startDate || !endDate) {
      const weekRange = helpers.getWeekRange();
      startDate = weekRange.start;
      endDate = weekRange.end;
    }
    
    // Get kelas details
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(kelasId) },
      include: {
        jurusan: true
      }
    });
    
    if (!kelas) {
      throw new Error(`Kelas with ID ${kelasId} not found`);
    }
    
    // Get all siswa in the kelas
    const siswaList = await prisma.siswa.findMany({
      where: {
        kelasId: parseInt(kelasId),
        user: {
          isActive: true
        }
      },
      orderBy: {
        namaLengkap: 'asc'
      }
    });
    
    // Get dates between start and end date (excluding weekends)
    const dates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        dates.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Get all absensi records for the kelas in the date range
    const absensiRecords = await prisma.absensi.findMany({
      where: {
        siswa: {
          kelasId: parseInt(kelasId)
        },
        tanggal: {
          gte: startDate,
          lte: endDate
        }
      }
    });
    
    // Create a map for quick lookup
    const absensiMap = {};
    absensiRecords.forEach(record => {
      const dateKey = record.tanggal.toISOString().split('T')[0];
      if (!absensiMap[record.siswaId]) {
        absensiMap[record.siswaId] = {};
      }
      absensiMap[record.siswaId][dateKey] = record.status;
    });
    
    // Format data for CSV
    const csvRows = [];
    
    // Add report header
    csvRows.push(`"Laporan Absensi Mingguan"`);
    csvRows.push(`"Kelas: ${kelas.nama} ${kelas.jurusan.nama}"`);
    csvRows.push(`"Periode: ${helpers.formatDate(startDate)} - ${helpers.formatDate(endDate)}"`);
    csvRows.push('');
    
    // Add table headers
    const headers = ['No', 'NIS', 'Nama Siswa'];
    dates.forEach(date => {
      headers.push(helpers.formatDate(date));
    });
    headers.push('Hadir', 'Telat', 'Izin', 'Sakit', 'Alpa', 'Total');
    
    csvRows.push(headers.join(','));
    
    // Add data rows
    siswaList.forEach((siswa, index) => {
      const row = [
        index + 1,
        siswa.nis || '',
        `"${siswa.namaLengkap.replace(/"/g, '""')}"`
      ];
      
      // Add status for each date
      let totalHadir = 0;
      let totalTelat = 0;
      let totalIzin = 0;
      let totalSakit = 0;
      let totalAlpa = 0;
      
      dates.forEach(date => {
        const dateKey = date.toISOString().split('T')[0];
        const status = absensiMap[siswa.id] && absensiMap[siswa.id][dateKey] 
          ? absensiMap[siswa.id][dateKey] 
          : '';
        
        row.push(status ? helpers.translateStatus(status) : '');
        
        // Count status
        if (status === 'hadir') totalHadir++;
        if (status === 'telat') totalTelat++;
        if (status === 'izin') totalIzin++;
        if (status === 'sakit') totalSakit++;
        if (status === 'alpa') totalAlpa++;
      });
      
      // Add summary columns
      row.push(totalHadir);
      row.push(totalTelat);
      row.push(totalIzin);
      row.push(totalSakit);
      row.push(totalAlpa);
      row.push(totalHadir + totalTelat + totalIzin + totalSakit + totalAlpa);
      
      csvRows.push(row.join(','));
    });
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error generating weekly report by kelas: ${error.message}`);
    throw error;
  }
};

/**
 * Generate monthly report for a class
 * @param {Number} kelasId - Kelas ID
 * @param {Number} month - Month (1-12)
 * @param {Number} year - Year
 * @returns {String} CSV content as string
 */
exports.generateMonthlyReportByKelas = async (kelasId, month, year) => {
  try {
    // Validate month and year
    if (!month || !year) {
      const now = new Date();
      month = now.getMonth() + 1; // JavaScript months are 0-based
      year = now.getFullYear();
    }
    
    // Create date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    
    // Get kelas details
    const kelas = await prisma.kelas.findUnique({
      where: { id: parseInt(kelasId) },
      include: {
        jurusan: true
      }
    });
    
    if (!kelas) {
      throw new Error(`Kelas with ID ${kelasId} not found`);
    }
    
    // Get all siswa in the kelas
    const siswaList = await prisma.siswa.findMany({
      where: {
        kelasId: parseInt(kelasId),
        user: {
          isActive: true
        }
      },
      orderBy: {
        namaLengkap: 'asc'
      }
    });
    
    // Get all absensi records for the kelas in the month
    const absensiRecords = await prisma.absensi.findMany({
      where: {
        siswa: {
          kelasId: parseInt(kelasId)
        },
        tanggal: {
          gte: startDate,
          lte: endDate
        }
      }
    });
    
    // Create summary by student
    const summary = {};
    siswaList.forEach(siswa => {
      summary[siswa.id] = {
        siswa,
        hadir: 0,
        telat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
    });
    
    // Calculate statistics
    absensiRecords.forEach(record => {
      if (summary[record.siswaId]) {
        summary[record.siswaId][record.status]++;
        summary[record.siswaId].total++;
      }
    });
    
    // Format data for CSV
    const csvRows = [];
    
    // Add report header
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    csvRows.push(`"Laporan Absensi Bulanan"`);
    csvRows.push(`"Kelas: ${kelas.nama} ${kelas.jurusan.nama}"`);
    csvRows.push(`"Bulan: ${monthName}"`);
    csvRows.push('');
    
    // Add table headers
    csvRows.push([
      'No',
      'NIS',
      'Nama Siswa',
      'Hadir',
      'Telat',
      'Izin',
      'Sakit',
      'Alpa',
      'Total',
      'Persentase Kehadiran'
    ].join(','));
    
    // Calculate business days in the month
    const businessDays = getBusinessDaysInMonth(month, year);
    
    // Add data rows
    Object.values(summary).forEach((item, index) => {
      const { siswa, hadir, telat, izin, sakit, alpa, total } = item;
      const attendance = hadir + telat; // Consider telat as present
      const attendancePercentage = businessDays > 0 
        ? Math.round((attendance / businessDays) * 100) 
        : 0;
      
      const row = [
        index + 1,
        siswa.nis || '',
        `"${siswa.namaLengkap.replace(/"/g, '""')}"`,
        hadir,
        telat,
        izin,
        sakit,
        alpa,
        total,
        `${attendancePercentage}%`
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Add summary footer
    const totalStudents = siswaList.length;
    const totalPresent = Object.values(summary).reduce((acc, item) => acc + item.hadir, 0);
    const totalLate = Object.values(summary).reduce((acc, item) => acc + item.telat, 0);
    const totalIzin = Object.values(summary).reduce((acc, item) => acc + item.izin, 0);
    const totalSakit = Object.values(summary).reduce((acc, item) => acc + item.sakit, 0);
    const totalAlpa = Object.values(summary).reduce((acc, item) => acc + item.alpa, 0);
    const totalAll = totalPresent + totalLate + totalIzin + totalSakit + totalAlpa;
    const overallAttendance = businessDays * totalStudents > 0 
      ? Math.round(((totalPresent + totalLate) / (businessDays * totalStudents)) * 100) 
      : 0;
    
    csvRows.push('');
    csvRows.push(`"Total","","${totalStudents} Siswa",${totalPresent},${totalLate},${totalIzin},${totalSakit},${totalAlpa},${totalAll},"${overallAttendance}%"`);
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error generating monthly report by kelas: ${error.message}`);
    throw error;
  }
};

/**
 * Get number of business days in a month (excluding weekends)
 * @param {Number} month - Month (1-12)
 * @param {Number} year - Year
 * @returns {Number} Number of business days
 */
function getBusinessDaysInMonth(month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  let count = 0;
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return count;
}

/**
 * Generate student personal attendance report
 * @param {Number} siswaId - Siswa ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {String} CSV content as string
 */
exports.generateSiswaAttendanceReport = async (siswaId, startDate, endDate) => {
  try {
    // Get siswa details
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(siswaId) },
      include: {
        kelas: {
          include: {
            jurusan: true
          }
        }
      }
    });
    
    if (!siswa) {
      throw new Error(`Siswa with ID ${siswaId} not found`);
    }
    
    // Get absensi records
    const absensiRecords = await prisma.absensi.findMany({
      where: {
        siswaId: parseInt(siswaId),
        tanggal: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        lokasi: true
      },
      orderBy: {
        tanggal: 'asc'
      }
    });
    
    // Format data for CSV
    const csvRows = [];
    
    // Add report header
    csvRows.push(`"Laporan Absensi Siswa"`);
    csvRows.push(`"Nama: ${siswa.namaLengkap}"`);
    csvRows.push(`"NIS: ${siswa.nis || '-'}"`);
    csvRows.push(`"Kelas: ${siswa.kelas.nama} ${siswa.kelas.jurusan.nama}"`);
    csvRows.push(`"Periode: ${helpers.formatDate(startDate)} - ${helpers.formatDate(endDate)}"`);
    csvRows.push('');
    
    // Add table headers
    csvRows.push([
      'No',
      'Tanggal',
      'Hari',
      'Waktu Absen',
      'Status',
      'Lokasi',
      'Keterangan'
    ].join(','));
    
    // Add data rows
    absensiRecords.forEach((record, index) => {
      const date = new Date(record.tanggal);
      const day = date.toLocaleDateString('id-ID', { weekday: 'long' });
      
      const row = [
        index + 1,
        helpers.formatDate(record.tanggal),
        day,
        record.waktuAbsen ? helpers.formatTime(record.waktuAbsen) : '-',
        helpers.translateStatus(record.status),
        record.lokasi ? record.lokasi.nama : '-',
        `"${(record.keterangan || '').replace(/"/g, '""')}"`
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Calculate summary
    const totalDays = absensiRecords.length;
    const hadir = absensiRecords.filter(r => r.status === 'hadir').length;
    const telat = absensiRecords.filter(r => r.status === 'telat').length;
    const izin = absensiRecords.filter(r => r.status === 'izin').length;
    const sakit = absensiRecords.filter(r => r.status === 'sakit').length;
    const alpa = absensiRecords.filter(r => r.status === 'alpa').length;
    
    const attendance = hadir + telat; // Consider telat as present
    const attendancePercentage = totalDays > 0 
      ? Math.round((attendance / totalDays) * 100) 
      : 0;
    
    // Add summary
    csvRows.push('');
    csvRows.push(`"Ringkasan Absensi:"`);
    csvRows.push(`"Hadir: ${hadir} hari"`);
    csvRows.push(`"Telat: ${telat} hari"`);
    csvRows.push(`"Izin: ${izin} hari"`);
    csvRows.push(`"Sakit: ${sakit} hari"`);
    csvRows.push(`"Alpa: ${alpa} hari"`);
    csvRows.push(`"Total: ${totalDays} hari"`);
    csvRows.push(`"Persentase Kehadiran: ${attendancePercentage}%"`);
    
    // Join rows with newline
    return csvRows.join('\n');
  } catch (error) {
    logger.error(`Error generating siswa attendance report: ${error.message}`);
    throw error;
  }
};

module.exports = exports;