const { query } = require('../db');

function formatProduct(p) {
  if (!p) return p;
  const stock = parseInt(p.stock, 10) || 0;
  let stock_status = 'in_stock';
  if (stock === 0) {
    stock_status = 'out_of_stock';
  } else if (stock > 0 && stock < 5) {
    stock_status = 'low_stock';
  }
  return {
    ...p,
    stock,
    stock_status,
  };
}

/**
 * GET /api/products
 * List products with optional filters: shop_id, category, search
 * Supports optional cursor pagination: ?limit=N&cursor=<id>
 * When limit/cursor absent: returns plain array (backward compatible).
 * When provided: returns { data, next_cursor, has_more }.
 */
async function listProducts(req, res, next) {
  try {
    const { shop_id, category, search, limit: limitParam, cursor: cursorParam } = req.query;

    const usePagination = limitParam !== undefined || cursorParam !== undefined;

    const conditions = ['1=1'];
    const params = [];

    if (shop_id) {
      params.push(parseInt(shop_id, 10));
      conditions.push(`shop_id = $${params.length}`);
    }

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    if (!usePagination) {
      // Legacy path: return plain array exactly as before
      const sql = `SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY id DESC`;
      const result = await query(sql, params);
      return res.json(result.rows.map(formatProduct));
    }

    // Paginated path
    const limit = Math.min(parseInt(limitParam, 10) || 50, 100);
    const cursor = cursorParam ? parseInt(cursorParam, 10) : null;

    if (cursor !== null) {
      params.push(cursor);
      conditions.push(`id < $${params.length}`);
    }

    // Fetch one extra to determine has_more
    params.push(limit + 1);
    const sql = `SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    const rows = result.rows.map(formatProduct);
    const has_more = rows.length > limit;
    const data = has_more ? rows.slice(0, limit) : rows;
    const next_cursor = has_more ? data[data.length - 1].id : null;

    return res.json({ data, next_cursor, has_more });
  } catch (error) {
    next(error);
  }
}



/**
 * POST /api/products
 * Create product. Seller must own the shop.
 */
async function createProduct(req, res, next) {
  try {
    const { shop_id, name, category, price, stock, image_url, barcode, cost_price } = req.body;

    if (!shop_id || !name || price === undefined) {
      return res.status(400).json({ error: 'shop_id, name, and price are required' });
    }

    // Verify shop ownership
    const shopResult = await query('SELECT * FROM shops WHERE id = $1', [shop_id]);
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = shopResult.rows[0];
    if (shop.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only add products to your own shop' });
    }

    const parsedPrice = parseFloat(price);
    const parsedStock = stock !== undefined ? parseInt(stock, 10) : 0;

    // Optional cost price: null when not provided; must be a non-negative number otherwise.
    let parsedCost = null;
    if (cost_price !== undefined && cost_price !== null && cost_price !== '') {
      parsedCost = parseFloat(cost_price);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        return res.status(400).json({ error: 'cost_price must be a non-negative number' });
      }
    }

    const result = await query(
      `INSERT INTO products (shop_id, name, category, price, stock, image_url, barcode, cost_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [shop_id, name, category || null, parsedPrice, parsedStock, image_url || null, barcode || null, parsedCost]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/:id
 * Get single product by ID
 */
async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(formatProduct(result.rows[0]));
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/products/:id
 * Update product. Seller must own the shop containing the product.
 */
async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const { name, category, price, stock, image_url, barcode, cost_price } = req.body;

    const productResult = await query(
      `SELECT p.*, s.seller_id 
       FROM products p 
       JOIN shops s ON p.shop_id = s.id 
       WHERE p.id = $1`,
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];
    if (product.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop containing this product' });
    }

    const updatedName = name !== undefined ? name : product.name;
    const updatedCategory = category !== undefined ? category : product.category;
    const updatedPrice = price !== undefined ? parseFloat(price) : product.price;
    const updatedStock = stock !== undefined ? parseInt(stock, 10) : product.stock;
    const updatedImageUrl = image_url !== undefined ? image_url : product.image_url;
    const updatedBarcode = barcode !== undefined ? barcode : product.barcode;

    // cost_price: explicit null/'' clears it; omitted keeps the current value.
    let updatedCost = product.cost_price;
    if (cost_price !== undefined) {
      if (cost_price === null || cost_price === '') {
        updatedCost = null;
      } else {
        const parsed = parseFloat(cost_price);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ error: 'cost_price must be a non-negative number' });
        }
        updatedCost = parsed;
      }
    }

    const result = await query(
      `UPDATE products
       SET name = $1, category = $2, price = $3, stock = $4, image_url = $5, barcode = $6, cost_price = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [updatedName, updatedCategory, updatedPrice, updatedStock, updatedImageUrl, updatedBarcode, updatedCost, id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/products/:id
 * Delete product. Seller must own the shop containing the product.
 */
async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    const productResult = await query(
      `SELECT p.*, s.seller_id 
       FROM products p 
       JOIN shops s ON p.shop_id = s.id 
       WHERE p.id = $1`,
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];
    if (product.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop containing this product' });
    }

    await query('DELETE FROM products WHERE id = $1', [id]);
    return res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  compareProducts,
};

/**
 * Normalize a product name for same-item matching across shops:
 * lowercase, trim, collapse inner whitespace.
 */
function normalizeProductName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * GET /api/v1/products/compare?shop_id=<id>&name=<product name>&lat=<lat>&lng=<lng>
 * Returns the same-named product stocked at OTHER open, live shops,
 * each with its real price and real distance_km from (lat, lng),
 * sorted by price ascending. Public — no auth required.
 * Distance is computed with the haversine formula in JS so the endpoint
 * works identically on production PostGIS and the pg-mem test runner.
 */
async function compareProducts(req, res, next) {
  try {
    const shopId = parseInt(req.query.shop_id, 10);
    const name = normalizeProductName(req.query.name);
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (!Number.isFinite(shopId) || !name) {
      return res.status(400).json({ error: 'shop_id and name query params are required' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng query params are required' });
    }

    const result = await query(
      `SELECT p.id AS product_id, p.name, p.price, p.stock,
              s.id AS shop_id, s.name AS shop_name, s.address AS shop_address,
              s.lat AS shop_lat, s.lng AS shop_lng
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       WHERE p.shop_id <> $1
         AND s.is_open = TRUE
         AND s.is_live = TRUE
         AND p.stock > 0
         AND lower(regexp_replace(trim(p.name), '\\s+', ' ', 'g')) = $2
       ORDER BY p.price ASC
       LIMIT 4`,
      [shopId, name]
    );

    return res.json(
      result.rows.map((r) => ({
        product_id: r.product_id,
        name: r.name,
        price: r.price,
        stock: r.stock,
        shop_id: r.shop_id,
        shop_name: r.shop_name,
        shop_address: r.shop_address,
        distance_km: haversineKm(lat, lng, Number(r.shop_lat), Number(r.shop_lng)),
      }))
    );
  } catch (error) {
    next(error);
  }
}

/** Great-circle distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
