const { query } = require('../db');
const { randomUUID } = require('crypto');
const { isDegradedMode, degradedResponse } = require('../middleware/degradedMode');

/**
 * Helper: validate and parse pagination parameters (same convention as adminController)
 */
function parsePagination(q) {
  let page = 1;
  let limit = 20;

  if (q.page !== undefined) {
    const pageNum = Number(q.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return { error: 'page must be a positive integer' };
    }
    page = pageNum;
  }

  if (q.limit !== undefined) {
    const limitNum = Number(q.limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      return { error: 'limit must be an integer between 1 and 100' };
    }
    limit = limitNum;
  }

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// ---------------------------------------------------------------------------
// Customer endpoints (auth required)
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications
 * Auth required. Returns notifications for the user:
 *   user_id = me OR user_id IS NULL (broadcast), newest first.
 * Pagination via ?page=&limit=
 */
async function listNotifications(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, offset } = pagination;
    const userId = req.user.id;

    const countResult = await query(
      'SELECT COUNT(*) FROM notifications WHERE (user_id = $1 OR user_id IS NULL)',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await query(
      `SELECT n.id, n.user_id, n.title, n.body, n.type, n.data, n.created_at,
              COALESCE((nr.notification_id IS NOT NULL OR (n.user_id = $1 AND n.is_read)), false) AS is_read
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE (n.user_id = $1 OR n.user_id IS NULL)
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Auth required. Marks notification as read.
 * Only allowed if the notification belongs to the user (user_id = me)
 * or is a broadcast (user_id IS NULL).
 */
async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Fetch to verify ownership / broadcast scope first
    const found = await query(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const notif = found.rows[0];

    // User can only mark their own or broadcast notifications
    if (notif.user_id !== null && notif.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: not your notification' });
    }

    let row;
    if (notif.user_id === null) {
      // Broadcast: per-user read state (one user's read must not affect others)
      await query(
        `INSERT INTO notification_reads (notification_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (notification_id, user_id) DO NOTHING`,
        [id, userId]
      );
      row = { ...notif, is_read: true };
    } else {
      const result = await query(
        'UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *',
        [id]
      );
      row = result.rows[0];
    }
    return res.json(row);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/notifications/read-all
 * Auth required. Marks all my + broadcast notifications as read.
 */
async function markAllRead(req, res, next) {
  try {
    const userId = req.user.id;

    // Targeted notifications: flip the row flag (only this user sees them)
    const targeted = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );

    // Broadcasts: per-user read rows (never touch the shared row).
    // (Two-step: pg-mem can't resolve outer aliases inside NOT EXISTS subqueries.)
    const unreadBroadcasts = await query(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE n.user_id IS NULL AND nr.notification_id IS NULL`,
      [userId]
    );
    let broadcastCount = 0;
    for (const row of unreadBroadcasts.rows) {
      await query(
        `INSERT INTO notification_reads (notification_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (notification_id, user_id) DO NOTHING`,
        [row.id, userId]
      );
      broadcastCount++;
    }

    return res.json({ updated: targeted.rows.length + broadcastCount });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/notifications
 * Admin: create a broadcast (user_id=null) or user-targeted notification.
 */
async function adminCreateNotification(req, res, next) {
  try {
    // DEGRADED_MODE: skip nonessential Sarkari Yojana / promo nudges to shed
    // load. Order updates and system alerts still go through.
    const requestedType = (req.body && req.body.type) || 'system';
    if (isDegradedMode() && ['scheme_offer', 'promo'].includes(requestedType)) {
      return res
        .status(503)
        .set('Retry-After', '60')
        .json(degradedResponse(`Nonessential '${requestedType}' nudges are paused in degraded mode`));
    }

    const {
      user_id = null,
      title,
      body = null,
      type = 'system',
      data = {},
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const validTypes = ['scheme_offer', 'order_update', 'promo', 'system'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Validate user_id if provided (must be a positive integer)
    let resolvedUserId = null;
    if (user_id !== null && user_id !== undefined && user_id !== '') {
      const uid = Number(user_id);
      if (!Number.isInteger(uid) || uid < 1) {
        return res.status(400).json({ error: 'user_id must be a positive integer or null (broadcast)' });
      }
      resolvedUserId = uid;
    }

    const result = await query(
      `INSERT INTO notifications (id, user_id, title, body, type, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        randomUUID(), // explicit: pg-mem caches gen_random_uuid() DEFAULT per query, causing dup keys
        resolvedUserId,
        String(title).trim(),
        body || null,
        type,
        typeof data === 'object' ? JSON.stringify(data) : data,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
  adminCreateNotification,
};
