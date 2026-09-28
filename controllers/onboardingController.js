const { query } = require('../db');

/**
 * Ordered onboarding funnel steps for sellers.
 * profile -> products -> test_order -> go_live
 */
const FUNNEL_STEPS = ['profile', 'products', 'test_order', 'go_live'];

/**
 * POST /api/v1/onboarding/funnel-event
 * Body: { step }
 * Records a funnel event for the authenticated user.
 * Spam guard: a duplicate step for the same user on the same calendar day
 * is ignored (idempotent 200 with duplicate: true).
 */
async function recordFunnelEvent(req, res, next) {
  try {
    const { step } = req.body || {};

    if (!FUNNEL_STEPS.includes(step)) {
      return res.status(400).json({
        error: `Invalid step. Must be one of: ${FUNNEL_STEPS.join(', ')}`,
      });
    }

    // Spam guard: ignore a duplicate step for the same user on the same
    // calendar day (idempotent 200 with duplicate: true). The day comparison
    // is done in JS on purpose: pg-mem (test DB) implements very few native
    // date functions, so SQL date casts behave differently there.
    const recent = await query(
      `SELECT created_at FROM onboarding_funnel_events
       WHERE user_id = $1 AND step = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id, step]
    );

    if (recent.rows.length > 0) {
      const last = new Date(recent.rows[0].created_at);
      const now = new Date();
      const sameDay =
        last.getUTCFullYear() === now.getUTCFullYear() &&
        last.getUTCMonth() === now.getUTCMonth() &&
        last.getUTCDate() === now.getUTCDate();
      if (sameDay) {
        return res.status(200).json({ ok: true, step, duplicate: true });
      }
    }

    const result = await query(
      `INSERT INTO onboarding_funnel_events (user_id, step)
       VALUES ($1, $2)
       RETURNING *`,
      [req.user.id, step]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/onboarding/funnel-dropoff
 * For every user with at least one funnel event, finds the furthest step
 * reached; users whose furthest step is step S are counted as "stuck" at S.
 */
async function getFunnelDropoff(req, res, next) {
  try {
    const result = await query(
      `WITH furthest AS (
         SELECT user_id,
                MAX(CASE step
                      WHEN 'profile' THEN 1
                      WHEN 'products' THEN 2
                      WHEN 'test_order' THEN 3
                      WHEN 'go_live' THEN 4
                      ELSE 0
                    END) AS step_index
         FROM onboarding_funnel_events
         GROUP BY user_id
       )
       SELECT step_index, COUNT(*)::int AS users_stuck
       FROM furthest
       GROUP BY step_index
       ORDER BY step_index`
    );

    const byIndex = {};
    for (const row of result.rows) {
      byIndex[row.step_index] = row.users_stuck;
    }

    const dropoff = FUNNEL_STEPS.map((step, i) => ({
      step,
      step_index: i + 1,
      users_stuck: byIndex[i + 1] || 0,
    }));

    const total = await query(
      'SELECT COUNT(DISTINCT user_id)::int AS total FROM onboarding_funnel_events'
    );

    return res.json({
      steps: FUNNEL_STEPS,
      dropoff,
      total_users_in_funnel: total.rows[0].total,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  FUNNEL_STEPS,
  recordFunnelEvent,
  getFunnelDropoff,
};
