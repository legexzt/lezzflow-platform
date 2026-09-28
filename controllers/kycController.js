const { query } = require('../db');
const { logAdminAction } = require('./auditController');

const REJECT_REASON_CODES = ['blurry_doc', 'name_mismatch', 'expired', 'duplicate'];

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
             reupload_requested = false,
             reupload_requested_at = NULL,
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
       WHERE pk.status = 'pending' AND pk.reupload_requested = false
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
       SET status = 'approved',
           reject_reason_code = NULL,
           reject_note = NULL,
           reupload_requested = false,
           reupload_requested_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const partnerId = result.rows[0].partner_id;
    let partnerName = null;
    try {
      const userRes = await query('SELECT name FROM users WHERE id = $1', [partnerId]);
      if (userRes.rows.length > 0) partnerName = userRes.rows[0].name;
    } catch (e) {
      console.error('Failed to look up partner name:', e);
    }

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'kyc_approve',
        entityType: 'kyc',
        entityId: String(id),
        details: { partner_id: partnerId, partner_name: partnerName },
      });
    } catch (auditErr) {
      console.error('Audit logging failed for kyc_approve:', auditErr);
    }

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
    const { reason_code, note } = req.body || {};

    if (reason_code && !REJECT_REASON_CODES.includes(reason_code)) {
      return res.status(400).json({
        error: `Invalid reason_code. Must be one of: ${REJECT_REASON_CODES.join(', ')}`,
      });
    }

    const existing = await query('SELECT * FROM partner_kyc WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    const result = await query(
      `UPDATE partner_kyc
       SET status = 'rejected',
           reject_reason_code = $1,
           reject_note = $2,
           reupload_requested = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [reason_code || null, (note && note.trim()) || null, id]
    );

    const partnerId = result.rows[0].partner_id;
    let partnerName = null;
    try {
      const userRes = await query('SELECT name FROM users WHERE id = $1', [partnerId]);
      if (userRes.rows.length > 0) partnerName = userRes.rows[0].name;
    } catch (e) {
      console.error('Failed to look up partner name:', e);
    }

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'kyc_reject',
        entityType: 'kyc',
        entityId: String(id),
        details: {
          partner_id: partnerId,
          partner_name: partnerName,
          reason_code: reason_code || null,
          note: (note && note.trim()) || null,
        },
      });
    } catch (auditErr) {
      console.error('Audit logging failed for kyc_reject:', auditErr);
    }

    return res.json({
      message: 'KYC rejected',
      kyc: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/kyc/:id/request-reupload
 * Admin requests partner to re-upload KYC documents
 */
async function requestReupload(req, res, next) {
  try {
    const { id } = req.params;
    const { reason_code, note } = req.body || {};

    if (reason_code && !REJECT_REASON_CODES.includes(reason_code)) {
      return res.status(400).json({
        error: `Invalid reason_code. Must be one of: ${REJECT_REASON_CODES.join(', ')}`,
      });
    }

    const existing = await query('SELECT * FROM partner_kyc WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    if (existing.rows[0].status === 'approved') {
      return res.status(400).json({ error: 'Cannot request reupload for already approved KYC' });
    }

    const result = await query(
      `UPDATE partner_kyc
       SET reupload_requested = true,
           reupload_requested_at = CURRENT_TIMESTAMP,
           reject_reason_code = $1,
           reject_note = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [reason_code || null, (note && note.trim()) || null, id]
    );

    const partnerId = result.rows[0].partner_id;
    let partnerName = null;
    try {
      const userRes = await query('SELECT name FROM users WHERE id = $1', [partnerId]);
      if (userRes.rows.length > 0) partnerName = userRes.rows[0].name;
    } catch (e) {
      console.error('Failed to look up partner name:', e);
    }

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'kyc_reupload_requested',
        entityType: 'kyc',
        entityId: String(id),
        details: {
          partner_id: partnerId,
          partner_name: partnerName,
          reason_code: reason_code || null,
          note: (note && note.trim()) || null,
        },
      });
    } catch (auditErr) {
      console.error('Audit logging failed for kyc_reupload_requested:', auditErr);
    }

    return res.json({
      message: 'Re-upload requested successfully',
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
  requestReupload,
  REJECT_REASON_CODES,
};
