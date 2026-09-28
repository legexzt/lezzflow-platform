'use strict';

/**
 * controllers/localityAnalyticsController.js
 *
 * Per-locality analytics for the admin panel. All metrics are computed from
 * REAL rows only — nothing is fabricated; empty windows yield zeros/nulls.
 *
 * is_live branch: at runtime we detect whether shops.is_live exists via
 * information_schema. If yes → active_kiranas = COUNT(shops WHERE is_live).
 * If no → fallback = COUNT(DISTINCT shops with ≥1 product row).
 * The active branch is reported per row in "active_kiranas_definition".
 *
 * No PostGIS in endpoint SQL (pg-mem compatible).
 */

const { query } = require('../db');

// ---------------------------------------------------------------------------
// Helper: detect whether shops.is_live exists in this DB instance
// ---------------------------------------------------------------------------
let _isLiveCached = null; // null = not yet checked, true/false thereafter

async function hasIsLiveColumn() {
  if (_isLiveCached !== null) return _isLiveCached;
  const result = await query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_name = 'shops'
        AND column_name = 'is_live'
      LIMIT 1`
  );
  _isLiveCached = result.rows.length > 0;
  return _isLiveCached;
}

// Exported so tests can reset it between pg-mem rebuilds
function resetIsLiveCache() {
  _isLiveCached = null;
}

// ---------------------------------------------------------------------------
// Helper: clamp & parse days param (default 30, range 1..365)
// ---------------------------------------------------------------------------
function parseDays(raw) {
  const n = parseInt(raw, 10);
  if (!raw || isNaN(n)) return 30;
  return Math.min(365, Math.max(1, n));
}

// ---------------------------------------------------------------------------
// Core metrics builder — one row per locality.
// Pass localityFilter to narrow to a single locality (case-insensitive).
// ---------------------------------------------------------------------------
async function buildLocalityMetrics(days, localityFilter) {
  const isLive = await hasIsLiveColumn();

  const activeKiranasCond = isLive
    ? 's.is_live = true'
    : null; // fallback branch uses a JOIN (see localityShopsCte) — pg-mem
            // cannot resolve correlated EXISTS subqueries here

  const localityShopsCte = isLive
    ? `locality_shops AS (
         SELECT s.locality, COUNT(*)::BIGINT AS active_kiranas
         FROM shops s
         WHERE s.locality IS NOT NULL AND s.is_live = true
         GROUP BY s.locality
       )`
    : `locality_shops AS (
         SELECT s.locality, COUNT(*)::BIGINT AS active_kiranas
         FROM shops s
         WHERE s.locality IS NOT NULL
           AND s.id IN (SELECT shop_id FROM products)
         GROUP BY s.locality
       )`;

  const activeKiranasDefinition = isLive
    ? 'COUNT of shops where is_live = true in the locality'
    : 'COUNT of distinct shops with ≥1 product row in the locality (is_live column absent — using product-presence fallback)';

  // Cutoff computed in JS — avoids INTERVAL casts (pg-mem safe)
  const cutoff = new Date(Date.now() - days * 86400000);

  const params = [cutoff];
  const localityFilterSql = localityFilter
    ? 'AND LOWER(s.locality) = LOWER($2)'
    : '';
  if (localityFilter) params.push(localityFilter);

  const sql = `
    WITH
    -- All localities known from shops (drives the LEFT JOIN so
    -- localities with zero orders still appear with zeros)
    all_localities AS (
      SELECT DISTINCT s.locality
      FROM shops s
      WHERE s.locality IS NOT NULL
      ${localityFilterSql}
    ),
    -- Orders inside the window, tagged with their shop's locality
    window_orders AS (
      SELECT
        o.id            AS order_id,
        o.customer_id,
        o.total,
        o.fulfillment,
        s.locality
      FROM orders o
      JOIN shops s ON s.id = o.shop_id
      WHERE o.created_at >= $1
        AND s.locality IS NOT NULL
        ${localityFilterSql}
    ),
    -- delivery_requests attached to window orders (UNIQUE per order)
    window_dr AS (
      SELECT dr.order_id, dr.delivery_fee
      FROM delivery_requests dr
      WHERE dr.order_id IN (SELECT order_id FROM window_orders)
    ),
    -- Per-customer order counts within the same locality + window
    -- (for the repeat-order rate)
    cust_counts AS (
      SELECT customer_id, locality, COUNT(*) AS order_count
      FROM window_orders
      GROUP BY customer_id, locality
    ),
    -- Per-locality aggregates over window orders
    locality_stats AS (
      SELECT
        wo.locality,
        COUNT(wo.order_id)::BIGINT AS orders_total,
        COUNT(DISTINCT wo.customer_id)::BIGINT AS customers_total,
        -- AOV = AVG(total) over real order rows (rounded in JS); NULL when none
        AVG(wo.total) AS aov_raw,
        -- fulfillment mix from the real fulfillment column
        SUM(CASE WHEN wo.fulfillment = 'pickup' THEN 1 ELSE 0 END)::BIGINT AS self_pickup,
        SUM(CASE WHEN wo.fulfillment = 'delivery' AND wdr.order_id IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS partner_delivery,
        SUM(CASE WHEN wo.fulfillment = 'delivery' AND wdr.order_id IS NULL THEN 1 ELSE 0 END)::BIGINT AS unassigned_delivery,
        -- delivery cost = AVG of real recorded delivery_fee (rounded in JS); NULL when none
        AVG(wdr.delivery_fee) AS delivery_cost_raw,
        -- repeat customers = customers with >1 order in window
        COUNT(DISTINCT CASE WHEN cc.order_count > 1 THEN wo.customer_id END)::BIGINT AS repeat_customers
      FROM window_orders wo
      LEFT JOIN window_dr wdr
        ON wdr.order_id = wo.order_id
      LEFT JOIN cust_counts cc
        ON cc.customer_id = wo.customer_id
       AND cc.locality = wo.locality
      GROUP BY wo.locality
    ),
    -- Active kiranas per locality (shop-level, independent of orders)
    ${localityShopsCte}
    SELECT
      al.locality,
      COALESCE(ls.orders_total, 0)       AS orders_total,
      COALESCE(ls.customers_total, 0)   AS customers_total,
      ls.aov_raw,
      COALESCE(ls.self_pickup, 0)        AS self_pickup,
      COALESCE(ls.partner_delivery, 0)   AS partner_delivery,
      COALESCE(ls.unassigned_delivery, 0) AS unassigned_delivery,
      ls.delivery_cost_raw,
      COALESCE(ls.repeat_customers, 0)   AS repeat_customers,
      COALESCE(lsh.active_kiranas, 0)    AS active_kiranas
    FROM all_localities al
    LEFT JOIN locality_stats ls  ON ls.locality = al.locality
    LEFT JOIN locality_shops lsh ON lsh.locality = al.locality
    ORDER BY COALESCE(ls.orders_total, 0) DESC, al.locality ASC
  `;

  const result = await query(sql, params);

  return result.rows.map((row) => {
    const ordersTotal = parseInt(row.orders_total, 10) || 0;
    const customersTotal = parseInt(row.customers_total, 10) || 0;
    const repeatCustomers = parseInt(row.repeat_customers, 10) || 0;
    const round2 = (v) => parseFloat(parseFloat(v).toFixed(2));

    // orders/day = COUNT(orders in window) / days, 2 decimals
    const ordersPerDay = parseFloat((ordersTotal / days).toFixed(2));

    // repeat_order_rate = customers with >1 order / distinct customers
    // as a 0-1 fraction (NOT percent); 0 when no customers
    const repeatOrderRate =
      customersTotal > 0
        ? parseFloat((repeatCustomers / customersTotal).toFixed(4))
        : 0;

    const aovRaw = row.aov_raw;
    const aov = aovRaw === null || aovRaw === undefined ? 0 : round2(aovRaw);

    const hasDeliveryCostData =
      row.delivery_cost_raw !== null && row.delivery_cost_raw !== undefined;

    return {
      locality: row.locality,
      orders_total: ordersTotal,
      orders_per_day: ordersPerDay,
      orders_per_day_per_km2: null,
      area_note:
        'n/a (area unknown — locality boundaries not tracked, not approximated)',
      customers_total: customersTotal,
      active_kiranas: parseInt(row.active_kiranas, 10) || 0,
      active_kiranas_definition: activeKiranasDefinition,
      repeat_order_rate: repeatOrderRate,
      aov,
      fulfillment_mix: {
        self_pickup: parseInt(row.self_pickup, 10) || 0,
        partner_delivery: parseInt(row.partner_delivery, 10) || 0,
        unassigned_delivery: parseInt(row.unassigned_delivery, 10) || 0,
      },
      delivery_cost_per_order: hasDeliveryCostData
        ? round2(row.delivery_cost_raw)
        : 0,
      ...(hasDeliveryCostData
        ? {}
        : { delivery_cost_note: 'no delivery-fee data recorded' }),
      revenue_per_order: 0,
      revenue_note: 'Payments coming soon — revenue is ₹0 during beta',
    };
  });
}

// ---------------------------------------------------------------------------
// GET /analytics/localities
// ---------------------------------------------------------------------------
async function listLocalities(req, res) {
  try {
    const days = parseDays(req.query.days);
    const rows = await buildLocalityMetrics(days, null);
    return res.json({
      days,
      localities_count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('[localityAnalytics] listLocalities error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /analytics/localities/:locality
// ---------------------------------------------------------------------------
async function getLocality(req, res) {
  try {
    const days = parseDays(req.query.days);
    const localityParam = req.params.locality;

    const rows = await buildLocalityMetrics(days, localityParam);

    if (rows.length === 0) {
      return res.status(404).json({
        error: `No shops found with locality '${localityParam}'`,
      });
    }

    // Bare metric object (no wrapper) — canonical shape, same as list items
    return res.json(rows[0]);
  } catch (err) {
    console.error('[localityAnalytics] getLocality error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  listLocalities,
  getLocality,
  resetIsLiveCache,
};
