/**
 * Offline-resilient outbox for partner trip updates (Cycle-3).
 *
 * When the partner taps a status change or a trip chip with no network,
 * the op is queued in localStorage and replayed in order when connectivity
 * returns. The SERVER stays authoritative: queued ops are plain API calls,
 * so a stale op (e.g. trip already cancelled by the shop) fails safely with
 * the server's own error instead of corrupting state.
 *
 * Also caches the last-known active trip details so the trip screen stays
 * readable offline.
 */

const OUTBOX_KEY = 'lezzflow_partner_outbox_v1';
const TRIP_CACHE_KEY = 'lezzflow_partner_trips_v1';
const TRIP_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable — offline queue degrades silently
  }
}

function clientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Queue a trip op. op = { kind: 'status'|'note', requestId, status?, otp?, chip? } */
export function enqueueOp(op) {
  const ops = readJson(OUTBOX_KEY, []);
  ops.push({ ...op, clientId: clientId(), queuedAt: Date.now() });
  writeJson(OUTBOX_KEY, ops);
  return ops.length;
}

export function listOps() {
  return readJson(OUTBOX_KEY, []);
}

export function removeOp(cid) {
  writeJson(
    OUTBOX_KEY,
    readJson(OUTBOX_KEY, []).filter((o) => o.clientId !== cid),
  );
}

export function outboxCount() {
  return readJson(OUTBOX_KEY, []).length;
}

/**
 * Replay queued ops in FIFO order.
 * `runners` maps op.kind -> async (op) => void.
 * Returns { done, failed } — failed ops stay queued for the next retry.
 */
export async function flushOutbox(runners) {
  const ops = listOps();
  let done = 0;
  let failed = 0;
  for (const op of ops) {
    const run = runners[op.kind];
    if (!run) {
      removeOp(op.clientId);
      continue;
    }
    try {
      await run(op);
      removeOp(op.clientId);
      done += 1;
    } catch {
      failed += 1;
      // keep queued; stop? No — continue with the rest, order is best-effort
    }
  }
  return { done, failed };
}

/** Cache active trip details for the offline trip screen. */
export function cacheTrips(trips) {
  writeJson(TRIP_CACHE_KEY, { savedAt: Date.now(), trips });
}

export function getCachedTrips() {
  const entry = readJson(TRIP_CACHE_KEY, null);
  if (!entry || !Array.isArray(entry.trips)) return null;
  if (Date.now() - entry.savedAt > TRIP_CACHE_TTL_MS) return null;
  return entry.trips;
}

/** Duty-on checklist persistence (per partner device). */
const CHECKLIST_KEY = 'lezzflow_partner_checklist_v1';

export function loadChecklist() {
  return readJson(CHECKLIST_KEY, {
    phone: false,
    bag: false,
    fuel: false,
    idcard: false,
  });
}

export function saveChecklist(state) {
  writeJson(CHECKLIST_KEY, state);
}
