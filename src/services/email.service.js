const nodemailer = require('nodemailer');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

// Konfigurasi transporter email
let transporter;

/**
 * Initialize email service
 */
exports.initEmailService = () => {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    logger.info('Email service initialized');
  } catch (error) {
    logger.error(`Email service initialization failed: ${error.message}`);
  }
};

/**
 * Send email
 * @param {Object} options - Email options (to, subject, text, html)
 * @returns {Promise} - Promise with email info
 */
exports.sendEmail = async (options) => {
  try {
    if (!transporter) {
      throw new Error('Email service not initialized');
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Absensi App" <absensi@yourdomain.com>',
      to: options.to,
      subject: options.subject,
      text: options.text || '',
      html: options.html || ''
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw new ApiError(500, 'Gagal mengirim email');
  }
};