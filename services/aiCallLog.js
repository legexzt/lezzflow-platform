/**
 * Fire-and-forget AI/scan call logging (admin cycle-3).
 *
 * Every Bedrock AI scan and barcode lookup records one row in ai_call_logs.
 * Logging must NEVER break the scan itself — all errors are swallowed.
 */
const { randomUUID } = require('crypto');
const { query } = require('../db');

async function logAiCall({ kind, status, latencyMs = null, error = null }) {
  try {
    // Explicit UUID: pg-mem caches gen_random_uuid() DEFAULT per query.
    await query(
      `INSERT INTO ai_call_logs (id, kind, status, latency_ms, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        kind,
        status,
        latencyMs,
        error ? String(error).slice(0, 1000) : null,
      ]
    );
  } catch (err) {
    // Logging is best-effort; never fail the user-facing scan.
    if (process.env.NODE_ENV !== 'test') {
      console.error('[ai-call-log] failed:', err.message);
    }
  }
}

module.exports = { logAiCall };
