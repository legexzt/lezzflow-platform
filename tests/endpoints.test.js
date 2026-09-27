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

describe('Core Endpoints (Shops, Products, Health, Upload, Payments)', () => {
  let sellerUser, otherSellerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({
      firebase_uid: 'seller-crud-uid',
      role: 'seller',
      name: 'Seller Sam',
    });

    otherSellerUser = await createTestUser({
      firebase_uid: 'other-crud-uid',
      role: 'seller',
      name: 'Seller Oscar',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Sam Grocery Store',
    });
  });

  describe('GET /health & GET /api/payment', () => {
    it('GET /health should return 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.uptime).toBeDefined();
    });

    it('GET /api/payment should return coming_soon status', async () => {
      const res = await request(app).get('/api/payment');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('coming_soon');
      expect(res.body.message).toBe('Payment coming soon');
    });
  });

  describe('POST /api/upload', () => {
    it('should save file to uploads folder and return URL', async () => {
      const fakeBuffer = Buffer.from('mock file content');
      const res = await request(app)
        .post('/api/upload')
        .attach('file', fakeBuffer, { filename: 'sample-doc.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\//);
      expect(res.body.storage).toBe('local');
    });

    it('should return 400 if no file is provided', async () => {
      const res = await request(app).post('/api/upload');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No file uploaded');
    });
  });

  describe('Shops CRUD Endpoints', () => {
    it('GET /api/shops should list shops', async () => {
      const res = await request(app).get('/api/shops');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/shops should create shop for seller', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/shops')
        .set('Authorization', 'Bearer seller-token')
        .send({
          name: 'Sam Second Store',
          address: '456 Commercial Street',
          lat: 12.9800,
          lng: 77.6100,
          is_open: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Sam Second Store');
      expect(res.body.seller_id).toBe(sellerUser.id);
    });

    it('GET /api/shops/:id should return single shop', async () => {
      const res = await request(app).get(`/api/shops/${shop.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(shop.id);
    });

    it('PUT /api/shops/:id should update shop owned by seller', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .put(`/api/shops/${shop.id}`)
        .set('Authorization', 'Bearer seller-token')
        .send({ name: 'Sam Updated Store' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Sam Updated Store');
    });

    it('PUT /api/shops/:id should reject update if not owned by seller with 403', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: otherSellerUser.firebase_uid }),
      });

      const res = await request(app)
        .put(`/api/shops/${shop.id}`)
        .set('Authorization', 'Bearer other-seller-token')
        .send({ name: 'Hacked Store Name' });

      expect(res.status).toBe(403);
    });

    it('DELETE /api/shops/:id should delete shop owned by seller', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .delete(`/api/shops/${shop.id}`)
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Shop deleted successfully');
    });
  });

  describe('Products CRUD Endpoints', () => {
    let product;

    beforeEach(async () => {
      product = await createTestProduct({
        shop_id: shop.id,
        name: 'Fresh Milk',
        category: 'Dairy',
        price: 45.00,
        stock: 50,
      });
    });

    it('GET /api/products should list products', async () => {
      const res = await request(app).get(`/api/products?shop_id=${shop.id}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(p => p.id === product.id)).toBe(true);
    });

    it('POST /api/products should create product in seller own shop', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer seller-token')
        .send({
          shop_id: shop.id,
          name: 'Butter',
          category: 'Dairy',
          price: 60.00,
          stock: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Butter');
      expect(parseFloat(res.body.price)).toBe(60.00);
    });

    it('POST /api/products should reject adding to other seller shop with 403', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: otherSellerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer other-seller-token')
        .send({
          shop_id: shop.id,
          name: 'Illegal Product',
          price: 10,
        });

      expect(res.status).toBe(403);
    });

    it('PUT /api/products/:id should update product', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .put(`/api/products/${product.id}`)
        .set('Authorization', 'Bearer seller-token')
        .send({ price: 48.00, stock: 45 });

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.price)).toBe(48.00);
      expect(res.body.stock).toBe(45);
    });

    it('DELETE /api/products/:id should delete product', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .delete(`/api/products/${product.id}`)
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Product deleted successfully');
    });
  });

  describe('404 Route Handler', () => {
    it('should return 404 for undefined routes', async () => {
      const res = await request(app).get('/api/unknown/endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Route not found');
    });
  });
});
