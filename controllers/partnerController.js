const { query } = require('../db');

/**
 * GET /api/partner/me
 * Returns { id, name, phone, is_online, training_completed }
 */
async function getMyProfile(req, res, next) {
  try {
    const result = await query(
      'SELECT id, name, phone, is_online, training_completed FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partner profile not found.' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/partner/me
 * Accepts { is_online, training_completed }
 * Returns updated row { id, name, phone, is_online, training_completed }
 */
async function updateMyProfile(req, res, next) {
  try {
    const { is_online, training_completed } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (typeof is_online === 'boolean') {
      updates.push(`is_online = $${idx++}`);
      values.push(is_online);
    }

    if (typeof training_completed === 'boolean') {
      updates.push(`training_completed = $${idx++}`);
      values.push(training_completed);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No valid fields provided. Accepted fields: is_online, training_completed.',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const result = await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING id, name, phone, is_online, training_completed`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partner profile not found.' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
};
