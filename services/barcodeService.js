/**
 * Lookup barcode details via OpenFoodFacts API v2
 * @param {string} code Barcode string
 * @returns {Promise<{found: boolean, name?: string, brands?: string, image?: string}>}
 */
async function lookupBarcode(code) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error('Barcode is required');
  }

  const cleanCode = code.trim();
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;

  const startedAt = Date.now();
  const { logAiCall } = require('./aiCallLog');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LezzFlowPlatform - Node.js API - Version 1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        logAiCall({ kind: 'barcode', status: 'ok', latencyMs: Date.now() - startedAt });
        return { found: false };
      }
      logAiCall({ kind: 'barcode', status: 'ok', latencyMs: Date.now() - startedAt });
      return { found: false };
    }

    const data = await res.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const name = product.product_name || product.product_name_en || '';
      const brands = product.brands || '';
      const image = product.image_url || product.image_front_url || product.image_front_small_url || '';

      logAiCall({ kind: 'barcode', status: 'ok', latencyMs: Date.now() - startedAt });
      return {
        found: true,
        name,
        brands,
        image,
      };
    }

    logAiCall({ kind: 'barcode', status: 'ok', latencyMs: Date.now() - startedAt });
    return { found: false };
  } catch (err) {
    console.error(`Error querying OpenFoodFacts for code ${cleanCode}:`, err.message);
    logAiCall({ kind: 'barcode', status: 'error', latencyMs: Date.now() - startedAt, error: err.message });
    return { found: false };
  }
}

/**
 * Resolve barcode to a product for a specific shop.
 * Resolves barcode against the shop's products.
 * If product belongs to another shop, rejects with 403.
 * If product is not found, rejects with 404.
 * @param {string} barcode Barcode string
 * @param {number} shopId Shop ID
 * @returns {Promise<{product: object}>}
 */
async function resolveProductByBarcode(barcode, shopId) {
  if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
    const err = new Error('Barcode is required');
    err.status = 400;
    throw err;
  }

  const cleanBarcode = barcode.trim();
  const { query } = require('../db');

  // Check if product exists in this shop
  const shopProdRes = await query(
    'SELECT * FROM products WHERE barcode = $1 AND shop_id = $2',
    [cleanBarcode, shopId]
  );

  if (shopProdRes.rows.length > 0) {
    return { product: shopProdRes.rows[0] };
  }

  // Check if barcode belongs to another shop
  const otherShopRes = await query(
    'SELECT id, shop_id FROM products WHERE barcode = $1 LIMIT 1',
    [cleanBarcode]
  );

  if (otherShopRes.rows.length > 0) {
    const err = new Error('Product belongs to another shop');
    err.status = 403;
    throw err;
  }

  const err = new Error('Product not found for barcode');
  err.status = 404;
  throw err;
}

module.exports = {
  lookupBarcode,
  resolveProductByBarcode,
  resolveBarcodeToProduct: resolveProductByBarcode,
};

