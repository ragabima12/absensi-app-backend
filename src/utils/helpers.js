/**
 * Helper utility functions for the application
 */

const moment = require('moment');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Format date to local Indonesian format
 * @param {Date|String} date - Date to format
 * @param {String} format - Format string (default: 'DD/MM/YYYY')
 * @returns {String} Formatted date string
 */
exports.formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return '';
  return moment(date).format(format);
};

/**
 * Format time to local Indonesian format
 * @param {Date|String} time - Time to format
 * @param {String} format - Format string (default: 'HH:mm')
 * @returns {String} Formatted time string
 */
exports.formatTime = (time, format = 'HH:mm') => {
  if (!time) return '';
  return moment(time).format(format);
};

/**
 * Format date and time
 * @param {Date|String} datetime - Datetime to format
 * @param {String} format - Format string (default: 'DD/MM/YYYY HH:mm')
 * @returns {String} Formatted datetime string
 */
exports.formatDateTime = (datetime, format = 'DD/MM/YYYY HH:mm') => {
  if (!datetime) return '';
  return moment(datetime).format(format);
};

/**
 * Get start and end date of the week
 * @param {Date} date - Date to get week range (default: today)
 * @returns {Object} Object with start and end dates of the week
 */
exports.getWeekRange = (date = new Date()) => {
  const start = moment(date).startOf('week').toDate();
  const end = moment(date).endOf('week').toDate();
  return { start, end };
};

/**
 * Get start and end date of the month
 * @param {Date} date - Date to get month range (default: today)
 * @returns {Object} Object with start and end dates of the month
 */
exports.getMonthRange = (date = new Date()) => {
  const start = moment(date).startOf('month').toDate();
  const end = moment(date).endOf('month').toDate();
  return { start, end };
};

/**
 * Generate a random string
 * @param {Number} length - Length of the string (default: 10)
 * @returns {String} Random string
 */
exports.generateRandomString = (length = 10) => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Generate a random password
 * @param {Number} length - Length of the password (default: 8)
 * @returns {String} Random password
 */
exports.generateRandomPassword = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  
  return password;
};

/**
 * Clean a filename by removing special characters
 * @param {String} filename - Filename to clean
 * @returns {String} Cleaned filename
 */
exports.cleanFilename = (filename) => {
  if (!filename) return '';
  // Replace special characters with underscore
  return filename
    .replace(/[^a-zA-Z0-9_\u0080-\uFFFF.-]/g, '_')
    .replace(/_{2,}/g, '_'); // Replace multiple underscores with one
};

/**
 * Get file extension
 * @param {String} filename - Filename
 * @returns {String} File extension
 */
exports.getFileExtension = (filename) => {
  if (!filename) return '';
  return path.extname(filename).toLowerCase();
};

/**
 * Check if file exists
 * @param {String} filePath - Path to file
 * @returns {Boolean} Whether file exists
 */
exports.fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
};

/**
 * Ensure directory exists, create if not
 * @param {String} dirPath - Path to directory
 * @returns {Boolean} Whether operation was successful
 */
exports.ensureDirectoryExists = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Calculate age from birth date
 * @param {Date|String} birthDate - Birth date
 * @returns {Number} Age in years
 */
exports.calculateAge = (birthDate) => {
  if (!birthDate) return 0;
  return moment().diff(moment(birthDate), 'years');
};

/**
 * Truncate text to a certain length
 * @param {String} text - Text to truncate
 * @param {Number} length - Maximum length (default: 100)
 * @param {String} suffix - Suffix to add if truncated (default: '...')
 * @returns {String} Truncated text
 */
exports.truncateText = (text, length = 100, suffix = '...') => {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + suffix;
};

/**
 * Parse time string to minutes since midnight
 * @param {String} timeString - Time string in format "HH:MM:SS" or "HH:MM"
 * @returns {Number} Minutes since midnight
 */
exports.parseTimeToMinutes = (timeString) => {
  if (!timeString) return 0;
  
  const parts = timeString.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  
  return hours * 60 + minutes;
};

/**
 * Format minutes since midnight to time string
 * @param {Number} minutes - Minutes since midnight
 * @param {Boolean} includeSeconds - Whether to include seconds (default: false)
 * @returns {String} Time string in format "HH:MM" or "HH:MM:SS"
 */
exports.formatMinutesToTime = (minutes, includeSeconds = false) => {
  if (isNaN(minutes)) return '';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(mins).padStart(2, '0');
  
  if (includeSeconds) {
    return `${formattedHours}:${formattedMinutes}:00`;
  }
  
  return `${formattedHours}:${formattedMinutes}`;
};

/**
 * Capitalize first letter of a string
 * @param {String} str - String to capitalize
 * @returns {String} Capitalized string
 */
exports.capitalizeFirstLetter = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Convert status to Indonesian
 * @param {String} status - Status in English
 * @returns {String} Status in Indonesian
 */
exports.translateStatus = (status) => {
  const translations = {
    'pending': 'Menunggu',
    'approved': 'Disetujui',
    'rejected': 'Ditolak',
    'hadir': 'Hadir',
    'telat': 'Terlambat',
    'izin': 'Izin',
    'sakit': 'Sakit',
    'alpa': 'Alpa',
    'unread': 'Belum Dibaca',
    'read': 'Dibaca',
    'processed': 'Diproses'
  };
  
  return translations[status] || status;
};

/**
 * Check if a date is today
 * @param {Date|String} date - Date to check
 * @returns {Boolean} Whether date is today
 */
exports.isToday = (date) => {
  if (!date) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate.getTime() === today.getTime();
};

/**
 * Check if a date is this week
 * @param {Date|String} date - Date to check
 * @returns {Boolean} Whether date is this week
 */
exports.isThisWeek = (date) => {
  if (!date) return false;
  return moment(date).isBetween(moment().startOf('week'), moment().endOf('week'), null, '[]');
};

/**
 * Check if a date is this month
 * @param {Date|String} date - Date to check
 * @returns {Boolean} Whether date is this month
 */
exports.isThisMonth = (date) => {
  if (!date) return false;
  return moment(date).isBetween(moment().startOf('month'), moment().endOf('month'), null, '[]');
};

module.exports = exports;