const { query } = require('../db');

/**
 * Per-day shop timings. Seller-owned shops only (or admin).
 * day_of_week: 0=Sunday .. 6=Saturday.
 */

async function getOwnedShop(shopId, user) {
  const result = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
  if (result.rows.length === 0) return null;
  const shop = result.rows[0];
  if (user.role !== 'admin' && shop.seller_id !== user.id) return null;
  return shop;
}

function validateDay(entry) {
  const errors = [];
  const dow = Number(entry?.day_of_week);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
    errors.push('day_of_week must be an integer 0-6');
    return errors;
  }
  if (entry.is_closed) return errors; // closed days need no times
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRe.test(String(entry.open_time || ''))) errors.push(`day ${dow}: open_time must be HH:MM`);
  if (!timeRe.test(String(entry.close_time || ''))) errors.push(`day ${dow}: close_time must be HH:MM`);
  return errors;
}

/**
 * GET /api/v1/shops/:id/timings — seller (owner) or admin reads the 7-day schedule.
 * Missing days are returned as defaults (open 09:00-21:00) so the UI always has 7 rows.
 */
async function getTimings(req, res, next) {
  try {
    const shopId = parseInt(req.params.id, 10);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });
    const shop = await getOwnedShop(shopId, req.user);
    if (!shop) return res.status(404).json({ error: 'Shop not found or not yours' });

    const result = await query(
      'SELECT day_of_week, open_time, close_time, is_closed FROM shop_timings WHERE shop_id = $1',
      [shopId]
    );
    const byDay = new Map(result.rows.map((r) => [r.day_of_week, r]));
    // Postgres TIME comes back as "HH:MM:SS" — trim to HH:MM for <input type="time">.
    const hhmm = (t) => (typeof t === 'string' ? t.slice(0, 5) : t);
    const days = [];
    for (let dow = 0; dow <= 6; dow++) {
      const row = byDay.get(dow);
      days.push({
        day_of_week: dow,
        open_time: row ? hhmm(row.open_time) : '09:00',
        close_time: row ? hhmm(row.close_time) : '21:00',
        is_closed: row ? !!row.is_closed : false,
      });
    }
    return res.json({ shop_id: shopId, timings: days });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/shops/:id/timings — replace the 7-day schedule.
 * Body: { timings: [{ day_of_week, open_time, close_time, is_closed }, ...] }
 */
async function putTimings(req, res, next) {
  try {
    const shopId = parseInt(req.params.id, 10);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });
    const shop = await getOwnedShop(shopId, req.user);
    if (!shop) return res.status(404).json({ error: 'Shop not found or not yours' });

    const timings = req.body?.timings;
    if (!Array.isArray(timings) || timings.length === 0) {
      return res.status(400).json({ error: 'timings must be a non-empty array' });
    }
    const seen = new Set();
    const errors = [];
    for (const entry of timings) {
      errors.push(...validateDay(entry));
      const dow = Number(entry?.day_of_week);
      if (seen.has(dow)) errors.push(`day ${dow}: duplicate`);
      seen.add(dow);
    }
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    for (const entry of timings) {
      const dow = Number(entry.day_of_week);
      const closed = !!entry.is_closed;
      await query(
        `INSERT INTO shop_timings (shop_id, day_of_week, open_time, close_time, is_closed, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (shop_id, day_of_week)
         DO UPDATE SET open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time,
                       is_closed = EXCLUDED.is_closed, updated_at = CURRENT_TIMESTAMP`,
        [shopId, dow, closed ? null : entry.open_time, closed ? null : entry.close_time, closed]
      );
    }
    return res.json({ shop_id: shopId, saved: timings.length });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTimings, putTimings };
