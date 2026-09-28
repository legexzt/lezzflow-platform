const { query } = require('../db');

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Verify the requester owns the shop (seller) or is admin.
 * @returns the shop row or null
 */
async function getOwnedShop(shopId, user) {
  const result = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
  if (result.rows.length === 0) return null;
  const shop = result.rows[0];
  if (user.role !== 'admin' && shop.seller_id !== user.id) return null;
  return shop;
}

function validateOfferInput(body) {
  const errors = [];
  const { title, discount_type, discount_value, min_order } = body || {};
  if (!title || !String(title).trim()) errors.push('title is required');
  if (!['flat', 'percent'].includes(discount_type))
    errors.push("discount_type must be 'flat' or 'percent'");
  const dv = Number(discount_value);
  if (!Number.isFinite(dv) || dv < 0) errors.push('discount_value must be a non-negative number');
  if (discount_type === 'percent' && dv > 100)
    errors.push('discount_value cannot exceed 100 for percent offers');
  if (min_order !== undefined && min_order !== null && min_order !== '') {
    const mo = Number(min_order);
    if (!Number.isFinite(mo) || mo < 0) errors.push('min_order must be a non-negative number');
  }
  return errors;
}

/**
 * POST /api/v1/shops/:id/offers — seller creates a Dukaan Offer for their shop.
 */
async function createOffer(req, res, next) {
  try {
    const shopId = toInt(req.params.id);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });
    const shop = await getOwnedShop(shopId, req.user);
    if (!shop) return res.status(404).json({ error: 'Shop not found or not yours' });

    const errors = validateOfferInput(req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    const {
      title,
      description = null,
      discount_type,
      discount_value,
      min_order = 0,
      active = true,
      valid_from = null,
      valid_to = null,
    } = req.body;

    const result = await query(
      `INSERT INTO shop_offers
         (shop_id, title, description, discount_type, discount_value, min_order, active, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        shopId,
        String(title).trim(),
        description ? String(description).trim() : null,
        discount_type,
        Number(discount_value),
        Number(min_order) || 0,
        active !== false,
        valid_from || null,
        valid_to || null,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/shops/:id/offers
 * - Seller (owner) / admin: all offers for the shop.
 * - Everyone else (customers): only active offers whose validity window includes now.
 */
async function listOffers(req, res, next) {
  try {
    const shopId = toInt(req.params.id);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });

    const shopResult = await query('SELECT id, seller_id FROM shops WHERE id = $1', [shopId]);
    if (shopResult.rows.length === 0) return res.status(404).json({ error: 'Shop not found' });
    const shop = shopResult.rows[0];

    const isOwner =
      req.user && (req.user.role === 'admin' || (req.user.role === 'seller' && shop.seller_id === req.user.id));

    let sql = 'SELECT * FROM shop_offers WHERE shop_id = $1';
    if (!isOwner) {
      sql += ` AND active = TRUE
               AND (valid_from IS NULL OR valid_from <= now())
               AND (valid_to IS NULL OR valid_to >= now())`;
    }
    sql += ' ORDER BY id DESC';
    const result = await query(sql, [shopId]);
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/shops/:id/offers/:offerId — seller updates their offer.
 */
async function updateOffer(req, res, next) {
  try {
    const shopId = toInt(req.params.id);
    const offerId = toInt(req.params.offerId);
    if (!shopId || !offerId) return res.status(400).json({ error: 'Invalid shop or offer id' });
    const shop = await getOwnedShop(shopId, req.user);
    if (!shop) return res.status(404).json({ error: 'Shop not found or not yours' });

    const existing = await query('SELECT * FROM shop_offers WHERE id = $1 AND shop_id = $2', [
      offerId,
      shopId,
    ]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });

    const merged = { ...existing.rows[0], ...req.body };
    const errors = validateOfferInput(merged);
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    const allowed = ['title', 'description', 'discount_type', 'discount_value', 'min_order', 'active', 'valid_from', 'valid_to'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');

    params.push(offerId);
    params.push(shopId);
    const result = await query(
      `UPDATE shop_offers SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND shop_id = $${params.length} RETURNING *`,
      params
    );
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/offers
 * Admin: all shop offers joined with shop name, latest first, capped at 200.
 */
async function listAdminOffers(req, res, next) {
  try {
    const result = await query(
      `SELECT so.*, s.name AS shop_name
       FROM shop_offers so
       JOIN shops s ON s.id = so.shop_id
       ORDER BY so.created_at DESC
       LIMIT 200`
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOffer,
  listOffers,
  updateOffer,
  listAdminOffers,
};
