const { query } = require('../db');
const { groupShopsByDistance } = require('../services/distanceService');

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

    // Only discover open shops
    const result = await query('SELECT * FROM shops WHERE is_open = true');
    const shops = result.rows;

    const layers = groupShopsByDistance(shops, parsedLat, parsedLng);

    return res.json(layers);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  discoverShops,
};
