const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const { errorHandler } = require('../utils/error-handler');
const logger = require('../utils/logger');


// Initialize express app
const app = express();

// Apply security headers
app.use(helmet());



// Parse request body
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Enable CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Set static folder
const uploadsDir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(uploadsDir));

// API routes
const apiPrefix = process.env.API_PREFIX || '/api';

// Import routes
const authRoutes = require('../routes/auth.routes');
const adminRoutes = require('../routes/admin.routes');
const siswaRoutes = require('../routes/siswa.routes');
const indexRoutes = require('../routes/index');
const registerRoutes = require('../routes/register.routes');


// Apply routes
app.use(apiPrefix, indexRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/siswa`, siswaRoutes);
app.use(`${apiPrefix}/register`, registerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;