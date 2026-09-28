const { query } = require('../db');
const admin = require('../config/firebase');

/**
 * Helper to record an admin audit log entry
 */
async function logAdminAction({ actorUid, actorName, action, entityType, entityId, details }) {
  const detailsJson = typeof details === 'string' ? details : JSON.stringify(details || {});
  const result = await query(
    `INSERT INTO admin_audit_log (actor_firebase_uid, actor_name, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [actorUid || '', actorName || null, action, entityType, String(entityId), detailsJson]
  );
  return result.rows[0];
}

/**
 * GET /api/admin/audit
 * List audit log rows with optional filtering
 */
async function listAudit(req, res, next) {
  try {
    const { entity_type, entity_id, action, limit } = req.query;
    let limitNum = 50;
    if (limit !== undefined) {
      const parsed = parseInt(limit, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limitNum = Math.min(parsed, 100);
      }
    }

    const whereClauses = [];
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      whereClauses.push(`entity_type = $${params.length}`);
    }
    if (entity_id) {
      params.push(String(entity_id));
      whereClauses.push(`entity_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      whereClauses.push(`action = $${params.length}`);
    }

    let sql = 'SELECT * FROM admin_audit_log';
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }
    params.push(limitNum);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    return res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/orders/:id/nudge
 * Nudge seller or partner for an order
 */
async function nudgeOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { target } = req.body || {};

    if (target !== 'seller' && target !== 'partner') {
      return res.status(400).json({ error: "target must be 'seller' or 'partner'" });
    }

    const orderRes = await query(
      `SELECT o.id, o.shop_id,
              s.name as shop_name,
              su.name as seller_name, su.phone as seller_phone,
              cu.name as customer_name, cu.phone as customer_phone,
              pu.name as partner_name, pu.phone as partner_phone
       FROM orders o
       JOIN shops s ON o.shop_id = s.id
       JOIN users su ON s.seller_id = su.id
       LEFT JOIN users cu ON o.customer_id = cu.id
       LEFT JOIN delivery_requests dr ON dr.order_id = o.id
       LEFT JOIN users pu ON dr.partner_id = pu.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const row = orderRes.rows[0];

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'order_nudge',
        entityType: 'order',
        entityId: String(id),
        details: { target, shop_id: row.shop_id, shop_name: row.shop_name },
      });
    } catch (auditErr) {
      console.error('Audit logging failed for order_nudge:', auditErr);
    }

    return res.json({
      ok: true,
      contacts: {
        seller_name: row.seller_name || null,
        seller_phone: row.seller_phone || null,
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        partner_name: row.partner_name || null,
        partner_phone: row.partner_phone || null,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/ops-viewers
 * Set ops_viewer custom claim for user
 */
async function grantOpsViewer(req, res, next) {
  try {
    const { firebase_uid } = req.body || {};
    if (!firebase_uid) {
      return res.status(400).json({ error: 'firebase_uid is required' });
    }

    const authInstance = admin.auth();
    if (typeof authInstance.setCustomUserClaims !== 'function') {
      return res.status(503).json({
        error: 'Firebase Admin SDK not configured; set the claim from the Firebase console.',
      });
    }

    await authInstance.setCustomUserClaims(firebase_uid, { ops_viewer: true });

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'ops_viewer_granted',
        entityType: 'user',
        entityId: firebase_uid,
        details: {},
      });
    } catch (auditErr) {
      console.error('Audit logging failed for ops_viewer_granted:', auditErr);
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/ops-viewers/:uid
 * Remove ops_viewer custom claim for user
 */
async function revokeOpsViewer(req, res, next) {
  try {
    const { uid } = req.params;
    if (!uid) {
      return res.status(400).json({ error: 'uid parameter is required' });
    }

    const authInstance = admin.auth();
    if (typeof authInstance.setCustomUserClaims !== 'function') {
      return res.status(503).json({
        error: 'Firebase Admin SDK not configured; set the claim from the Firebase console.',
      });
    }

    await authInstance.setCustomUserClaims(uid, { ops_viewer: null });

    try {
      await logAdminAction({
        actorUid: req.firebaseUser && req.firebaseUser.uid,
        actorName: req.user && req.user.name,
        action: 'ops_viewer_revoked',
        entityType: 'user',
        entityId: uid,
        details: {},
      });
    } catch (auditErr) {
      console.error('Audit logging failed for ops_viewer_revoked:', auditErr);
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  logAdminAction,
  listAudit,
  nudgeOrder,
  grantOpsViewer,
  revokeOpsViewer,
};
