/**
 * Middleware that adds X-API-Version header for v1 routes
 * and provides a v1-scoped error handler.
 */

function apiVersionHeader(req, res, next) {
  res.setHeader('X-API-Version', 'v1');
  next();
}

/**
 * v1-scoped error handler: produces a standard envelope
 * { error, code, details } and does NOT bleed into /api/*
 */
function v1ErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    details: err.details || null,
  });
}

module.exports = { apiVersionHeader, v1ErrorHandler };
