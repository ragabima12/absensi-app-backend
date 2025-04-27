const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const cronService = require('./services/cron.service');
const emailService = require('./services/email.service');



emailService.initEmailService();

// Load environment variables
dotenv.config();

// Make sure uploads directory exists
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Import app configuration
const app = require('./config/app');

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN ? process.env.SOCKET_CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

cronService.initCronJobs(io);

// Socket connection handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
  
  // More socket event handlers can be added here
});

// Add socket instance to app for use in routes/controllers
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`API available at: http://localhost:${PORT}${process.env.API_PREFIX || '/api'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  // Don't crash the server in production
  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }
});

// Export server for testing
module.exports = server;