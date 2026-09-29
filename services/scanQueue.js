/**
 * PostgreSQL-backed async scan job queue (scaling cycle-3).
 *
 * AI image scans and barcode lookups are enqueued here instead of blocking
 * an API worker. A worker claims the oldest queued job with
 * SELECT ... FOR UPDATE SKIP LOCKED so multiple workers never double-claim.
 *
 * NOTE on tests: pg-mem does not implement SKIP LOCKED, so in NODE_ENV=test
 * the claim uses a plain SELECT ... FOR UPDATE inside the same transaction.
 * Production always uses SKIP LOCKED.
 */
const { randomUUID } = require('crypto');
const { query, getClient } = require('../db');

const MAX_ATTEMPTS = 3;

async function enqueueScanJob({ userId = null, kind, payload = {}, parked = false }) {
  if (!['ai', 'barcode'].includes(kind)) {
    throw new Error(`Invalid scan job kind: ${kind}`);
  }
  // Explicit UUID: pg-mem caches gen_random_uuid() DEFAULT per query (dup keys).
  const result = await query(
    `INSERT INTO scan_jobs (id, user_id, kind, status, payload, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [randomUUID(), userId, kind, parked ? 'parked' : 'queued', JSON.stringify(payload), MAX_ATTEMPTS]
  );
  return result.rows[0];
}

async function getScanJob(id) {
  const result = await query('SELECT * FROM scan_jobs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Claim the oldest queued job for processing. Returns the job row or null
 * when the queue is empty.
 */
async function claimNextJob() {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // pg-mem (tests) cannot parse SKIP LOCKED; production always uses it.
    const lockClause =
      process.env.NODE_ENV === 'test' ? 'FOR UPDATE' : 'FOR UPDATE SKIP LOCKED';
    const claimed = await client.query(
      `SELECT * FROM scan_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1
       ${lockClause}`
    );
    if (claimed.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const job = claimed.rows[0];
    const updated = await client.query(
      `UPDATE scan_jobs
       SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [job.id]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* noop */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function completeScanJob(id, result) {
  const res = await query(
    `UPDATE scan_jobs
     SET status = 'done', result = $2, error = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(result)]
  );
  return res.rows[0] || null;
}

/**
 * Record a processing failure. When attempts reach max_attempts the job is
 * marked failed; otherwise it returns to queued for another try.
 */
async function failScanJob(id, errorMessage) {
  const res = await query(
    `UPDATE scan_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
         error = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, errorMessage ? String(errorMessage).slice(0, 2000) : null]
  );
  return res.rows[0] || null;
}

async function parkScanJob(id) {
  const res = await query(
    `UPDATE scan_jobs SET status = 'parked', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Re-queue jobs that were parked while DEGRADED_MODE was on.
 * Returns the number of jobs re-queued.
 */
async function requeueParkedJobs(limit = 100) {
  const res = await query(
    `UPDATE scan_jobs SET status = 'queued', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM scan_jobs WHERE status = 'parked' ORDER BY created_at ASC LIMIT $1
     )`,
    [limit]
  );
  return res.rowCount;
}

module.exports = {
  MAX_ATTEMPTS,
  enqueueScanJob,
  getScanJob,
  claimNextJob,
  completeScanJob,
  failScanJob,
  parkScanJob,
  requeueParkedJobs,
};
