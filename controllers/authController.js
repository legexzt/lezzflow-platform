const admin = require('../config/firebase');
const { query } = require('../db');

const ALLOWED_ROLES = ['seller', 'customer', 'partner', 'admin'];

/**
 * POST /api/auth/verify
 * Body: { idToken, role, name, phone }
 * Verifies Firebase ID token, upserts user in database, returns user and role.
 */
async function verifyAuth(req, res, next) {
  try {
    const { idToken, role, name, phone } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({
        error: 'Invalid or expired Firebase ID token',
        details: err.message,
      });
    }

    const firebaseUid = decodedToken.uid;
    const resolvedName = name || decodedToken.name || decodedToken.email?.split('@')[0] || 'User';
    const resolvedPhone = phone || decodedToken.phone_number || null;
    let resolvedRole = role ? role.toLowerCase() : null;

    if (resolvedRole && !ALLOWED_ROLES.includes(resolvedRole)) {
      return res.status(400).json({
        error: `Invalid role: '${resolvedRole}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}`,
      });
    }

    // Check if user already exists
    const existing = await query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);

    let user;
    if (existing.rows.length > 0) {
      // User exists - update if role or name or phone is provided
      const currentUser = existing.rows[0];
      const targetRole = resolvedRole || currentUser.role;
      const targetName = resolvedName || currentUser.name;
      const targetPhone = resolvedPhone !== undefined ? resolvedPhone : currentUser.phone;

      const updated = await query(
        `UPDATE users
         SET role = $1, name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
         WHERE firebase_uid = $4
         RETURNING *`,
        [targetRole, targetName, targetPhone, firebaseUid]
      );
      user = updated.rows[0];
    } else {
      // New user - default role to 'customer' if not specified
      const initialRole = resolvedRole || 'customer';
      const created = await query(
        `INSERT INTO users (firebase_uid, role, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [firebaseUid, initialRole, resolvedName, resolvedPhone]
      );
      user = created.rows[0];
    }

    return res.status(200).json({
      user,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Returns current authenticated user
 */
async function getMe(req, res) {
  return res.json({
    user: req.user,
    role: req.user.role,
  });
}

module.exports = {
  verifyAuth,
  getMe,
};
