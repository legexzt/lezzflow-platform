const { query } = require('../db');

/**
 * GET /api/shops
 * List shops. If query mine=true and authenticated as seller, return seller's shops.
 */
async function listShops(req, res, next) {
  try {
    const { mine, is_open } = req.query;

    if (mine === 'true' && req.user) {
      const result = await query('SELECT * FROM shops WHERE seller_id = $1 ORDER BY id DESC', [req.user.id]);
      return res.json(result.rows);
    }

    let sql = 'SELECT * FROM shops';
    const params = [];
    if (is_open !== undefined) {
      params.push(is_open === 'true');
      sql += ' WHERE is_open = $1';
    }
    sql += ' ORDER BY id DESC';

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/shops
 * Create a new shop. Requires 'seller' role.
 */
async function createShop(req, res, next) {
  try {
    const { name, address, lat, lng, is_open } = req.body;

    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Shop name, lat, and lng are required' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers' });
    }

    const result = await query(
      `INSERT INTO shops (seller_id, name, address, lat, lng, is_open)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, name, address || null, parsedLat, parsedLng, is_open !== undefined ? is_open : true]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/shops/:id
 * Get single shop by ID
 */
async function getShopById(req, res, next) {
  try {
    const { id } = req.params;
    const shopResult = await query('SELECT * FROM shops WHERE id = $1', [id]);

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    return res.json(shopResult.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/shops/:id
 * Update shop. Seller must own the shop.
 */
async function updateShop(req, res, next) {
  try {
    const { id } = req.params;
    const { name, address, lat, lng, is_open } = req.body;

    const existing = await query('SELECT * FROM shops WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = existing.rows[0];
    if (shop.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own this shop' });
    }

    const updatedName = name !== undefined ? name : shop.name;
    const updatedAddress = address !== undefined ? address : shop.address;
    const updatedLat = lat !== undefined ? parseFloat(lat) : shop.lat;
    const updatedLng = lng !== undefined ? parseFloat(lng) : shop.lng;
    const updatedIsOpen = is_open !== undefined ? is_open : shop.is_open;

    const result = await query(
      `UPDATE shops
       SET name = $1, address = $2, lat = $3, lng = $4, is_open = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [updatedName, updatedAddress, updatedLat, updatedLng, updatedIsOpen, id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/shops/:id
 * Delete shop. Seller must own the shop.
 */
async function deleteShop(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM shops WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = existing.rows[0];
    if (shop.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own this shop' });
    }

    await query('DELETE FROM shops WHERE id = $1', [id]);
    return res.json({ message: 'Shop deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listShops,
  createShop,
  getShopById,
  updateShop,
  deleteShop,
};
