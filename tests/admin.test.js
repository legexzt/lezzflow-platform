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
  createTestKyc,
  query,
} = require('./helpers/testDb');

describe('Admin Backend Endpoints', () => {
  let adminUser, sellerUser, customerUser, partnerUser;
  let shop1, shop2;
  let product1, product2, product3;
  let order1, order2, order3;
  let kyc;

  const mockAuth = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid }),
    });

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({
      firebase_uid: 'admin-uid',
      role: 'admin',
      name: 'Admin User',
      phone: '1111111111',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'seller-uid',
      role: 'seller',
      name: 'Seller User',
      phone: '2222222222',
    });

    customerUser = await createTestUser({
      firebase_uid: 'customer-uid',
      role: 'customer',
      name: 'Customer User',
      phone: '3333333333',
    });

    partnerUser = await createTestUser({
      firebase_uid: 'partner-uid',
      role: 'partner',
      name: 'Partner User',
      phone: '4444444444',
    });

    shop1 = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Alpha Store',
      address: '100 Main St',
    });

    shop2 = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Beta Mart',
      address: '200 Oak Ave',
    });

    product1 = await createTestProduct({
      shop_id: shop1.id,
      name: 'Product A',
      category: 'Electronics',
      price: 100.0,
      stock: 10,
    });

    product2 = await createTestProduct({
      shop_id: shop1.id,
      name: 'Product B',
      category: 'Electronics',
      price: 50.0,
      stock: 5,
    });

    product3 = await createTestProduct({
      shop_id: shop2.id,
      name: 'Product C',
      category: 'Groceries',
      price: 25.0,
      stock: 20,
    });

    order1 = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop1.id,
      status: 'placed',
      fulfillment: 'delivery',
      total: 100.0,
    });

    order2 = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop1.id,
      status: 'accepted',
      fulfillment: 'delivery',
      total: 50.0,
    });

    order3 = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop2.id,
      status: 'delivered',
      fulfillment: 'delivery',
      total: 25.0,
    });

    kyc = await createTestKyc({
      partner_id: partnerUser.id,
      status: 'pending',
    });
  });

  describe('GET /api/admin/stats', () => {
    it('(a) should allow admin to get stats with correct shape and counts', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.shops).toBe(2);
      expect(res.body.products).toBe(3);
      expect(res.body.orders).toBe(3);
      expect(res.body.usersByRole.seller).toBe(1);
      expect(res.body.usersByRole.customer).toBe(1);
      expect(res.body.usersByRole.partner).toBe(1);
      expect(res.body.usersByRole.admin).toBe(1);
      expect(res.body.pendingKyc).toBe(1);
      expect(res.body.ordersByStatus.placed).toBe(1);
      expect(res.body.ordersByStatus.accepted).toBe(1);
      expect(res.body.ordersByStatus.delivered).toBe(1);
    });

    it('(b) seller gets 403', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(403);
    });

    it('(c) customer gets 403', async () => {
      mockAuth(customerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });

    it('(d) partner gets 403', async () => {
      mockAuth(partnerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('(e) no token gets 401', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/shops', () => {
    it('(a) should allow admin to list all shops with owner info and shape', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/shops')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      const firstShop = res.body.data[0];
      expect(firstShop).toHaveProperty('id');
      expect(firstShop).toHaveProperty('name');
      expect(firstShop).toHaveProperty('address');
      expect(firstShop).toHaveProperty('lat');
      expect(firstShop).toHaveProperty('lng');
      expect(firstShop).toHaveProperty('is_open');
      expect(firstShop).toHaveProperty('created_at');
      expect(firstShop).toHaveProperty('updated_at');
      expect(firstShop.seller).toEqual({
        id: sellerUser.id,
        name: sellerUser.name,
        phone: sellerUser.phone,
      });
    });

    it('(b) seller gets 403', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/shops')
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(403);
    });

    it('(c) customer gets 403', async () => {
      mockAuth(customerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/shops')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });

    it('(d) partner gets 403', async () => {
      mockAuth(partnerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/shops')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('(e) no token gets 401', async () => {
      const res = await request(app).get('/api/admin/shops');
      expect(res.status).toBe(401);
    });

    it('(g) filters work: /api/admin/shops?search=alpha returns 1', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/shops?search=alpha')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Alpha Store');
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/admin/orders', () => {
    it('(a) should allow admin to list all orders with shop and customer info', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });

      const firstOrder = res.body.data[0];
      expect(firstOrder).toHaveProperty('id');
      expect(firstOrder).toHaveProperty('customer_id');
      expect(firstOrder).toHaveProperty('shop_id');
      expect(firstOrder).toHaveProperty('items');
      expect(firstOrder).toHaveProperty('status');
      expect(firstOrder).toHaveProperty('fulfillment');
      expect(firstOrder).toHaveProperty('total');
      expect(firstOrder).toHaveProperty('created_at');
      expect(firstOrder).toHaveProperty('updated_at');
      expect(firstOrder.shop).toHaveProperty('id');
      expect(firstOrder.shop).toHaveProperty('name');
      expect(firstOrder.customer).toEqual({
        id: customerUser.id,
        name: customerUser.name,
        phone: customerUser.phone,
      });
    });

    it('(b) seller gets 403', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(403);
    });

    it('(c) customer gets 403', async () => {
      mockAuth(customerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });

    it('(d) partner gets 403', async () => {
      mockAuth(partnerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('(e) no token gets 401', async () => {
      const res = await request(app).get('/api/admin/orders');
      expect(res.status).toBe(401);
    });

    it('(f) pagination: limit=2 returns 2 items with pagination.total=3 and page=2 returns the remainder', async () => {
      mockAuth(adminUser.firebase_uid);

      const resPage1 = await request(app)
        .get('/api/admin/orders?page=1&limit=2')
        .set('Authorization', 'Bearer admin-token');

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.length).toBe(2);
      expect(resPage1.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });

      const resPage2 = await request(app)
        .get('/api/admin/orders?page=2&limit=2')
        .set('Authorization', 'Bearer admin-token');

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage2.body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('(g) filters work: /api/admin/orders?status=placed returns 1', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/orders?status=placed')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('placed');
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/admin/users', () => {
    it('(a) should allow admin to list all users with shape', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 4,
        totalPages: 1,
      });

      const user = res.body.data[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('firebase_uid');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('phone');
      expect(user).toHaveProperty('created_at');
      expect(user).toHaveProperty('updated_at');
    });

    it('(b) seller gets 403', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(403);
    });

    it('(c) customer gets 403', async () => {
      mockAuth(customerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });

    it('(d) partner gets 403', async () => {
      mockAuth(partnerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('(e) no token gets 401', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    it('(g) filters work: /api/admin/users?role=seller returns 1', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users?role=seller')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].role).toBe('seller');
      expect(res.body.pagination.total).toBe(1);
    });

    it('(h) /api/admin/users?role=bogus returns 400', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/users?role=bogus')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid role 'bogus'");
    });
  });

  describe('GET /api/admin/products', () => {
    it('(a) should allow admin to list all products with shop info', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });

      const firstProduct = res.body.data[0];
      expect(firstProduct).toHaveProperty('id');
      expect(firstProduct).toHaveProperty('shop_id');
      expect(firstProduct).toHaveProperty('name');
      expect(firstProduct).toHaveProperty('category');
      expect(firstProduct).toHaveProperty('price');
      expect(firstProduct).toHaveProperty('stock');
      expect(firstProduct).toHaveProperty('image_url');
      expect(firstProduct).toHaveProperty('barcode');
      expect(firstProduct).toHaveProperty('created_at');
      expect(firstProduct).toHaveProperty('updated_at');
      expect(firstProduct.shop).toHaveProperty('id');
      expect(firstProduct.shop).toHaveProperty('name');
    });

    it('(b) seller gets 403', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', 'Bearer seller-token');

      expect(res.status).toBe(403);
    });

    it('(c) customer gets 403', async () => {
      mockAuth(customerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });

    it('(d) partner gets 403', async () => {
      mockAuth(partnerUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('(e) no token gets 401', async () => {
      const res = await request(app).get('/api/admin/products');
      expect(res.status).toBe(401);
    });

    it('(f) pagination: limit=2 returns 2 items with pagination.total=3 and page=2 returns remainder', async () => {
      mockAuth(adminUser.firebase_uid);

      const resPage1 = await request(app)
        .get('/api/admin/products?page=1&limit=2')
        .set('Authorization', 'Bearer admin-token');

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.length).toBe(2);
      expect(resPage1.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });

      const resPage2 = await request(app)
        .get('/api/admin/products?page=2&limit=2')
        .set('Authorization', 'Bearer admin-token');

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage2.body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('(g) filters work: /api/admin/products?shopId=<id> returns that shop\'s products', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get(`/api/admin/products?shopId=${shop1.id}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.data.every((p) => p.shop_id === shop1.id)).toBe(true);
    });

    it('returns 400 if shopId is not a positive integer', async () => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .get('/api/admin/products?shopId=invalid')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shopId must be a positive integer');
    });

    it('returns 400 if pagination page or limit is invalid', async () => {
      mockAuth(adminUser.firebase_uid);

      const resPage = await request(app)
        .get('/api/admin/products?page=-1')
        .set('Authorization', 'Bearer admin-token');
      expect(resPage.status).toBe(400);
      expect(resPage.body.error).toContain('page must be a positive integer');

      const resLimit = await request(app)
        .get('/api/admin/products?limit=0')
        .set('Authorization', 'Bearer admin-token');
      expect(resLimit.status).toBe(400);
      expect(resLimit.body.error).toContain('limit must be an integer between 1 and 100');
    });
  });
});
