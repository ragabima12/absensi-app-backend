const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Send notification through Socket.IO
 * @param {Object} io - Socket.IO instance
 * @param {String} eventName - Event name
 * @param {Object} data - Notification data
 */
exports.sendSocketNotification = (io, eventName, data) => {
  if (!io) {
    logger.warn('Socket.IO instance not available for notifications');
    return;
  }
  
  try {
    io.emit(eventName, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Socket notification sent: ${eventName}`);
  } catch (error) {
    logger.error(`Error sending socket notification: ${error.message}`);
  }
};

/**
 * Send targeted notification to specific user
 * @param {Object} io - Socket.IO instance
 * @param {String} userId - User ID
 * @param {String} eventName - Event name
 * @param {Object} data - Notification data
 */
exports.sendTargetedNotification = (io, userId, eventName, data) => {
  if (!io) {
    logger.warn('Socket.IO instance not available for targeted notifications');
    return;
  }
  
  try {
    // Get all active socket connections for user
    const userSockets = Object.values(io.sockets.connected).filter(
      socket => socket.userId === userId
    );
    
    if (userSockets.length === 0) {
      logger.info(`No active connections for user ${userId}`);
      return;
    }
    
    // Send notification to all user's active connections
    userSockets.forEach(socket => {
      socket.emit(eventName, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
    
    logger.info(`Targeted notification sent to user ${userId}: ${eventName}`);
  } catch (error) {
    logger.error(`Error sending targeted notification: ${error.message}`);
  }
};

/**
 * Send approval notification to siswa when their izin is processed
 * @param {Object} io - Socket.IO instance
 * @param {Number} pengajuanIzinId - Pengajuan izin ID
 * @param {String} status - Approval status ('approved' or 'rejected')
 * @param {String} keterangan - Approval or rejection reason
 */
exports.sendIzinProcessedNotification = async (io, pengajuanIzinId, status, keterangan) => {
  try {
    const pengajuanIzin = await prisma.pengajuanIzin.findUnique({
      where: { id: parseInt(pengajuanIzinId) },
      include: {
        siswa: {
          include: {
            user: true
          }
        },
        jenisIzin: true,
        admin: true
      }
    });
    
    if (!pengajuanIzin) {
      logger.warn(`Cannot send notification: Pengajuan izin ${pengajuanIzinId} not found`);
      return;
    }
    
    const eventName = status === 'approved' ? 'izin:approved' : 'izin:rejected';
    
    const notificationData = {
      id: pengajuanIzin.id,
      jenisIzin: pengajuanIzin.jenisIzin.nama,
      tanggalMulai: pengajuanIzin.tanggalMulai,
      tanggalSelesai: pengajuanIzin.tanggalSelesai,
      status,
      keterangan,
      admin: pengajuanIzin.admin ? {
        id: pengajuanIzin.admin.id,
        nama: pengajuanIzin.admin.namaLengkap
      } : null
    };
    
    // Send to all connections (admin dashboard)
    this.sendSocketNotification(io, eventName, notificationData);
    
    // Send targeted notification to the student
    if (pengajuanIzin.siswa && pengajuanIzin.siswa.user) {
      this.sendTargetedNotification(
        io, 
        pengajuanIzin.siswa.user.id, 
        'izin:status-updated', 
        notificationData
      );
    }
  } catch (error) {
    logger.error(`Error sending izin processed notification: ${error.message}`);
  }
};

/**
 * Send notification for new absensi
 * @param {Object} io - Socket.IO instance
 * @param {Number} absensiId - Absensi ID
 */
exports.sendNewAbsensiNotification = async (io, absensiId) => {
  try {
    const absensi = await prisma.absensi.findUnique({
      where: { id: parseInt(absensiId) },
      include: {
        siswa: {
          include: {
            kelas: true
          }
        },
        lokasi: true
      }
    });
    
    if (!absensi) {
      logger.warn(`Cannot send notification: Absensi ${absensiId} not found`);
      return;
    }
    
    const notificationData = {
      id: absensi.id,
      siswa: {
        id: absensi.siswa.id,
        nama: absensi.siswa.namaLengkap,
        kelas: absensi.siswa.kelas.nama
      },
      status: absensi.status,
      waktu: absensi.waktuAbsen,
      lokasi: absensi.lokasi ? absensi.lokasi.nama : null
    };
    
    // Send to all connections (admin dashboard)
    this.sendSocketNotification(io, 'absensi:new', notificationData);
  } catch (error) {
    logger.error(`Error sending new absensi notification: ${error.message}`);
  }
};

/**
 * Send notification for new feedback
 * @param {Object} io - Socket.IO instance
 * @param {Number} feedbackId - Feedback ID
 */
exports.sendNewFeedbackNotification = async (io, feedbackId) => {
  try {
    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(feedbackId) },
      include: {
        siswa: true
      }
    });
    
    if (!feedback) {
      logger.warn(`Cannot send notification: Feedback ${feedbackId} not found`);
      return;
    }
    
    const notificationData = {
      id: feedback.id,
      judul: feedback.judul,
      isAnonymous: feedback.isAnonymous,
      siswa: feedback.isAnonymous ? null : {
        id: feedback.siswa.id,
        nama: feedback.siswa.namaLengkap
      },
      createdAt: feedback.createdAt
    };
    
    // Send to all connections (admin dashboard)
    this.sendSocketNotification(io, 'feedback:new', notificationData);
  } catch (error) {
    logger.error(`Error sending new feedback notification: ${error.message}`);
  }
};

/**
 * Send daily reminder for students who haven't done attendance
 * @param {Object} io - Socket.IO instance
 * @param {String} kelasId - Optional kelas ID to filter students
 */
exports.sendAbsensiReminder = async (io, kelasId = null) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Build filter for siswa
    const filter = {};
    
    if (kelasId) {
      filter.kelasId = parseInt(kelasId);
    }
    
    // Get all active students
    const siswa = await prisma.siswa.findMany({
      where: {
        ...filter,
        user: {
          isActive: true
        }
      },
      include: {
        user: true,
        kelas: true
      }
    });
    
    // Get students who have already submitted attendance today
    const absensiToday = await prisma.absensi.findMany({
      where: {
        tanggal: {
          equals: today
        }
      },
      select: {
        siswaId: true
      }
    });
    
    const siswaWithAbsensi = new Set(absensiToday.map(a => a.siswaId));
    
    // Filter students who haven't submitted attendance
    const siswaWithoutAbsensi = siswa.filter(s => !siswaWithAbsensi.has(s.id));
    
    // Send reminders
    for (const s of siswaWithoutAbsensi) {
      if (s.user) {
        this.sendTargetedNotification(
          io,
          s.user.id,
          'absensi:reminder',
          {
            message: 'Jangan lupa untuk melakukan absensi hari ini',
            tanggal: today.toISOString().split('T')[0]
          }
        );
      }
    }
    
    logger.info(`Sent absensi reminders to ${siswaWithoutAbsensi.length} students`);
  } catch (error) {
    logger.error(`Error sending absensi reminders: ${error.message}`);
  }
};

module.exports = exports;