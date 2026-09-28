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

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

describe('Seller Cycle — cost_price on products', () => {
  let sellerUser, otherSeller, shop, product;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({ firebase_uid: 'sc-seller-uid', role: 'seller', name: 'SC Seller' });
    otherSeller = await createTestUser({ firebase_uid: 'sc-seller2-uid', role: 'seller', name: 'SC Other' });
    shop = await createTestShop({ seller_id: sellerUser.id, name: 'SC Shop' });
    product = await createTestProduct({ shop_id: shop.id, name: 'SC Item', price: 100, stock: 10 });
  });

  test('create product with cost_price stores it', async () => {
    authAs('sc-seller-uid');
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer test-token')
      .send({ shop_id: shop.id, name: 'Costed Item', price: 120, cost_price: 80 });
    expect(res.status).toBe(201);
    expect(Number(res.body.cost_price)).toBe(80);
  });

  test('create product without cost_price leaves it null', async () => {
    authAs('sc-seller-uid');
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer test-token')
      .send({ shop_id: shop.id, name: 'No Cost Item', price: 50 });
    expect(res.status).toBe(201);
    expect(res.body.cost_price).toBeNull();
  });

  test('negative cost_price is rejected', async () => {
    authAs('sc-seller-uid');
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer test-token')
      .send({ shop_id: shop.id, name: 'Bad Cost', price: 50, cost_price: -5 });
    expect(res.status).toBe(400);
  });

  test('update product cost_price; explicit null clears it', async () => {
    authAs('sc-seller-uid');
    let res = await request(app)
      .put(`/api/v1/products/${product.id}`)
      .set('Authorization', 'Bearer test-token')
      .send({ cost_price: 60 });
    expect(res.status).toBe(200);
    expect(Number(res.body.cost_price)).toBe(60);

    res = await request(app)
      .put(`/api/v1/products/${product.id}`)
      .set('Authorization', 'Bearer test-token')
      .send({ cost_price: null });
    expect(res.status).toBe(200);
    expect(res.body.cost_price).toBeNull();
  });

  test('other seller cannot set cost_price on foreign product', async () => {
    authAs('sc-seller2-uid');
    const res = await request(app)
      .put(`/api/v1/products/${product.id}`)
      .set('Authorization', 'Bearer test-token')
      .send({ cost_price: 10 });
    expect(res.status).toBe(403);
  });
});

describe('Seller Cycle — per-day shop timings', () => {
  let sellerUser, otherSeller, adminUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({ firebase_uid: 'st-seller-uid', role: 'seller', name: 'ST Seller' });
    otherSeller = await createTestUser({ firebase_uid: 'st-seller2-uid', role: 'seller', name: 'ST Other' });
    adminUser = await createTestUser({ firebase_uid: 'st-admin-uid', role: 'admin', name: 'ST Admin' });
    shop = await createTestShop({ seller_id: sellerUser.id, name: 'ST Shop' });
  });

  const week = () =>
    Array.from({ length: 7 }, (_, dow) => ({
      day_of_week: dow,
      open_time: '09:00',
      close_time: '21:00',
      is_closed: dow === 0,
    }));

  test('owner can save and read 7-day timings', async () => {
    authAs('st-seller-uid');
    const put = await request(app)
      .put(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token')
      .send({ timings: week() });
    expect(put.status).toBe(200);
    expect(put.body.saved).toBe(7);

    const get = await request(app)
      .get(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token');
    expect(get.status).toBe(200);
    expect(get.body.timings).toHaveLength(7);
    expect(get.body.timings[0].is_closed).toBe(true);
    expect(get.body.timings[1].open_time).toBe('09:00');
  });

  test('invalid day_of_week is rejected', async () => {
    authAs('st-seller-uid');
    const res = await request(app)
      .put(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token')
      .send({ timings: [{ day_of_week: 9, open_time: '09:00', close_time: '21:00', is_closed: false }] });
    expect(res.status).toBe(400);
  });

  test('other seller gets 404 on foreign shop timings', async () => {
    authAs('st-seller2-uid');
    const res = await request(app)
      .get(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(404);
  });

  test('customer cannot read timings (seller/admin only)', async () => {
    const customer = await createTestUser({ firebase_uid: 'st-cust-uid', role: 'customer', name: 'ST Cust' });
    authAs('st-cust-uid');
    const res = await request(app)
      .get(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(403);
  });

  test('admin can read timings', async () => {
    authAs('st-admin-uid');
    const res = await request(app)
      .get(`/api/v1/shops/${shop.id}/timings`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get(`/api/v1/shops/${shop.id}/timings`);
    expect(res.status).toBe(401);
  });
});
