process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
  createTestOrder,
  query,
} = require('./helpers/testDb');

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

describe('Scan & Pack backend', () => {
  let sellerUser, otherSellerUser, customerUser, adminUser;
  let shop, otherShop;
  let product1, product2, zeroStockProduct, otherShopProduct;
  let order;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({
      firebase_uid: 'pack-seller-uid',
      role: 'seller',
      name: 'Pack Seller',
    });

    otherSellerUser = await createTestUser({
      firebase_uid: 'other-pack-seller-uid',
      role: 'seller',
      name: 'Other Seller',
    });

    customerUser = await createTestUser({
      firebase_uid: 'pack-customer-uid',
      role: 'customer',
      name: 'Pack Customer',
    });

    adminUser = await createTestUser({
      firebase_uid: 'pack-admin-uid',
      role: 'admin',
      name: 'Pack Admin',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Seller Main Mart',
      address: 'Shop No 1, Main Road',
    });

    otherShop = await createTestShop({
      seller_id: otherSellerUser.id,
      name: 'Other Mart',
      address: 'Shop No 2, Second Road',
    });

    product1 = await createTestProduct({
      shop_id: shop.id,
      name: 'Basmati Rice 1kg',
      price: 100,
      stock: 5,
      barcode: '8901234567890',
    });

    product2 = await createTestProduct({
      shop_id: shop.id,
      name: 'Toor Dal 500g',
      price: 60,
      stock: 4,
      barcode: '8901234567891',
    });

    zeroStockProduct = await createTestProduct({
      shop_id: shop.id,
      name: 'Sugar 1kg',
      price: 45,
      stock: 0,
      barcode: '8901234567892',
    });

    otherShopProduct = await createTestProduct({
      shop_id: otherShop.id,
      name: 'Foreign Biscuit',
      price: 20,
      stock: 10,
      barcode: '8909999999999',
    });

    order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      status: 'accepted',
      items: [
        { product_id: product1.id, name: 'Basmati Rice 1kg', qty: 2, price: 100 },
        { product_id: product2.id, name: 'Toor Dal 500g', qty: 1, price: 60 },
      ],
      total: 260,
      fulfillment: 'delivery',
    });
  });

  describe('POST /api/orders/:id/pack-scan', () => {
    it('successfully scans product, decrements stock, records pack_scan, and returns progress & running_bill', async () => {
      authAs(sellerUser.firebase_uid);

      // Scan 1 of product 1
      const res1 = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res1.status).toBe(200);
      expect(res1.body.product).toMatchObject({
        id: product1.id,
        name: 'Basmati Rice 1kg',
        price: 100,
      });
      expect(res1.body.scanned_qty).toBe(1);
      expect(res1.body.ordered_qty).toBe(2);
      expect(res1.body.remaining).toBe(1);
      expect(res1.body.progress).toEqual({
        scanned_total: 1,
        ordered_total: 3,
      });
      expect(res1.body.running_bill.lines).toHaveLength(1);
      expect(res1.body.running_bill.lines[0]).toEqual({
        product_id: product1.id,
        name: 'Basmati Rice 1kg',
        qty: 1,
        unit_price: 100,
        line_total: 100,
      });
      expect(res1.body.running_bill.total).toBe(100);

      // Check stock decremented in DB from 5 to 4
      const p1Check = await query('SELECT stock FROM products WHERE id = $1', [product1.id]);
      expect(p1Check.rows[0].stock).toBe(4);

      // Scan 2 of product 1
      const res2 = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res2.status).toBe(200);
      expect(res2.body.scanned_qty).toBe(2);
      expect(res2.body.ordered_qty).toBe(2);
      expect(res2.body.remaining).toBe(0);
      expect(res2.body.progress).toEqual({
        scanned_total: 2,
        ordered_total: 3,
      });
      expect(res2.body.running_bill.lines[0].qty).toBe(2);
      expect(res2.body.running_bill.lines[0].line_total).toBe(200);
      expect(res2.body.running_bill.total).toBe(200);

      // Stock decremented to 3
      const p1Check2 = await query('SELECT stock FROM products WHERE id = $1', [product1.id]);
      expect(p1Check2.rows[0].stock).toBe(3);
    });

    it('rejects over-scan when product is already fully scanned', async () => {
      authAs(sellerUser.firebase_uid);

      // Scan twice to reach ordered qty (2)
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      // Scan 3rd time
      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already fully scanned');

      // Stock should remain 3 (no decrement on rejected scan)
      const p1Check = await query('SELECT stock FROM products WHERE id = $1', [product1.id]);
      expect(p1Check.rows[0].stock).toBe(3);
    });

    it('rejects pack-scan with 400 out of stock when product stock is 0', async () => {
      // Create an order containing the zero-stock product
      const zeroStockOrder = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'accepted',
        items: [{ product_id: zeroStockProduct.id, name: 'Sugar 1kg', qty: 1, price: 45 }],
        total: 45,
        fulfillment: 'pickup',
      });

      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${zeroStockOrder.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567892' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('out of stock');

      // Check no row created in pack_scans
      const scanCheck = await query('SELECT * FROM pack_scans WHERE order_id = $1', [zeroStockOrder.id]);
      expect(scanCheck.rows).toHaveLength(0);
    });

    it('rejects pack-scan with 403 when barcode belongs to another shop', async () => {
      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8909999999999' }); // Belongs to otherShop

      expect(res.status).toBe(403);
    });

    it('rejects pack-scan with 403 when order belongs to another seller', async () => {
      authAs(otherSellerUser.firebase_uid); // other seller attempts to scan order for shop 1

      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res.status).toBe(403);
    });

    it('rejects pack-scan with 400 when order status is not accepted', async () => {
      const placedOrder = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'placed',
        items: [{ product_id: product1.id, qty: 1, price: 100 }],
        total: 100,
      });

      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${placedOrder.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('accepted');
    });

    it('rejects pack-scan with 404 when order does not exist', async () => {
      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post('/api/orders/99999/pack-scan')
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res.status).toBe(404);
    });

    it('rejects pack-scan with 404 when barcode does not exist anywhere', async () => {
      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '0000000000000' });

      expect(res.status).toBe(404);
    });

    it('rejects pack-scan with 400 when product is not in order items', async () => {
      // product with barcode exists in shop, but not ordered in order
      const unboughtProduct = await createTestProduct({
        shop_id: shop.id,
        name: 'Unbought Item',
        price: 25,
        stock: 5,
        barcode: '8901111111111',
      });

      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901111111111' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Product is not in this order');
    });

    it('rejects non-seller roles from calling pack-scan', async () => {
      authAs(customerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/orders/:id/bill', () => {
    it('returns empty lines and 0 total when nothing scanned yet', async () => {
      authAs(sellerUser.firebase_uid);

      const res = await request(app)
        .get(`/api/orders/${order.id}/bill`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        shop: {
          name: 'Seller Main Mart',
          address: 'Shop No 1, Main Road',
        },
        order_id: order.id,
        date: expect.any(String),
        lines: [],
        total: 0,
        status: 'accepted',
      });
    });

    it('returns bill with scanned items and correct totals after scanning', async () => {
      authAs(sellerUser.firebase_uid);

      // Scan product 1 twice and product 2 once
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567891' });

      const res = await request(app)
        .get(`/api/orders/${order.id}/bill`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.shop).toEqual({
        name: 'Seller Main Mart',
        address: 'Shop No 1, Main Road',
      });
      expect(res.body.order_id).toBe(order.id);
      expect(res.body.status).toBe('accepted');
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.lines).toEqual([
        {
          name: 'Basmati Rice 1kg',
          qty_scanned: 2,
          unit_price: 100,
          line_total: 200,
        },
        {
          name: 'Toor Dal 500g',
          qty_scanned: 1,
          unit_price: 60,
          line_total: 60,
        },
      ]);
      expect(res.body.total).toBe(260);
    });

    it('allows admin to view any order bill', async () => {
      authAs(adminUser.firebase_uid);

      const res = await request(app)
        .get(`/api/orders/${order.id}/bill`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.order_id).toBe(order.id);
    });

    it('rejects foreign seller from viewing bill with 403', async () => {
      authAs(otherSellerUser.firebase_uid);

      const res = await request(app)
        .get(`/api/orders/${order.id}/bill`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('rejects customer from viewing bill with 403', async () => {
      authAs(customerUser.firebase_uid);

      const res = await request(app)
        .get(`/api/orders/${order.id}/bill`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/orders/:id/confirm-pack', () => {
    it('rejects with 400 and pending items when scanning is incomplete', async () => {
      authAs(sellerUser.firebase_uid);

      // Only scan product 1 once (ordered: 2), and product 2 not scanned at all (ordered: 1)
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });

      const res = await request(app)
        .post(`/api/orders/${order.id}/confirm-pack`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot confirm pack');
      expect(res.body.pending).toHaveLength(2);
      expect(res.body.pending).toEqual([
        {
          product_id: product1.id,
          name: 'Basmati Rice 1kg',
          ordered: 2,
          scanned: 1,
        },
        {
          product_id: product2.id,
          name: 'Toor Dal 500g',
          ordered: 1,
          scanned: 0,
        },
      ]);

      // Order status remains 'accepted'
      const orderCheck = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
      expect(orderCheck.rows[0].status).toBe('accepted');
    });

    it('transitions order to packed when all items fully scanned', async () => {
      authAs(sellerUser.firebase_uid);

      // Scan product 1 twice and product 2 once
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567890' });
      await request(app)
        .post(`/api/orders/${order.id}/pack-scan`)
        .set('Authorization', 'Bearer token')
        .send({ barcode: '8901234567891' });

      const res = await request(app)
        .post(`/api/orders/${order.id}/confirm-pack`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        order_id: order.id,
        status: 'packed',
        items_packed: 3,
        total: 260,
      });

      // Verify order status in DB
      const orderCheck = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
      expect(orderCheck.rows[0].status).toBe('packed');
    });

    it('rejects confirm-pack from foreign seller with 403', async () => {
      authAs(otherSellerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/confirm-pack`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('rejects confirm-pack from non-seller roles with 403', async () => {
      authAs(customerUser.firebase_uid);

      const res = await request(app)
        .post(`/api/orders/${order.id}/confirm-pack`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });
  });

  describe('Stock visibility & stock_status in product listing', () => {
    it('computes stock_status out_of_stock, low_stock, and in_stock accurately', async () => {
      const res = await request(app).get(`/api/products?shop_id=${shop.id}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const sugar = res.body.find((p) => p.id === zeroStockProduct.id);
      expect(sugar.stock).toBe(0);
      expect(sugar.stock_status).toBe('out_of_stock');

      const dal = res.body.find((p) => p.id === product2.id);
      expect(dal.stock).toBe(4);
      expect(dal.stock_status).toBe('low_stock');

      const rice = res.body.find((p) => p.id === product1.id);
      expect(rice.stock).toBe(5);
      expect(rice.stock_status).toBe('in_stock');
    });

    it('preserves stock_status in paginated product listing', async () => {
      const res = await request(app).get(`/api/products?shop_id=${shop.id}&limit=2`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data[0]).toHaveProperty('stock_status');
    });
  });
});
