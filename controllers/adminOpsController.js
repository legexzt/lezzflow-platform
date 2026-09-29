/**
 * Admin cycle-3 ops endpoints — all read-only aggregations over REAL tables.
 * Never invents metrics: every number comes from notifications, orders,
 * shop_timings, offers, ai_call_logs or scan_jobs.
 */
const { query } = require('../db');

const BROADCASTS_PER_WEEK = 2;

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

/**
 * GET /api/admin/notifications/broadcast-count
 * Broadcasts (user_id NULL) sent since Monday 00:00 vs the 2/week guardrail.
 */
async function getBroadcastCount(req, res, next) {
  try {
    const weekStart = startOfWeek();
    const result = await query(
      `SELECT COUNT(*)::int AS used
       FROM notifications
       WHERE user_id IS NULL AND created_at >= $1`,
      [weekStart.toISOString()]
    );
    const used = result.rows[0].used;
    res.json({
      used,
      limit: BROADCASTS_PER_WEEK,
      remaining: Math.max(0, BROADCASTS_PER_WEEK - used),
      week_start: weekStart.toISOString().slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/notifications/analytics
 * Per-notification sent/read/read-rate + totals grouped by type.
 *
 * Read-state sources (honest, no invented delivery counts):
 *  - Broadcasts (user_id IS NULL): reads come from notification_reads
 *    (one row per user who opened it). "sent" = broadcast messages created;
 *    we do NOT track per-user delivery, so read_rate for a broadcast is
 *    read-receipts per message, not a delivery percentage.
 *  - Targeted (user_id set): reads come from notifications.is_read.
 */
async function getNotificationAnalytics(req, res, next) {
  try {
    const list = await query(
      `SELECT id, title, type, user_id, is_read, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT 100`
    );
    const receipts = await query(
      `SELECT notification_id, COUNT(*)::int AS reads
       FROM notification_reads
       GROUP BY notification_id`
    );
    const readMap = {};
    for (const r of receipts.rows) readMap[r.notification_id] = r.reads;

    const items = list.rows.map((n) => {
      const isBroadcast = n.user_id === null;
      const reads = isBroadcast ? readMap[n.id] || 0 : n.is_read ? 1 : 0;
      return {
        id: n.id,
        title: n.title,
        type: n.type,
        audience: isBroadcast ? 'broadcast' : 'targeted',
        is_read: !!n.is_read,
        read_receipts: reads,
        created_at: n.created_at,
      };
    });

    const byType = {};
    for (const n of list.rows) {
      const t = n.type || 'system';
      byType[t] = byType[t] || { sent: 0, reads: 0 };
      byType[t].sent += 1;
      byType[t].reads += n.user_id === null ? readMap[n.id] || 0 : n.is_read ? 1 : 0;
    }
    const summary = Object.entries(byType).map(([type, s]) => ({
      type,
      sent: s.sent,
      read: s.reads,
      read_rate: s.sent ? Math.round((s.reads / s.sent) * 1000) / 10 : 0,
    }));

    res.json({
      items,
      summary,
      metric_notes:
        'Broadcast reads = notification_reads receipts (per-user opens). ' +
        'Targeted reads = notifications.is_read. "sent" = messages created; ' +
        'per-user delivery is not tracked, so broadcast read_rate is receipts per message, not a delivery %.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/shop-health
 * Per-shop liveness: days since last order, 7-day orders/GMV, offer count.
 * Sorted dormant-first. Also a per-area rollup grouped by the REAL
 * shops.locality column (falls back to the full address only where locality
 * is unset) — never a truncated-address proxy.
 *
 * Uses plain GROUP BY queries (no correlated subqueries) so the same SQL
 * runs on PostgreSQL and on the pg-mem test double.
 */
async function getShopHealth(req, res, next) {
  try {
    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

    const shops = await query(
      `SELECT id, name, address, locality, is_open, is_live
       FROM shops
       ORDER BY id`
    );
    const orders7d = await query(
      `SELECT shop_id, COUNT(*)::int AS orders_7d, COALESCE(SUM(total), 0)::float AS gmv_7d
       FROM orders
       WHERE status <> 'cancelled' AND created_at >= $1
       GROUP BY shop_id`,
      [weekAgoIso]
    );
    const lastOrders = await query(
      `SELECT shop_id, MAX(created_at) AS last_order_at
       FROM orders
       WHERE status <> 'cancelled'
       GROUP BY shop_id`
    );
    const offers = await query(
      `SELECT shop_id, COUNT(*)::int AS active_offers
       FROM shop_offers
       WHERE active = true
       GROUP BY shop_id`
    );

    const byShopId = (rows, key) => {
      const m = {};
      for (const r of rows) m[r.shop_id] = r[key];
      return m;
    };
    const o7 = byShopId(orders7d.rows, 'orders_7d');
    const g7 = byShopId(orders7d.rows, 'gmv_7d');
    const lastAt = byShopId(lastOrders.rows, 'last_order_at');
    const offerCount = byShopId(offers.rows, 'active_offers');

    const now = Date.now();
    const rows = shops.rows.map((s) => {
      const last = lastAt[s.id] || null;
      const daysSinceOrder = last
        ? Math.floor((now - new Date(last).getTime()) / 86400000)
        : null;
      let health = 'active';
      if (!s.is_live || !s.is_open) health = 'closed';
      else if (daysSinceOrder === null || daysSinceOrder > 14) health = 'dormant';
      else if (daysSinceOrder > 7) health = 'sleeping';
      return {
        id: s.id,
        name: s.name,
        address: s.address,
        locality: s.locality,
        is_open: s.is_open,
        is_live: s.is_live,
        health,
        days_since_last_order: daysSinceOrder,
        orders_7d: o7[s.id] || 0,
        gmv_7d: Math.round((g7[s.id] || 0) * 100) / 100,
        active_offers: offerCount[s.id] || 0,
      };
    });

    // Dormant first, then sleeping, then the rest
    const rank = { dormant: 0, sleeping: 1, closed: 2, active: 3 };
    rows.sort(
      (a, b) =>
        (rank[a.health] ?? 3) - (rank[b.health] ?? 3) ||
        (b.days_since_last_order ?? 9999) - (a.days_since_last_order ?? 9999)
    );

    // Per-area rollup keyed by shops.locality, address fallback where unset
    const locality = {};
    for (const r of rows) {
      const key = r.locality || r.address || 'Unknown';
      locality[key] = locality[key] || {
        locality: key,
        key_source: r.locality ? 'locality' : r.address ? 'address_fallback' : 'unknown',
        shops: 0,
        live: 0,
        orders_7d: 0,
        gmv_7d: 0,
        dormant: 0,
      };
      locality[key].shops += 1;
      if (r.is_live && r.is_open) locality[key].live += 1;
      locality[key].orders_7d += r.orders_7d;
      locality[key].gmv_7d = Math.round((locality[key].gmv_7d + r.gmv_7d) * 100) / 100;
      if (r.health === 'dormant') locality[key].dormant += 1;
    }

    res.json({
      shops: rows,
      locality: Object.values(locality),
      locality_note:
        'Grouped by shops.locality; entries marked address_fallback use the full shop address because locality is unset. Not a truncated-address proxy.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/ai-ops
 * Real AI/scan telemetry from ai_call_logs + scan_jobs. Aggregation happens
 * in JS over plain SELECTs (no DATE() / correlated subqueries) so the same
 * queries run on PostgreSQL and on the pg-mem test double.
 * Cost is reported honestly: AWS billing instrumentation is not connected,
 * so no per-call cost is shown — never an assumed rate presented as a bill.
 */
async function getAiOps(req, res, next) {
  try {
    const nowMs = Date.now();
    const cutoff14 = new Date(nowMs - 14 * 86400000).toISOString();
    const cutoff7 = new Date(nowMs - 7 * 86400000).toISOString();

    const calls = await query(
      `SELECT kind, status, latency_ms, created_at
       FROM ai_call_logs
       WHERE created_at >= $1`,
      [cutoff14]
    );
    const jobs = await query(
      `SELECT kind, status
       FROM scan_jobs
       WHERE created_at >= $1`,
      [cutoff7]
    );

    const dayKey = (dt) => new Date(dt).toISOString().slice(0, 10);

    const dailyMap = {}; // `${day}|${kind}|${status}` -> { n, latSum, latN }
    let ok7 = 0;
    let timeout7 = 0;
    let error7 = 0;
    let aiScans7 = 0;
    const byKindStatusMap = {}; // `${kind}|${status}` -> n (7d)

    for (const r of calls.rows) {
      const t = new Date(r.created_at).getTime();
      const dk = `${dayKey(r.created_at)}|${r.kind}|${r.status}`;
      dailyMap[dk] = dailyMap[dk] || {
        day: dayKey(r.created_at),
        kind: r.kind,
        status: r.status,
        n: 0,
        latSum: 0,
        latN: 0,
      };
      dailyMap[dk].n += 1;
      if (r.latency_ms !== null && r.latency_ms !== undefined) {
        dailyMap[dk].latSum += r.latency_ms;
        dailyMap[dk].latN += 1;
      }
      if (t >= nowMs - 7 * 86400000) {
        if (r.status === 'ok') ok7 += 1;
        else if (r.status === 'timeout') timeout7 += 1;
        else if (r.status === 'error') error7 += 1;
        const kk = `${r.kind}|${r.status}`;
        byKindStatusMap[kk] = (byKindStatusMap[kk] || 0) + 1;
        if (r.kind === 'ai_scan') aiScans7 += 1;
      }
    }

    const daily14d = Object.values(dailyMap)
      .map((d) => ({
        day: d.day,
        kind: d.kind,
        status: d.status,
        n: d.n,
        avg_latency_ms: d.latN ? Math.round(d.latSum / d.latN) : null,
      }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));

    const byKindStatus = Object.entries(byKindStatusMap).map(([k, n]) => {
      const [kind, status] = k.split('|');
      return { kind, status, n };
    });

    const queueMap = {};
    for (const r of jobs.rows) {
      const k = `${r.kind}|${r.status}`;
      queueMap[k] = (queueMap[k] || 0) + 1;
    }
    const scanQueue7d = Object.entries(queueMap).map(([k, n]) => {
      const [kind, status] = k.split('|');
      return { kind, status, n };
    });

    const total7 = ok7 + timeout7 + error7;

    // Honest cost: no billing instrumentation is connected, so we report
    // call counts only and say cost is unavailable. Never an assumed ₹/call.
    const costBand =
      aiScans7 === 0
        ? 'no AI scans in 7d — cost unavailable (AWS billing instrumentation not connected)'
        : `${aiScans7} AI scans in 7d — cost unavailable (AWS billing instrumentation not connected)`;

    res.json({
      last_7d: {
        total_calls: total7,
        ok: ok7,
        timeouts: timeout7,
        errors: error7,
        timeout_rate_pct: total7 ? Math.round((timeout7 / total7) * 1000) / 10 : 0,
        by_kind_status: byKindStatus,
        cost_band: costBand,
      },
      daily_14d: daily14d,
      scan_queue_7d: scanQueue7d,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  BROADCASTS_PER_WEEK,
  getBroadcastCount,
  getNotificationAnalytics,
  getShopHealth,
  getAiOps,
};
