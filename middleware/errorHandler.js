/**
 * Global centralized error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled application error:', err);

  // Multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: `File upload error: ${err.message}`,
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
