const { query } = require('../db');
const { haversineDistance } = require('../services/distanceService');

const RADIUS_KM = 10;

/**
 * GET /api/advisory/feasibility?lat=&lng=&category=
 * Hyperlocal feasibility signals for a location:
 *  - competition: open shops within 10 km + product category breakdown
 *  - demand: order volume / revenue in the area over the last 30 days
 *  - verdict: go / caution with a plain-words reason
 *  - guidance: simple stocking suggestions based on gaps
 */
async function getFeasibility(req, res, next) {
  try {
    const parsedLat = parseFloat(req.query.lat);
    const parsedLng = parseFloat(req.query.lng);
    const category = (req.query.category || '').trim();

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'lat and lng query parameters are required' });
    }

    const shopsRes = await query('SELECT id, name, lat, lng FROM shops WHERE is_open = true');
    const nearby = shopsRes.rows.filter(
      (s) => haversineDistance(parsedLat, parsedLng, s.lat, s.lng) <= RADIUS_KM
    );
    const nearbyIds = nearby.map((s) => s.id);

    // Category competition from nearby shops' products
    const categoryBreakdown = {};
    if (nearbyIds.length) {
      const prodRes = await query(
        `SELECT COALESCE(category, 'Other') AS category, COUNT(*)::int AS n
         FROM products WHERE shop_id = ANY($1) GROUP BY category ORDER BY n DESC`,
        [nearbyIds]
      );
      for (const r of prodRes.rows) categoryBreakdown[r.category] = r.n;
    }

    // Demand: non-cancelled orders from nearby shops, last 30 days
    let orders30d = 0;
    let revenue30d = 0;
    if (nearbyIds.length) {
      const ordRes = await query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(total), 0)::float AS revenue
         FROM orders
         WHERE shop_id = ANY($1)
           AND created_at >= NOW() - INTERVAL '30 days'
           AND status <> 'cancelled'`,
        [nearbyIds]
      );
      orders30d = ordRes.rows[0]?.total || 0;
      revenue30d = ordRes.rows[0]?.revenue || 0;
    }

    // Verdict
    const shopCount = nearby.length;
    const competing = category ? categoryBreakdown[category] || 0 : 0;
    let verdict;
    let verdictReason;
    if (shopCount === 0) {
      verdict = 'go';
      verdictReason = 'No open shops within 10 km — this area has a clear gap.';
    } else if (category && competing === 0) {
      verdict = 'go';
      verdictReason = `No nearby shop sells “${category}” — a strong gap you can fill.`;
    } else if (shopCount <= 3) {
      verdict = 'go';
      verdictReason = 'Only a few shops nearby — competition is low.';
    } else if (shopCount <= 8) {
      verdict = 'caution';
      verdictReason = 'Moderate competition nearby — enter with better prices or a wider range.';
    } else {
      verdict = 'caution';
      verdictReason = 'Many shops already serve this area — only enter with a clear edge.';
    }

    // Stocking guidance: surface the least-served categories as opportunities
    const guidance = [];
    const entries = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0 && shopCount > 0) {
      guidance.push('Nearby shops have no listed products yet — stock daily essentials first (atta, rice, oil, sugar).');
    } else if (entries.length > 0) {
      const top = entries[0][0];
      guidance.push(`“${top}” is the most-stocked category nearby — match it, then add one thing nobody sells.`);
      const thin = entries.filter(([, n]) => n <= 2).map(([c]) => c);
      if (thin.length) guidance.push(`Thinly stocked nearby: ${thin.slice(0, 3).join(', ')} — an easy gap to fill.`);
    }
    if (orders30d > 0) {
      guidance.push(`${orders30d} orders in this area in the last 30 days — real demand exists here.`);
    } else if (shopCount > 0) {
      guidance.push('No online orders here in the last 30 days yet — you would be early, price fairly to win first customers.');
    }
    guidance.push('Keep fast-moving staples always in stock — stock-outs lose customers to the next shop.');

    return res.json({
      radiusKm: RADIUS_KM,
      nearbyShops: shopCount,
      categoryBreakdown,
      demand: { ordersLast30d: orders30d, revenueLast30d: Math.round(revenue30d * 100) / 100 },
      verdict,
      verdictReason,
      guidance,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getFeasibility };
