// Helpers to tolerate small variations in API field names.

export function getLat(shop) {
  const v =
    shop?.latitude ?? shop?.lat ?? shop?.location?.lat ?? shop?.location?.latitude;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getLng(shop) {
  const v =
    shop?.longitude ??
    shop?.lng ??
    shop?.location?.lng ??
    shop?.location?.longitude;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatDistance(shop) {
  const d = shop?.distance_km ?? shop?.distanceKm ?? shop?.distance;
  const n = Number(d);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

export function getProductImage(product) {
  return product?.image_url || product?.image || product?.photo || null;
}

const LAST_POSITION_KEY = 'lf_last_position';

/** Cache the customer's last known [lat, lng] (from discovery GPS). */
export function cacheCustomerPosition(lat, lng) {
  try {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      localStorage.setItem(LAST_POSITION_KEY, JSON.stringify([la, ln]));
    }
  } catch {
    // Storage unavailable — compare will fall back to live geolocation.
  }
}

/**
 * Resolve the customer's position: cached discovery position first,
 * then a one-shot browser geolocation. Returns { lat, lng } or null.
 */
export function getCustomerPosition() {
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY);
    if (raw) {
      const [lat, lng] = JSON.parse(raw);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return Promise.resolve({ lat, lng });
      }
    }
  } catch {
    // fall through to geolocation
  }
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        cacheCustomerPosition(lat, lng);
        resolve({ lat, lng });
      },
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}
