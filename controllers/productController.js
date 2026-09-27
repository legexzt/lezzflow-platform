const { query } = require('../db');

/**
 * GET /api/products
 * List products with optional filters: shop_id, category, search
 */
async function listProducts(req, res, next) {
  try {
    const { shop_id, category, search } = req.query;

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (shop_id) {
      params.push(parseInt(shop_id, 10));
      sql += ` AND shop_id = $${params.length}`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND name ILIKE $${params.length}`;
    }

    sql += ' ORDER BY id DESC';

    const result = await query(sql, params);
    return res.json(result.rows);
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
    const { shop_id, name, category, price, stock, image_url, barcode } = req.body;

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

    const result = await query(
      `INSERT INTO products (shop_id, name, category, price, stock, image_url, barcode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [shop_id, name, category || null, parsedPrice, parsedStock, image_url || null, barcode || null]
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

    return res.json(result.rows[0]);
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
    const { name, category, price, stock, image_url, barcode } = req.body;

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

    const result = await query(
      `UPDATE products
       SET name = $1, category = $2, price = $3, stock = $4, image_url = $5, barcode = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [updatedName, updatedCategory, updatedPrice, updatedStock, updatedImageUrl, updatedBarcode, id]
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
};
