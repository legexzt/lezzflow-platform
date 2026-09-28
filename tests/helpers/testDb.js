process.env.NODE_ENV = 'test';

const { query, resetTestDb, getPool } = require('../../db');
const admin = require('../../config/firebase');

async function setupTestDb() {
  resetTestDb();
}

async function createTestUser({ firebase_uid, role = 'customer', name = 'Test User', phone = '1234567890' }) {
  const result = await query(
    `INSERT INTO users (firebase_uid, role, name, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [firebase_uid, role, name, phone]
  );
  return result.rows[0];
}

async function createTestShop({ seller_id, name = 'Test Shop', address = '123 Market St', lat = 12.9716, lng = 77.5946, is_open = true, is_live = true, open_time = null, close_time = null, category = null }) {
  const result = await query(
    `INSERT INTO shops (seller_id, name, address, lat, lng, is_open, is_live, open_time, close_time, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [seller_id, name, address, lat, lng, is_open, is_live, open_time, close_time, category]
  );
  return result.rows[0];
}

async function createTestProduct({ shop_id, name = 'Test Product', category = 'Grocery', price = 99.99, stock = 10, image_url = null, barcode = null }) {
  const result = await query(
    `INSERT INTO products (shop_id, name, category, price, stock, image_url, barcode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [shop_id, name, category, price, stock, image_url, barcode]
  );
  return result.rows[0];
}

async function createTestOrder({ customer_id, shop_id, items = [{ product_id: 1, quantity: 1, price: 99.99 }], fulfillment = 'delivery', total = 99.99, status = 'placed' }) {
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
  const result = await query(
    `INSERT INTO orders (customer_id, shop_id, items, fulfillment, total, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [customer_id, shop_id, itemsJson, fulfillment, total, status]
  );
  return result.rows[0];
}

async function createTestKyc({ partner_id, aadhaar_url = 'https://example.com/aadhaar.jpg', pan_url = 'https://example.com/pan.jpg', license_url = 'https://example.com/license.jpg', status = 'pending' }) {
  const result = await query(
    `INSERT INTO partner_kyc (partner_id, aadhaar_url, pan_url, license_url, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [partner_id, aadhaar_url, pan_url, license_url, status]
  );
  return result.rows[0];
}

async function createTestDeliveryRequest({ order_id, partner_id = null, status = 'requested' }) {
  const result = await query(
    `INSERT INTO delivery_requests (order_id, partner_id, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [order_id, partner_id, status]
  );
  return result.rows[0];
}

module.exports = {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
  createTestOrder,
  createTestKyc,
  createTestDeliveryRequest,
  query,
};
