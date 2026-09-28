// Analytics API layer — locality analytics endpoints.
// baseURL is already /api, so paths start at /v1/admin/...
import api from './api.js';
import { asArray } from './utils.js';

/**
 * GET /api/v1/admin/analytics/localities
 * Returns an array of locality summary objects.
 * Accepts a bare array or a wrapped { localities: [...] } shape.
 */
export async function getLocalities() {
  const res = await api.get('/v1/admin/analytics/localities');
  return asArray(res.data, ['localities']);
}

/**
 * GET /api/v1/admin/analytics/localities/:locality
 * Returns the detail object for a single locality, or null if absent.
 */
export async function getLocalityDetail(locality) {
  const res = await api.get(`/v1/admin/analytics/localities/${encodeURIComponent(locality)}`);
  return res.data ?? null;
}
