process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
  query,
} = require('./helpers/testDb');

describe('Onboarding funnel + go-live gate', () => {
  let sellerUser, otherSeller, adminUser, customerUser;

  const mockAuth = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid }),
    });

  const authHeader = { Authorization: 'Bearer fake-token' };

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({ firebase_uid: 'seller-uid', role: 'seller', name: 'Seller' });
    otherSeller = await createTestUser({ firebase_uid: 'seller2-uid', role: 'seller', name: 'Seller 2' });
    adminUser = await createTestUser({ firebase_uid: 'admin-uid', role: 'admin', name: 'Admin' });
    customerUser = await createTestUser({ firebase_uid: 'customer-uid', role: 'customer', name: 'Customer' });
  });

  describe('POST /api/v1/onboarding/funnel-event', () => {
    it('records a funnel event with 201', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .set(authHeader)
        .send({ step: 'profile' });

      expect(res.status).toBe(201);
      expect(res.body.step).toBe('profile');
      expect(res.body.user_id).toBe(sellerUser.id);

      const db = await query('SELECT * FROM onboarding_funnel_events WHERE user_id = $1', [sellerUser.id]);
      expect(db.rows).toHaveLength(1);
    });

    it('rejects an invalid step with 400', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .set(authHeader)
        .send({ step: 'not_a_step' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid step/);
    });

    it('rejects missing step with 400', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .send({ step: 'profile' });

      expect(res.status).toBe(401);
    });

    it('ignores duplicate step per user per day (spam guard)', async () => {
      mockAuth('seller-uid');
      const first = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .set(authHeader)
        .send({ step: 'products' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/onboarding/funnel-event')
        .set(authHeader)
        .send({ step: 'products' });
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);

      const db = await query(
        'SELECT * FROM onboarding_funnel_events WHERE user_id = $1 AND step = $2',
        [sellerUser.id, 'products']
      );
      expect(db.rows).toHaveLength(1);
    });
  });

  describe('POST /api/v1/shops/:id/go-live', () => {
    it('goes live when profile is complete and at least 1 product exists', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({
        seller_id: sellerUser.id,
        name: 'Ready Shop',
        address: '42 Bazaar Rd',
        is_live: false,
      });
      await createTestProduct({ shop_id: shop.id });

      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/go-live`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.is_live).toBe(true);

      const dbShop = await query('SELECT is_live FROM shops WHERE id = $1', [shop.id]);
      expect(dbShop.rows[0].is_live).toBe(true);

      const funnel = await query(
        "SELECT * FROM onboarding_funnel_events WHERE user_id = $1 AND step = 'go_live'",
        [sellerUser.id]
      );
      expect(funnel.rows).toHaveLength(1);
    });

    it('returns 422 with reasons when address is missing', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({
        seller_id: sellerUser.id,
        name: 'No Address Shop',
        address: null,
        is_live: false,
      });
      await createTestProduct({ shop_id: shop.id });

      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/go-live`)
        .set(authHeader);

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/not ready/i);
      expect(JSON.stringify(res.body.reasons)).toMatch(/address/i);

      const dbShop = await query('SELECT is_live FROM shops WHERE id = $1', [shop.id]);
      expect(dbShop.rows[0].is_live).toBe(false);
    });

    it('returns 422 with reasons when zero products exist', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({
        seller_id: sellerUser.id,
        name: 'Empty Shop',
        address: '1 Main St',
        is_live: false,
      });

      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/go-live`)
        .set(authHeader);

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body.reasons)).toMatch(/product/i);
    });

    it('returns 403 for a non-owner', async () => {
      mockAuth('seller2-uid');
      const shop = await createTestShop({ seller_id: sellerUser.id, is_live: false });

      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/go-live`)
        .set(authHeader);

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown shop', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/shops/999999/go-live')
        .set(authHeader);

      expect(res.status).toBe(404);
    });

    it('is idempotent for an already-live shop', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({ seller_id: sellerUser.id, is_live: true });

      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/go-live`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.already_live).toBe(true);
    });
  });

  describe('shop profile fields (wizard saveShopProfile)', () => {
    it('persists open_time, close_time, category on create', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/shops')
        .set(authHeader)
        .send({
          name: 'Timed Shop',
          address: '7 Clock Rd',
          lat: 12.9716,
          lng: 77.5946,
          open_time: '09:00',
          close_time: '21:30',
          category: 'Grocery',
        });

      expect(res.status).toBe(201);
      expect(res.body.open_time).toBe('09:00:00');
      expect(res.body.close_time).toBe('21:30:00');
      expect(res.body.category).toBe('Grocery');
    });

    it('persists open_time, close_time, category on update', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({ seller_id: sellerUser.id });

      const res = await request(app)
        .put(`/api/v1/shops/${shop.id}`)
        .set(authHeader)
        .send({ open_time: '08:00', close_time: '22:00', category: 'Kirana' });

      expect(res.status).toBe(200);
      expect(res.body.open_time).toBe('08:00:00');
      expect(res.body.close_time).toBe('22:00:00');
      expect(res.body.category).toBe('Kirana');
    });

    it('rejects invalid time format with 400', async () => {
      mockAuth('seller-uid');
      const res = await request(app)
        .post('/api/v1/shops')
        .set(authHeader)
        .send({ name: 'Bad Time Shop', lat: 12.9716, lng: 77.5946, open_time: '25:99' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/open_time/);
    });

    it('rejects legacy PUT { isLive: true } with 400', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({ seller_id: sellerUser.id, is_live: false });

      const res = await request(app)
        .put(`/api/v1/shops/${shop.id}`)
        .set(authHeader)
        .send({ isLive: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/go-live/);

      const dbShop = await query('SELECT is_live FROM shops WHERE id = $1', [shop.id]);
      expect(dbShop.rows[0].is_live).toBe(false);
    });

    it('rejects PUT { is_live: true } with 400', async () => {
      mockAuth('seller-uid');
      const shop = await createTestShop({ seller_id: sellerUser.id, is_live: false });

      const res = await request(app)
        .put(`/api/v1/shops/${shop.id}`)
        .set(authHeader)
        .send({ is_live: true });

      expect(res.status).toBe(400);
    });
  });

  describe('discovery go-live gate', () => {
    it('excludes non-live shops from discovery', async () => {
      const liveShop = await createTestShop({
        seller_id: sellerUser.id,
        name: 'Live Mart Shop',
        lat: 12.9716,
        lng: 77.5946,
        is_open: true,
        is_live: true,
      });
      const hiddenShop = await createTestShop({
        seller_id: sellerUser.id,
        name: 'Hidden Draft Shop',
        lat: 12.972,
        lng: 77.595,
        is_open: true,
        is_live: false,
      });

      const res = await request(app).get('/api/v1/discover?lat=12.9716&lng=77.5946');

      expect(res.status).toBe(200);
      const names = [
        ...res.body.within5km,
        ...res.body.within10km,
        ...res.body.within20km,
      ].map((s) => s.name);

      expect(names).toContain(liveShop.name);
      expect(names).not.toContain(hiddenShop.name);
    });
  });

  describe('GET /api/v1/admin/onboarding/funnel-dropoff', () => {
    it('counts users stuck at their furthest step', async () => {
      await query(
        `INSERT INTO onboarding_funnel_events (user_id, step) VALUES
         ($1, 'profile'), ($1, 'products'),
         ($2, 'profile')`,
        [sellerUser.id, otherSeller.id]
      );

      mockAuth('admin-uid');
      const res = await request(app)
        .get('/api/v1/admin/onboarding/funnel-dropoff')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total_users_in_funnel).toBe(2);

      const byStep = {};
      for (const d of res.body.dropoff) byStep[d.step] = d.users_stuck;
      expect(byStep.profile).toBe(1); // otherSeller stuck at profile
      expect(byStep.products).toBe(1); // sellerUser stuck at products
      expect(byStep.test_order).toBe(0);
      expect(byStep.go_live).toBe(0);
    });

    it('rejects non-admin with 403', async () => {
      mockAuth('customer-uid');
      const res = await request(app)
        .get('/api/v1/admin/onboarding/funnel-dropoff')
        .set(authHeader);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated with 401', async () => {
      const res = await request(app).get('/api/v1/admin/onboarding/funnel-dropoff');
      expect(res.status).toBe(401);
    });
  });
});
