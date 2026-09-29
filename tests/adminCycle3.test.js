/**
 * Admin cycle-3 backend tests:
 *  - broadcast 2/week guardrail
 *  - notification analytics
 *  - shop health aggregation (real data only)
 *  - AI ops telemetry (real call logs only)
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { logAiCall } = require('../services/aiCallLog');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestOrder,
  createTestProduct,
} = require('./helpers/testDb');

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

const bearer = { Authorization: 'Bearer <redacted>' };

describe('Admin cycle-3 ops endpoints', () => {
  let adminUser;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
    adminUser = await createTestUser({ firebase_uid: 'ops-admin-uid', role: 'admin', name: 'Ops Admin' });
    authAs(adminUser.firebase_uid);
  });

  async function createNotification(payload) {
    return request(app).post('/api/v1/admin/notifications').set(bearer).send(payload);
  }

  describe('Broadcast 2/week guardrail', () => {
    test('count starts at 0/2', async () => {
      const res = await request(app).get('/api/v1/admin/notifications/broadcast-count').set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.used).toBe(0);
      expect(res.body.limit).toBe(2);
      expect(res.body.remaining).toBe(2);
    });

    test('third broadcast in a week is rejected with 429', async () => {
      expect((await createNotification({ title: 'One', type: 'system' })).status).toBe(201);
      expect((await createNotification({ title: 'Two', type: 'promo' })).status).toBe(201);
      const third = await createNotification({ title: 'Three', type: 'system' });
      expect(third.status).toBe(429);
      expect(third.body.code).toBe('BROADCAST_LIMIT');

      const count = await request(app).get('/api/v1/admin/notifications/broadcast-count').set(bearer);
      expect(count.body.used).toBe(2);
      expect(count.body.remaining).toBe(0);
    });

    test('targeted (single-user) messages do not count toward the limit', async () => {
      const customer = await createTestUser({ firebase_uid: 'ops-cust', role: 'customer' });
      expect((await createNotification({ title: 'A', type: 'system' })).status).toBe(201);
      expect((await createNotification({ title: 'B', type: 'system' })).status).toBe(201);
      // Targeted still allowed after 2 broadcasts
      const targeted = await createNotification({ title: 'Hi', type: 'order_update', user_id: customer.id });
      expect(targeted.status).toBe(201);

      const count = await request(app).get('/api/v1/admin/notifications/broadcast-count').set(bearer);
      expect(count.body.used).toBe(2);
    });
  });

  describe('Notification analytics', () => {
    test('returns items and per-type read-rate summary', async () => {
      await createNotification({ title: 'Yojana news', type: 'scheme_offer' });
      await createNotification({ title: 'Sale', type: 'promo' });

      const res = await request(app).get('/api/v1/admin/notifications/analytics').set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(2);
      const types = res.body.summary.map((s) => s.type).sort();
      expect(types).toEqual(['promo', 'scheme_offer']);
      for (const s of res.body.summary) {
        expect(s.sent).toBe(1);
        expect(s.read).toBe(0);
        expect(s.read_rate).toBe(0);
      }
    });
  });

  describe('Shop health', () => {
    test('dormant shops sort first; economics come from real orders', async () => {
      const seller = await createTestUser({ firebase_uid: 'health-seller', role: 'seller' });
      const dormantShop = await createTestShop({ seller_id: seller.id, name: 'Sleepy Store', address: 'MG Road' });
      const activeShop = await createTestShop({ seller_id: seller.id, name: 'Busy Bazaar', address: 'MG Road' });
      const product = await createTestProduct({ shop_id: activeShop.id, name: 'Rice', price: 100 });
      await createTestOrder({
        customer_id: adminUser.id,
        shop_id: activeShop.id,
        items: [{ product_id: product.id, quantity: 2, price: 100 }],
        total: 200,
        status: 'delivered',
      });

      const res = await request(app).get('/api/v1/admin/shop-health').set(bearer);
      expect(res.status).toBe(200);
      const shops = res.body.shops;
      expect(shops.length).toBe(2);
      // Dormant first
      expect(shops[0].id).toBe(dormantShop.id);
      expect(shops[0].health).toBe('dormant');
      expect(shops[1].id).toBe(activeShop.id);
      expect(shops[1].health).toBe('active');
      expect(shops[1].orders_7d).toBe(1);
      expect(shops[1].gmv_7d).toBe(200);

      const mg = res.body.locality.find((l) => l.locality.includes('MG Road'));
      expect(mg.shops).toBe(2);
      expect(mg.orders_7d).toBe(1);
      expect(mg.gmv_7d).toBe(200);
    });
  });

  describe('AI ops', () => {
    test('reflects real logged calls, never invented numbers', async () => {
      await logAiCall({ kind: 'ai_scan', status: 'ok', latencyMs: 1200 });
      await logAiCall({ kind: 'ai_scan', status: 'timeout', latencyMs: 25000 });
      await logAiCall({ kind: 'barcode', status: 'ok', latencyMs: 300 });

      const res = await request(app).get('/api/v1/admin/ai-ops').set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.last_7d.total_calls).toBe(3);
      expect(res.body.last_7d.timeouts).toBe(1);
      expect(res.body.last_7d.errors).toBe(0);
      expect(res.body.last_7d.timeout_rate_pct).toBeCloseTo(33.3, 0);
      expect(res.body.last_7d.cost_band).toContain('2 AI scans');
    });

    test('empty state when nothing logged', async () => {
      const res = await request(app).get('/api/v1/admin/ai-ops').set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.last_7d.total_calls).toBe(0);
      expect(res.body.last_7d.cost_band).toContain('no AI scans');
    });
  });
});
