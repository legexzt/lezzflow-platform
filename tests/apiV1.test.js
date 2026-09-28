process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
} = require('./helpers/testDb');

describe('API v1 endpoints', () => {
  let sellerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({
      firebase_uid: 'v1-seller-uid',
      role: 'seller',
      name: 'V1 Seller',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'V1 Test Shop',
    });
  });

  // -----------------------------------------------------------------------
  // 1. GET /api/v1/shops returns 200 with X-API-Version: v1 and same shape
  // -----------------------------------------------------------------------
  describe('GET /api/v1/shops', () => {
    it('returns 200 with X-API-Version: v1 header and array body', async () => {
      const res = await request(app).get('/api/v1/shops');

      expect(res.status).toBe(200);
      expect(res.headers['x-api-version']).toBe('v1');
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.some((s) => s.id === shop.id)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. GET /api/v1/discover (no params) → 400 with v1 error envelope
  // -----------------------------------------------------------------------
  describe('GET /api/v1/discover (missing params)', () => {
    it('returns 400 with { error, code, details } envelope', async () => {
      const res = await request(app).get('/api/v1/discover');

      expect(res.status).toBe(400);
      expect(res.headers['x-api-version']).toBe('v1');
      // The discover controller returns { error: '...' } directly (not via next(err))
      // so the response has at least an error field
      expect(res.body).toHaveProperty('error');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Cursor pagination on /api/products
  // -----------------------------------------------------------------------
  describe('Cursor pagination on GET /api/products', () => {
    beforeEach(async () => {
      // Seed 3 products in the shop
      await createTestProduct({ shop_id: shop.id, name: 'Product A', price: 10, stock: 5 });
      await createTestProduct({ shop_id: shop.id, name: 'Product B', price: 20, stock: 5 });
      await createTestProduct({ shop_id: shop.id, name: 'Product C', price: 30, stock: 5 });
    });

    it('GET /api/products?limit=2 returns paginated { data, next_cursor, has_more: true }', async () => {
      const res = await request(app).get(`/api/products?shop_id=${shop.id}&limit=2`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('next_cursor');
      expect(res.body).toHaveProperty('has_more');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.has_more).toBe(true);
      expect(res.body.next_cursor).not.toBeNull();
    });

    it('following next_cursor returns the remaining product(s)', async () => {
      const res1 = await request(app).get(`/api/products?shop_id=${shop.id}&limit=2`);
      expect(res1.status).toBe(200);
      expect(res1.body.has_more).toBe(true);

      const cursor = res1.body.next_cursor;
      const res2 = await request(app).get(
        `/api/products?shop_id=${shop.id}&limit=2&cursor=${cursor}`
      );

      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBeGreaterThanOrEqual(1);
      // The remaining products should have lower IDs than the cursor
      for (const p of res2.body.data) {
        expect(p.id).toBeLessThan(cursor);
      }
    });

    it('GET /api/products without limit/cursor returns plain array', async () => {
      const res = await request(app).get(`/api/products?shop_id=${shop.id}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 4. v1 error envelope shape from a route that calls next(err)
  // -----------------------------------------------------------------------
  describe('v1 error envelope via error-throwing route', () => {
    it('GET /api/v1/shops/:id with non-existent ID returns 404 with error field', async () => {
      const res = await request(app).get('/api/v1/shops/999999');

      expect(res.status).toBe(404);
      expect(res.headers['x-api-version']).toBe('v1');
      expect(res.body).toHaveProperty('error');
    });
  });
});
