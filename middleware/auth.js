const admin = require('../config/firebase');
const { query } = require('../db');

/**
 * Middleware to authenticate requests using Firebase ID tokens
 * Attaches authenticated user object from PostgreSQL to req.user
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer <token>.',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized: Bearer token is empty.',
      });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired Firebase ID token.',
        details: err.message,
      });
    }

    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({
        error: 'Unauthorized: Token payload is missing uid.',
      });
    }

    // Look up user in PostgreSQL
    const result = await query('SELECT * FROM users WHERE firebase_uid = $1', [decodedToken.uid]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'User not found. Please complete registration via /api/auth/verify.',
      });
    }

    req.user = result.rows[0];
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error during authentication.',
    });
  }
}

module.exports = {
  authenticateToken,
};
