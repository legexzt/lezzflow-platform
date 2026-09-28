/**
 * Calculate great-circle distance between two coordinates in kilometers using Haversine formula
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (angle) => (angle * Math.PI) / 180;
  const R = 6371; // Earth's mean radius in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Group shops into distance layers: within5km, within10km, within20km
 * @param {Array} shops Array of shop records with lat and lng
 * @param {number} userLat User's latitude
 * @param {number} userLng User's longitude
 * @returns {Object} { within5km: [], within10km: [], within20km: [] }
 */
function groupShopsByDistance(shops, userLat, userLng) {
  const layers = {
    within5km: [],
    within10km: [],
    within20km: [],
  };

  const parsedLat = parseFloat(userLat);
  const parsedLng = parseFloat(userLng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    throw new Error('Invalid user latitude or longitude');
  }

  for (const shop of shops) {
    let distance;
    if (shop.distance_km !== undefined && shop.distance_km !== null && !isNaN(parseFloat(shop.distance_km))) {
      // PostGIS already computed the distance; use it directly
      distance = parseFloat(shop.distance_km);
    } else {
      const shopLat = parseFloat(shop.lat);
      const shopLng = parseFloat(shop.lng);

      if (isNaN(shopLat) || isNaN(shopLng)) {
        continue;
      }

      distance = haversineDistance(parsedLat, parsedLng, shopLat, shopLng);
    }

    const shopWithDistance = {
      ...shop,
      distance_km: Math.round(distance * 100) / 100,
    };

    if (distance <= 5) {
      layers.within5km.push(shopWithDistance);
    } else if (distance <= 10) {
      layers.within10km.push(shopWithDistance);
    } else if (distance <= 20) {
      layers.within20km.push(shopWithDistance);
    }
  }

  // Sort each layer by distance ascending
  layers.within5km.sort((a, b) => a.distance_km - b.distance_km);
  layers.within10km.sort((a, b) => a.distance_km - b.distance_km);
  layers.within20km.sort((a, b) => a.distance_km - b.distance_km);

  return layers;
}


module.exports = {
  haversineDistance,
  groupShopsByDistance,
};
