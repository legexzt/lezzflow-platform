const { query } = require('../db');
const { groupShopsByDistance } = require('../services/distanceService');
const { isDegradedMode } = require('../middleware/degradedMode');
const cacheService = require('../services/cache');
const { buildDiscoveryCacheKey, staleKey } = require('../middleware/cache');

// Lazy, cached PostGIS availability flag (module scope)
let postgisAvailable = null;

async function isPostgisAvailable() {
  if (postgisAvailable !== null) {
    return postgisAvailable;
  }
  try {
    const result = await query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
    postgisAvailable = result.rows.length > 0;
  } catch (_err) {
    // pg-mem or any other error means PostGIS is unavailable
    postgisAvailable = false;
  }
  return postgisAvailable;
}

/**
 * GET /api/discover?lat=&lng=
 * Returns open shops grouped into distance layers: { within5km: [], within10km: [], within20km: [] }
 */
async function discoverShops(req, res, next) {
  try {
    const { lat, lng } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        error: 'lat and lng query parameters are required',
      });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({
        error: 'lat and lng must be valid numbers',
      });
    }

    // DEGRADED_MODE: serve a stale cached discovery result where one exists,
    // so the endpoint stays up without hitting the database.
    if (isDegradedMode()) {
      const key = buildDiscoveryCacheKey(req.originalUrl || req.url || '');
      const stale = cacheService.get(staleKey(key));
      if (stale !== undefined) {
        res.set('X-Cache', 'STALE');
        res.set('X-Degraded-Mode', '1');
        return res.json(stale);
      }
    }

    const hasPostgis = await isPostgisAvailable();
    let shops;

    if (hasPostgis) {
      // PostGIS path: single query that filters within 20 km and returns distance
      // ST_MakePoint takes (lng, lat)
      const result = await query(
        `SELECT s.*, ST_Distance(s.geog, r.ref)::float / 1000 AS distance_km
         FROM shops s,
              (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS ref) r
         WHERE s.is_open = true
           AND s.is_live = true
           AND s.geog IS NOT NULL
           AND ST_DWithin(s.geog, r.ref, 20000)
         ORDER BY s.geog <-> r.ref`,
        [parsedLng, parsedLat]
      );
      shops = result.rows;
      // Strip the raw PostGIS geography value (EWKB hex) so the API shape
      // stays identical to the fallback path and no internal column leaks.
      shops = shops.map(({ geog, ...rest }) => rest);
    } else {
      // Fallback: plain SQL, JS-side haversine grouping
      const result = await query('SELECT * FROM shops WHERE is_open = true AND is_live = true');
      shops = result.rows;
    }

    const layers = groupShopsByDistance(shops, parsedLat, parsedLng);

    return res.json(layers);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  discoverShops,
};
