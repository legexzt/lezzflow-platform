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
