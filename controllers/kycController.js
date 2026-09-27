const { query } = require('../db');

/**
 * POST /api/kyc
 * Partner submits or updates KYC documents
 */
async function submitKyc(req, res, next) {
  try {
    const { aadhaar_url, pan_url, license_url } = req.body;

    if (!aadhaar_url && !pan_url && !license_url) {
      return res.status(400).json({
        error: 'At least one document URL (aadhaar_url, pan_url, license_url) is required',
      });
    }

    const partnerId = req.user.id;

    // Check if partner already has a KYC record
    const existing = await query('SELECT * FROM partner_kyc WHERE partner_id = $1', [partnerId]);

    let result;
    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE partner_kyc
         SET aadhaar_url = COALESCE($1, aadhaar_url),
             pan_url = COALESCE($2, pan_url),
             license_url = COALESCE($3, license_url),
             status = 'pending',
             updated_at = CURRENT_TIMESTAMP
         WHERE partner_id = $4
         RETURNING *`,
        [aadhaar_url || null, pan_url || null, license_url || null, partnerId]
      );
    } else {
      result = await query(
        `INSERT INTO partner_kyc (partner_id, aadhaar_url, pan_url, license_url, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [partnerId, aadhaar_url || null, pan_url || null, license_url || null]
      );
    }

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/kyc
 * Partner retrieves their own KYC status
 */
async function getMyKyc(req, res, next) {
  try {
    const result = await query('SELECT * FROM partner_kyc WHERE partner_id = $1', [req.user.id]);

    if (result.rows.length === 0) {
      return res.json({ status: 'unsubmitted', message: 'No KYC documents submitted yet' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/kyc/pending
 * Admin lists all pending KYC applications
 */
async function listPendingKyc(req, res, next) {
  try {
    const result = await query(
      `SELECT pk.*, u.name as partner_name, u.phone as partner_phone, u.firebase_uid
       FROM partner_kyc pk
       JOIN users u ON pk.partner_id = u.id
       WHERE pk.status = 'pending'
       ORDER BY pk.id ASC`
    );

    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/kyc/:id/approve
 * Admin approves a partner's KYC
 */
async function approveKyc(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM partner_kyc WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    const result = await query(
      `UPDATE partner_kyc
       SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({
      message: 'KYC approved successfully',
      kyc: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/kyc/:id/reject
 * Admin rejects a partner's KYC
 */
async function rejectKyc(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM partner_kyc WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    const result = await query(
      `UPDATE partner_kyc
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({
      message: 'KYC rejected',
      kyc: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitKyc,
  getMyKyc,
  listPendingKyc,
  approveKyc,
  rejectKyc,
};
