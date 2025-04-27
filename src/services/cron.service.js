const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const notificationService = require('./notification.service');
const helpers = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Initialize cron jobs
 * @param {Object} io - Socket.IO instance for notifications
 */
exports.initCronJobs = (io) => {
  logger.info('Initializing cron jobs');
  
  // Daily attendance report (every day at 23:00)
  cron.schedule('0 23 * * *', () => {
    generateDailyAbsensiReport(io);
  });
  
  // Reminder for students who haven't done attendance (every weekday at 13:00)
  cron.schedule('0 13 * * 1-5', () => {
    sendAbsensiReminders(io);
  });
  
  // Auto-close expired izin requests (every day at 00:01)
  cron.schedule('1 0 * * *', () => {
    closeExpiredIzinRequests();
  });
  
  // Weekly attendance summary (every Friday at 18:00)
  cron.schedule('0 18 * * 5', () => {
    generateWeeklyAbsensiSummary(io);
  });
  
  // Monthly attendance report (1st day of each month at 07:00)
  cron.schedule('0 7 1 * *', () => {
    generateMonthlyAbsensiReport(io);
  });
  
  logger.info('Cron jobs initialized successfully');
};

/**
 * Generate daily attendance report
 * @param {Object} io - Socket.IO instance
 */
async function generateDailyAbsensiReport(io) {
  try {
    logger.info('Generating daily attendance report');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get summary of today's attendance
    const absensiSummary = await prisma.absensi.groupBy({
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
    
    // Format summary data
    const summary = {
      hadir: 0,
      telat: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      total: 0
    };
    
    absensiSummary.forEach(item => {
      summary[item.status] = item._count.status;
      summary.total += item._count.status;
    });
    
    // Get total number of active students
    const totalSiswa = await prisma.siswa.count({
      where: {
        user: {
          isActive: true
        }
      }
    });
    
    // Calculate missing attendance
    summary.belumAbsen = totalSiswa - summary.total;
    
    // Get attendance by kelas
    const kelasSummary = await prisma.$queryRaw`
      SELECT 
        k.id AS "kelasId", 
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(s.id) AS "totalSiswa",
        SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS "totalAbsensi",
        SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS "hadir",
        SUM(CASE WHEN a.status = 'telat' THEN 1 ELSE 0 END) AS "telat",
        SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END) AS "izin",
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS "sakit",
        SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) AS "alpa"
      FROM "kelas" k
      JOIN "jurusan" j ON k.jurusan_id = j.id
      LEFT JOIN "siswa" s ON s.kelas_id = k.id AND s.id IN (
        SELECT s2.id FROM "siswa" s2
        JOIN "users" u ON s2.user_id = u.id
        WHERE u.is_active = true
      )
      LEFT JOIN "absensi" a ON a.siswa_id = s.id AND a.tanggal = ${today}
      GROUP BY k.id, k.nama, j.nama
      ORDER BY j.nama, k.nama
    `;
    
    // Save report to database or send as notification
    logger.info(`Daily attendance report: ${JSON.stringify(summary)}`);
    
    // Notify admin through socket.io
    if (io) {
      notificationService.sendSocketNotification(io, 'report:daily', {
        date: today.toISOString().split('T')[0],
        summary,
        kelasSummary
      });
    }
    
    // Automatically mark students as 'alpa' if they haven't submitted attendance
    await markMissingStudentsAsAlpa(today);
    
    logger.info('Daily attendance report completed');
  } catch (error) {
    logger.error(`Error generating daily attendance report: ${error.message}`);
  }
}

/**
 * Send reminders to students who haven't done attendance
 * @param {Object} io - Socket.IO instance
 */
async function sendAbsensiReminders(io) {
  try {
    logger.info('Sending attendance reminders');
    
    await notificationService.sendAbsensiReminder(io);
    
    logger.info('Attendance reminders sent');
  } catch (error) {
    logger.error(`Error sending attendance reminders: ${error.message}`);
  }
}

/**
 * Auto-close expired izin requests
 */
async function closeExpiredIzinRequests() {
  try {
    logger.info('Closing expired izin requests');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find pending izin requests that are expired (end date is before today)
    const expiredRequests = await prisma.pengajuanIzin.findMany({
      where: {
        status: 'pending',
        tanggalSelesai: {
          lt: today
        }
      }
    });
    
    if (expiredRequests.length === 0) {
      logger.info('No expired izin requests found');
      return;
    }
    
    // Auto-close them
    const expiredIds = expiredRequests.map(request => request.id);
    
    await prisma.pengajuanIzin.updateMany({
      where: {
        id: {
          in: expiredIds
        }
      },
      data: {
        status: 'rejected',
        keterangan: 'Otomatis ditolak karena melewati batas waktu',
        approvedAt: new Date()
      }
    });
    
    logger.info(`Closed ${expiredRequests.length} expired izin requests`);
  } catch (error) {
    logger.error(`Error closing expired izin requests: ${error.message}`);
  }
}

/**
 * Generate weekly attendance summary
 * @param {Object} io - Socket.IO instance
 */
async function generateWeeklyAbsensiSummary(io) {
  try {
    logger.info('Generating weekly attendance summary');
    
    const weekRange = helpers.getWeekRange();
    
    // Get attendance data for the week by day
    const dailyData = [];
    
    for (let day = new Date(weekRange.start); day <= weekRange.end; day.setDate(day.getDate() + 1)) {
      const currentDay = new Date(day);
      
      // Skip weekends
      if (currentDay.getDay() === 0 || currentDay.getDay() === 6) {
        continue;
      }
      
      const daySummary = await prisma.absensi.groupBy({
        by: ['status'],
        where: {
          tanggal: {
            equals: currentDay
          }
        },
        _count: {
          status: true
        }
      });
      
      const summary = {
        date: currentDay.toISOString().split('T')[0],
        day: currentDay.toLocaleDateString('id-ID', { weekday: 'long' }),
        hadir: 0,
        telat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
      
      daySummary.forEach(item => {
        summary[item.status] = item._count.status;
        summary.total += item._count.status;
      });
      
      dailyData.push(summary);
    }
    
    // Get weekly summary by kelas
    const kelasSummary = await prisma.$queryRaw`
      SELECT 
        k.id AS "kelasId", 
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(DISTINCT s.id) AS "totalSiswa",
        SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS "hadir",
        SUM(CASE WHEN a.status = 'telat' THEN 1 ELSE 0 END) AS "telat",
        SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END) AS "izin",
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS "sakit",
        SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) AS "alpa"
      FROM "kelas" k
      JOIN "jurusan" j ON k.jurusan_id = j.id
      LEFT JOIN "siswa" s ON s.kelas_id = k.id
      LEFT JOIN "absensi" a ON a.siswa_id = s.id 
        AND a.tanggal >= ${weekRange.start}
        AND a.tanggal <= ${weekRange.end}
      GROUP BY k.id, k.nama, j.nama
      ORDER BY j.nama, k.nama
    `;
    
    // Get students with high absence rate
    const studentsWithHighAbsence = await prisma.$queryRaw`
      SELECT 
        s.id AS "siswaId",
        s.nama_lengkap AS "namaSiswa",
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(a.id) AS "totalAbsensi",
        SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) AS "totalAlpa",
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS "totalSakit",
        SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END) AS "totalIzin"
      FROM "siswa" s
      JOIN "kelas" k ON s.kelas_id = k.id
      JOIN "jurusan" j ON k.jurusan_id = j.id
      LEFT JOIN "absensi" a ON a.siswa_id = s.id 
        AND a.tanggal >= ${weekRange.start}
        AND a.tanggal <= ${weekRange.end}
      GROUP BY s.id, s.nama_lengkap, k.nama, j.nama
      HAVING SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) >= 2
      ORDER BY "totalAlpa" DESC
    `;
    
    // Send weekly report
    if (io) {
      notificationService.sendSocketNotification(io, 'report:weekly', {
        startDate: weekRange.start.toISOString().split('T')[0],
        endDate: weekRange.end.toISOString().split('T')[0],
        dailyData,
        kelasSummary,
        studentsWithHighAbsence
      });
    }
    
    logger.info('Weekly attendance summary completed');
  } catch (error) {
    logger.error(`Error generating weekly attendance summary: ${error.message}`);
  }
}

/**
 * Generate monthly attendance report
 * @param {Object} io - Socket.IO instance
 */
async function generateMonthlyAbsensiReport(io) {
  try {
    logger.info('Generating monthly attendance report');
    
    // Get previous month's range
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthRange = helpers.getMonthRange(previousMonth);
    
    const monthName = previousMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    
    // Get monthly summary by kelas
    const kelasSummary = await prisma.$queryRaw`
      SELECT 
        k.id AS "kelasId", 
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(DISTINCT s.id) AS "totalSiswa",
        SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS "hadir",
        SUM(CASE WHEN a.status = 'telat' THEN 1 ELSE 0 END) AS "telat",
        SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END) AS "izin",
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS "sakit",
        SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) AS "alpa",
        COUNT(a.id) AS "totalAbsensi"
      FROM "kelas" k
      JOIN "jurusan" j ON k.jurusan_id = j.id
      LEFT JOIN "siswa" s ON s.kelas_id = k.id
      LEFT JOIN "absensi" a ON a.siswa_id = s.id 
        AND a.tanggal >= ${monthRange.start}
        AND a.tanggal <= ${monthRange.end}
      GROUP BY k.id, k.nama, j.nama
      ORDER BY j.nama, k.nama
    `;
    
    // Get students with perfect attendance
    const studentsWithPerfectAttendance = await prisma.$queryRaw`
      WITH business_days AS (
        SELECT generate_series(
          ${monthRange.start}::date, 
          ${monthRange.end}::date, 
          '1 day'::interval
        )::date AS date
        WHERE EXTRACT(DOW FROM generate_series) NOT IN (0, 6) -- Exclude weekends
      ),
      expected_days AS (
        SELECT COUNT(*) AS count FROM business_days
      )
      SELECT 
        s.id AS "siswaId",
        s.nama_lengkap AS "namaSiswa",
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(a.id) AS "totalHadir"
      FROM "siswa" s
      JOIN "kelas" k ON s.kelas_id = k.id
      JOIN "jurusan" j ON k.jurusan_id = j.id
      JOIN "absensi" a ON a.siswa_id = s.id 
        AND a.tanggal >= ${monthRange.start}
        AND a.tanggal <= ${monthRange.end}
        AND a.status = 'hadir'
      CROSS JOIN expected_days
      GROUP BY s.id, s.nama_lengkap, k.nama, j.nama, expected_days.count
      HAVING COUNT(a.id) = expected_days.count
      ORDER BY k.nama, s.nama_lengkap
    `;
    
    // Get students with high absence rate
    const studentsWithHighAbsence = await prisma.$queryRaw`
      SELECT 
        s.id AS "siswaId",
        s.nama_lengkap AS "namaSiswa",
        k.nama AS "kelasNama",
        j.nama AS "jurusanNama",
        COUNT(a.id) AS "totalAbsensi",
        SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) AS "totalAlpa",
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS "totalSakit",
        SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END) AS "totalIzin"
      FROM "siswa" s
      JOIN "kelas" k ON s.kelas_id = k.id
      JOIN "jurusan" j ON k.jurusan_id = j.id
      LEFT JOIN "absensi" a ON a.siswa_id = s.id 
        AND a.tanggal >= ${monthRange.start}
        AND a.tanggal <= ${monthRange.end}
      GROUP BY s.id, s.nama_lengkap, k.nama, j.nama
      HAVING SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END) >= 5
      ORDER BY "totalAlpa" DESC
    `;
    
    // Send monthly report
    if (io) {
      notificationService.sendSocketNotification(io, 'report:monthly', {
        month: monthName,
        startDate: monthRange.start.toISOString().split('T')[0],
        endDate: monthRange.end.toISOString().split('T')[0],
        kelasSummary,
        studentsWithPerfectAttendance,
        studentsWithHighAbsence
      });
    }
    
    logger.info('Monthly attendance report completed');
  } catch (error) {
    logger.error(`Error generating monthly attendance report: ${error.message}`);
  }
}

/**
 * Mark students as 'alpa' if they haven't submitted attendance
 * @param {Date} date - Date to check
 */
async function markMissingStudentsAsAlpa(date) {
  try {
    logger.info(`Marking missing students as 'alpa' for ${date.toISOString().split('T')[0]}`);
    
    // Skip weekends
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      logger.info('Skipping weekend day');
      return;
    }
    
    // Get all active students
    const students = await prisma.siswa.findMany({
      where: {
        user: {
          isActive: true
        }
      },
      include: {
        kelas: true
      }
    });
    
    // Get students who have already submitted attendance for the date
    const attendanceRecords = await prisma.absensi.findMany({
      where: {
        tanggal: {
          equals: date
        }
      },
      select: {
        siswaId: true
      }
    });
    
    const studentsWithAttendance = new Set(attendanceRecords.map(record => record.siswaId));
    
    // Filter students without attendance
    const studentsWithoutAttendance = students.filter(
      student => !studentsWithAttendance.has(student.id)
    );
    
    if (studentsWithoutAttendance.length === 0) {
      logger.info('No missing students found');
      return;
    }
    
    // Check for approved izin for each student
    const absensiRecords = [];
    
    for (const student of studentsWithoutAttendance) {
      // Check if student has approved izin for this date
      const izin = await prisma.pengajuanIzin.findFirst({
        where: {
          siswaId: student.id,
          status: 'approved',
          tanggalMulai: {
            lte: date
          },
          tanggalSelesai: {
            gte: date
          }
        },
        include: {
          jenisIzin: true
        }
      });
      
      // Determine status (alpa or izin/sakit based on izin)
      let status = 'alpa';
      let keterangan = 'Tidak melakukan absensi';
      
      if (izin) {
        status = izin.jenisIzin.nama.toLowerCase() === 'sakit' ? 'sakit' : 'izin';
        keterangan = `${izin.jenisIzin.nama}: ${izin.alasan}`;
      }
      
      // Add to batch
      absensiRecords.push({
        siswaId: student.id,
        tanggal: date,
        waktuAbsen: new Date(),
        status,
        keterangan
      });
    }
    
    // Create absensi records in batch
    if (absensiRecords.length > 0) {
      await prisma.absensi.createMany({
        data: absensiRecords
      });
      
      logger.info(`Marked ${absensiRecords.length} students as absent`);
    }
  } catch (error) {
    logger.error(`Error marking missing students as absent: ${error.message}`);
  }
}

module.exports = exports;