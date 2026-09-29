const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { apiLimiter } = require('./middleware/rateLimiter');
const { cacheInvalidator } = require('./middleware/cache');
const errorHandler = require('./middleware/errorHandler');
const { apiVersionHeader, v1ErrorHandler } = require('./middleware/apiVersion');
const apiRoutes = require('./routes');

const app = express();

// Trust proxy chain: Cloudflare edge -> nginx -> node (2 hops).
// Required so req.ip is the real client IP for express-rate-limit;
// without this, ALL users share one rate-limit bucket and the API
// flaps 200/429 under normal multi-app traffic (incident 2026-09-28).
app.set('trust proxy', 2);

// Ensure uploads folder exists
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors());

// Gzip/deflate compression (scaling cycle-3): 1 KB threshold so small
// JSON payloads skip the CPU cost while list/discovery responses shrink.
app.use(compression({ threshold: 1024 }));

// Rate limiter
app.use(apiLimiter);

// Cache invalidator for mutation routes
app.use(cacheInvalidator);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files
app.use('/uploads', express.static(uploadDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API v1 routes (mounted BEFORE /api for proper prefix-match priority)
// Adds X-API-Version: v1 header and uses v1-scoped error envelope
app.use('/api/v1', apiVersionHeader, apiRoutes, v1ErrorHandler);

// API routes mounted at /api
app.use('/api', apiRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
