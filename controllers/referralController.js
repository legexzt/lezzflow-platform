const { query } = require('../db');

/**
 * Referral codes are deterministic: "LF-" + partner user id in base36 uppercase.
 * No schema change needed; decoding maps the code back to the referrer.
 */
function encodeReferralCode(partnerId) {
  return `LF-${Number(partnerId).toString(36).toUpperCase()}`;
}

function decodeReferralCode(code) {
  if (typeof code !== 'string') return null;
  const m = code.trim().toUpperCase().match(/^LF-([0-9A-Z]+)$/);
  if (!m) return null;
  const id = parseInt(m[1], 36);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/partner/referral/claim
 * Partner claims "I was referred by <code>". One claim per partner (UNIQUE).
 * bonus_amount snapshots the configured partner_referral_bonus at claim time.
 */
async function claimReferral(req, res, next) {
  try {
    // No KYC gate here: new partners claim before their KYC is approved.
    // The bonus only becomes payable after their first completed trip (admin-verified).
    const referrerId = decodeReferralCode(req.body && req.body.code);
    if (!referrerId) {
      return res.status(400).json({ error: 'Invalid referral code. Codes look like LF-3F.' });
    }
    if (referrerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot use your own referral code.' });
    }

    const referrer = await query(
      "SELECT id FROM users WHERE id = $1 AND role = 'partner'",
      [referrerId],
    );
    if (referrer.rows.length === 0) {
      return res.status(404).json({ error: 'Referral code not found.' });
    }

    const bonusRes = await query(
      "SELECT value FROM app_config WHERE key = 'partner_referral_bonus'",
    );
    const bonus =
      bonusRes.rows.length > 0 && Number.isFinite(Number(bonusRes.rows[0].value))
        ? Number(bonusRes.rows[0].value)
        : null;

    try {
      const result = await query(
        `INSERT INTO partner_referrals (referrer_partner_id, referred_partner_id, bonus_amount)
         VALUES ($1, $2, $3)
         RETURNING id, referrer_partner_id, referred_partner_id, bonus_amount, status, created_at`,
        [referrerId, req.user.id, bonus],
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'You have already claimed a referral.' });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/partner/referrals
 * Returns my code + everyone I referred (real rows only).
 */
async function listMyReferrals(req, res, next) {
  try {
    const result = await query(
      `SELECT pr.id, pr.bonus_amount, pr.status, pr.created_at, u.name AS referred_name
       FROM partner_referrals pr
       JOIN users u ON u.id = pr.referred_partner_id
       WHERE pr.referrer_partner_id = $1
       ORDER BY pr.created_at DESC`,
      [req.user.id],
    );
    return res.json({
      my_code: encodeReferralCode(req.user.id),
      referrals: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/referrals
 * Admin: all partner referrals with referrer and referred names, latest first, capped at 200.
 */
async function listAdminReferrals(req, res, next) {
  try {
    const result = await query(
      `SELECT pr.*,
              u1.name AS referrer_name,
              u2.name AS referred_name,
              u2.created_at AS referred_user_created_at
       FROM partner_referrals pr
       JOIN users u1 ON u1.id = pr.referrer_partner_id
       JOIN users u2 ON u2.id = pr.referred_partner_id
       ORDER BY pr.created_at DESC
       LIMIT 200`
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  claimReferral,
  listMyReferrals,
  listAdminReferrals,
  encodeReferralCode,
  decodeReferralCode,
};
