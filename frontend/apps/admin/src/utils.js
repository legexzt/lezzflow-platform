// Shared helpers for the admin console.

/**
 * Normalize list endpoints that may return a bare array or an object
 * wrapping the array (e.g. { shops: [...] }, { data: [...] }).
 */
export function asArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of [...keys, 'data', 'items', 'results']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

export function errMsg(err, fallback = 'Request failed. Please try again.') {
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}

function toDate(value) {
  if (!value) return null;
  // Firestore-style serialized timestamps.
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Map an entity status to a badge className. */
export function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (['delivered', 'approved', 'open', 'active', 'verified', 'packed'].includes(s)) {
    return 'badge badge-green';
  }
  if (['placed', 'pending', 'requested'].includes(s)) {
    return 'badge badge-amber';
  }
  if (['accepted', 'picked', 'assigned', 'processing', 'delivery'].includes(s)) {
    return 'badge badge-blue';
  }
  if (['cancelled', 'rejected', 'blocked'].includes(s)) {
    return 'badge badge-red';
  }
  return 'badge badge-grey';
}

/** Map a user role to a badge className. */
export function roleBadge(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return 'badge badge-blue';
  if (r === 'seller') return 'badge badge-green';
  if (r === 'partner') return 'badge badge-amber';
  return 'badge badge-grey';
}

/** "total_users" -> "Total Users" */
export function prettify(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const REJECT_REASON_LABELS = {
  blurry_doc: 'Blurry / unreadable document',
  name_mismatch: 'Name mismatch',
  expired: 'Expired document',
  duplicate: 'Duplicate submission',
};

