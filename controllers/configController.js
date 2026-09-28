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
 * Body: { commission_bps: <integer, 0–10000 inclusive> }  (required, legacy behavior)
 * Plus optional partner-cycle2 keys (validated when present, UPSERTed):
 *   delivery_base_fee:      number >= 0  (flat per-delivery fee, rupees)
 *   delivery_per_km_fee:     number >= 0  (per-km fee, rupees)
 *   partner_referral_enabled: boolean
 *   partner_referral_bonus:  number >= 0  (rupees, paid to each side)
 *   partner_support_phone:   string, digits/+/-/space, max 20 chars
 */
async function updateAdminConfig(req, res) {
  const {
    commission_bps,
    delivery_base_fee,
    delivery_per_km_fee,
    partner_referral_enabled,
    partner_referral_bonus,
    partner_support_phone,
  } = req.body;

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

  const extra = {};
  const bad = (msg) => res.status(400).json({ error: msg });

  if (delivery_base_fee !== undefined) {
    if (typeof delivery_base_fee !== 'number' || !Number.isFinite(delivery_base_fee) || delivery_base_fee < 0)
      return bad('delivery_base_fee must be a number >= 0.');
    extra.delivery_base_fee = String(delivery_base_fee);
  }
  if (delivery_per_km_fee !== undefined) {
    if (typeof delivery_per_km_fee !== 'number' || !Number.isFinite(delivery_per_km_fee) || delivery_per_km_fee < 0)
      return bad('delivery_per_km_fee must be a number >= 0.');
    extra.delivery_per_km_fee = String(delivery_per_km_fee);
  }
  if (partner_referral_enabled !== undefined) {
    if (typeof partner_referral_enabled !== 'boolean')
      return bad('partner_referral_enabled must be a boolean.');
    extra.partner_referral_enabled = partner_referral_enabled ? '1' : '0';
  }
  if (partner_referral_bonus !== undefined) {
    if (typeof partner_referral_bonus !== 'number' || !Number.isFinite(partner_referral_bonus) || partner_referral_bonus < 0)
      return bad('partner_referral_bonus must be a number >= 0.');
    extra.partner_referral_bonus = String(partner_referral_bonus);
  }
  if (partner_support_phone !== undefined) {
    if (typeof partner_support_phone !== 'string' || partner_support_phone.length > 20 ||
        !/^[+\d][\d\s\-()]*$/.test(partner_support_phone))
      return bad('partner_support_phone must be a phone-like string, max 20 chars.');
    extra.partner_support_phone = partner_support_phone;
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
    for (const [key, value] of Object.entries(extra)) {
      await query(
        `INSERT INTO app_config (key, value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE
             SET value      = EXCLUDED.value,
                 updated_at = CURRENT_TIMESTAMP`,
        [key, value],
      );
    }
    return res.status(200).json({ commission_bps, ...extra });
  } catch (err) {
    console.error('updateAdminConfig error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getPublicConfig, updateAdminConfig, getPartnerConfig };

/**
 * GET /api/delivery/config (and /api/v1/delivery/config)
 * Partner or admin. Returns partner-facing config values; null when unset.
 * Never exposes commission_bps here (public endpoint owns that).
 */
const PARTNER_CONFIG_KEYS = [
  'delivery_base_fee',
  'delivery_per_km_fee',
  'partner_referral_enabled',
  'partner_referral_bonus',
  'partner_support_phone',
];

async function getPartnerConfig(req, res) {
  try {
    // NB: built as IN (...) with positional params instead of = ANY($1)
    // because the pg-mem test shim does not resolve array params in ANY().
    const placeholders = PARTNER_CONFIG_KEYS.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `SELECT key, value FROM app_config WHERE key IN (${placeholders})`,
      PARTNER_CONFIG_KEYS,
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;

    const numOrNull = (k) => {
      if (map[k] === undefined) return null;
      const n = Number(map[k]);
      return Number.isFinite(n) ? n : null;
    };

    return res.status(200).json({
      delivery_base_fee: numOrNull('delivery_base_fee'),
      delivery_per_km_fee: numOrNull('delivery_per_km_fee'),
      partner_referral_enabled: map.partner_referral_enabled === '1',
      partner_referral_bonus: numOrNull('partner_referral_bonus'),
      partner_support_phone: map.partner_support_phone ?? null,
    });
  } catch (err) {
    if (err.code === '42P01' || (err.message && err.message.includes('app_config'))) {
      return res.status(200).json({
        delivery_base_fee: null,
        delivery_per_km_fee: null,
        partner_referral_enabled: false,
        partner_referral_bonus: null,
        partner_support_phone: null,
      });
    }
    console.error('getPartnerConfig error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
