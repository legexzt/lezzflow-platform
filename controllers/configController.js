const { query } = require('../db');

/**
 * GET /api/config (and /api/v1/config)
 * Public endpoint — no auth required.
 * Returns only the safe key: commission_bps (integer).
 * Falls back to 0 if the app_config table does not yet exist.
 */
async function getPublicConfig(req, res) {
  try {
    const result = await query(
      "SELECT value FROM app_config WHERE key = 'commission_bps'",
    );
    const commission_bps =
      result.rows.length > 0 ? parseInt(result.rows[0].value, 10) : 0;
    return res.status(200).json({ commission_bps });
  } catch (err) {
    // If the table doesn't exist yet (migration not applied in this env), fall back to 0
    if (
      err.message &&
      (err.message.includes('relation "app_config" does not exist') ||
        err.message.includes("app_config") ||
        (err.code && (err.code === '42P01' || err.code === 'UNDEFINED_TABLE')))
    ) {
      return res.status(200).json({ commission_bps: 0 });
    }
    console.error('getPublicConfig error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * PATCH /api/admin/config (and /api/v1/admin/config)
 * Admin only (authenticateToken + requireRole('admin') + requireAdminWrite).
 * Body: { commission_bps: <integer, 0–10000 inclusive> }
 * UPSERTs the value into app_config and returns { commission_bps }.
 */
async function updateAdminConfig(req, res) {
  const { commission_bps } = req.body;

  // Strict validation: must be a number, integer, and 0 <= v <= 10000
  if (
    commission_bps === undefined ||
    commission_bps === null ||
    typeof commission_bps !== 'number' ||
    !Number.isInteger(commission_bps) ||
    commission_bps < 0 ||
    commission_bps > 10000
  ) {
    return res.status(400).json({
      error:
        'commission_bps must be an integer between 0 and 10000 inclusive.',
    });
  }

  try {
    await query(
      `INSERT INTO app_config (key, value, updated_at)
         VALUES ('commission_bps', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
           SET value      = EXCLUDED.value,
               updated_at = CURRENT_TIMESTAMP`,
      [String(commission_bps)],
    );
    return res.status(200).json({ commission_bps });
  } catch (err) {
    console.error('updateAdminConfig error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getPublicConfig, updateAdminConfig };
