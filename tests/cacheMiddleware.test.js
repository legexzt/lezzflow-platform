process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const cacheService = require('../services/cache');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
} = require('./helpers/testDb');

describe('In-Memory LRU Cache & Invalidation', () => {
  let sellerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({
      firebase_uid: 'cache-seller-uid',
      role: 'seller',
      name: 'Cache Seller',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Cached Market',
    });
  });

  describe('Public GET caching', () => {
    it('public GET /api/shops is cached on second identical request (X-Cache: HIT)', async () => {
      // First request: Cache MISS
      const res1 = await request(app).get('/api/shops');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');
      expect(res1.headers['cache-control']).toBe('public, max-age=60');

      // Second identical request: Cache HIT
      const res2 = await request(app).get('/api/shops');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.headers['cache-control']).toBe('public, max-age=60');
      expect(res2.body).toEqual(res1.body);
    });

    it('public GET /api/shops/:id is cached on second request', async () => {
      const res1 = await request(app).get(`/api/shops/${shop.id}`);
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await request(app).get(`/api/shops/${shop.id}`);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.name).toBe('Cached Market');
    });

    it('public GET /api/products is cached on second request', async () => {
      await createTestProduct({ shop_id: shop.id, name: 'Cache Apples' });

      const res1 = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body).toEqual(res1.body);
    });

    it('public GET /api/discover is cached on second request', async () => {
      const res1 = await request(app).get('/api/discover?lat=12.9716&lng=77.5946');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await request(app).get('/api/discover?lat=12.9716&lng=77.5946');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body).toEqual(res1.body);
    });
  });

  describe('Authorization header bypasses cache', () => {
    it('Authorization header bypasses cache on GET /api/shops', async () => {
      // First populate public cache
      await request(app).get('/api/shops');

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const resAuth = await request(app)
        .get('/api/shops?mine=true')
        .set('Authorization', 'Bearer valid-seller-token');

      expect(resAuth.status).toBe(200);
      expect(resAuth.headers['x-cache']).toBeUndefined();
    });

    it('Authorization header on public route does not return X-Cache header', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .get(`/api/shops/${shop.id}`)
        .set('Authorization', 'Bearer valid-seller-token');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBeUndefined();
    });
  });

  describe('Mutation invalidates cache prefix', () => {
    it('POST /api/shops invalidates the /api/shops and /api/discover prefixes', async () => {
      // 1. Prime /api/shops cache
      const firstGet = await request(app).get('/api/shops');
      expect(firstGet.headers['x-cache']).toBe('MISS');

      const hitGet = await request(app).get('/api/shops');
      expect(hitGet.headers['x-cache']).toBe('HIT');

      // 2. Prime /api/discover cache
      const discoverHit = await request(app).get('/api/discover?lat=12.9716&lng=77.5946');
      expect(discoverHit.headers['x-cache']).toBe('MISS');

      // 3. POST /api/shops creates a new shop
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const postRes = await request(app)
        .post('/api/shops')
        .set('Authorization', 'Bearer seller-token')
        .send({
          name: 'Newly Created Shop',
          address: '789 New St',
          lat: 12.975,
          lng: 77.600,
          is_open: true,
        });
      expect(postRes.status).toBe(201);

      // 4. Subsequent GET /api/shops must be a cache MISS and contain the new shop
      const afterPostGet = await request(app).get('/api/shops');
      expect(afterPostGet.headers['x-cache']).toBe('MISS');
      expect(afterPostGet.body.some((s) => s.name === 'Newly Created Shop')).toBe(true);

      // 5. Subsequent GET /api/discover must also be a cache MISS
      const afterDiscover = await request(app).get('/api/discover?lat=12.9716&lng=77.5946');
      expect(afterDiscover.headers['x-cache']).toBe('MISS');
    });

    it('POST /api/products invalidates /api/products and /api/discover prefixes', async () => {
      // 1. Prime /api/products cache
      const prodGet1 = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(prodGet1.headers['x-cache']).toBe('MISS');

      const prodGet2 = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(prodGet2.headers['x-cache']).toBe('HIT');

      // 2. POST /api/products creates a product
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const postRes = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer seller-token')
        .send({
          shop_id: shop.id,
          name: 'Organic Honey',
          category: 'Grocery',
          price: 150.00,
          stock: 20,
        });
      expect(postRes.status).toBe(201);

      // 3. Subsequent GET /api/products is a cache MISS and includes the product
      const prodGetAfter = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(prodGetAfter.headers['x-cache']).toBe('MISS');
      expect(prodGetAfter.body.some((p) => p.name === 'Organic Honey')).toBe(true);
    });
  });

  describe('Excluded & Authenticated routes are never cached', () => {
    it('GET /health is never cached', async () => {
      const res1 = await request(app).get('/health');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBeUndefined();

      const res2 = await request(app).get('/health');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBeUndefined();
    });

    it('GET /api/orders is never cached', async () => {
      const res = await request(app).get('/api/orders');
      expect(res.headers['x-cache']).toBeUndefined();
    });

    it('GET /api/partner/me is never cached', async () => {
      const res = await request(app).get('/api/partner/me');
      expect(res.headers['x-cache']).toBeUndefined();
    });

    it('GET /api/admin/metrics is never cached', async () => {
      const res = await request(app).get('/api/admin/metrics');
      expect(res.headers['x-cache']).toBeUndefined();
    });
  });

  describe('Cache service unit tests', () => {
    it('supports get, set, del, clear, and invalidatePrefix', () => {
      cacheService.clear();
      expect(cacheService.get('testKey')).toBeUndefined();

      cacheService.set('testKey', { value: 123 });
      expect(cacheService.get('testKey')).toEqual({ value: 123 });

      cacheService.del('testKey');
      expect(cacheService.get('testKey')).toBeUndefined();

      cacheService.set('GET:/api/shops/1', { id: 1 });
      cacheService.set('GET:/api/shops/2', { id: 2 });
      cacheService.set('GET:/api/products/1', { id: 1 });

      cacheService.invalidatePrefix('GET:/api/shops');
      expect(cacheService.get('GET:/api/shops/1')).toBeUndefined();
      expect(cacheService.get('GET:/api/shops/2')).toBeUndefined();
      expect(cacheService.get('GET:/api/products/1')).toBeDefined();

      cacheService.clear();
      expect(cacheService.get('GET:/api/products/1')).toBeUndefined();
    });
  });
});
