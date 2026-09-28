const admin = require('../config/firebase');
const { query } = require('../db');

// Roles that can be self-assigned by new users during registration
const SELF_ASSIGNABLE_ROLES = ['seller', 'customer', 'partner'];
const ALLOWED_ROLES = ['seller', 'customer', 'partner', 'admin'];

/**
 * POST /api/auth/verify
 * Body: { idToken, role, name, phone }
 * Verifies Firebase ID token, upserts user in database, returns user and role.
 *
 * Security: 'admin' role cannot be self-assigned by new users.
 * For existing users, the role column is never updated by this endpoint.
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

    // Reject completely unknown/garbage roles with 400 (applies to both new and existing users)
    if (resolvedRole && !ALLOWED_ROLES.includes(resolvedRole)) {
      return res.status(400).json({
        error: `Invalid role: '${resolvedRole}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}`,
      });
    }

    // Check if user already exists
    const existing = await query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);

    let user;
    if (existing.rows.length > 0) {
      // Existing user — NEVER update the role from client input (prevents privilege escalation).
      // Only update name and phone.
      const currentUser = existing.rows[0];
      const targetName = resolvedName || currentUser.name;
      const targetPhone = resolvedPhone !== undefined ? resolvedPhone : currentUser.phone;

      const updated = await query(
        `UPDATE users
         SET name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP
         WHERE firebase_uid = $3
         RETURNING *`,
        [targetName, targetPhone, firebaseUid]
      );
      user = updated.rows[0];
    } else {
      // New user — only SELF_ASSIGNABLE_ROLES are permitted; 'admin' must be granted out-of-band.
      if (resolvedRole && !SELF_ASSIGNABLE_ROLES.includes(resolvedRole)) {
        console.warn(
          `[SECURITY] Blocked self-assignment of role '${resolvedRole}' by firebase_uid=${firebaseUid}`
        );
        return res.status(403).json({
          error: `Role '${resolvedRole}' cannot be self-assigned`,
        });
      }

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
