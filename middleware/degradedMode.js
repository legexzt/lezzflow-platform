/**
 * Degraded-mode flag (scaling cycle-3).
 *
 * When DEGRADED_MODE=1 the API sheds nonessential load instead of failing:
 *  - discovery serves stale cached results where available
 *  - AI advisory pauses with a truthful, retryable 503 (no fake advice)
 *  - new scan jobs are parked, not processed
 *  - nonessential Sarkari Yojana / promo nudges are skipped
 *
 * Flip with: DEGRADED_MODE=1 node server.js
 */
function isDegradedMode() {
  return process.env.DEGRADED_MODE === '1';
}

function degradedResponse(reason) {
  return {
    error: 'Service temporarily degraded — please retry shortly',
    code: 'DEGRADED_MODE',
    retryable: true,
    details: reason || null,
  };
}

module.exports = {
  isDegradedMode,
  degradedResponse,
};
