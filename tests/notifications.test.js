process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { setupTestDb, createTestUser } = require('./helpers/testDb');

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

const bearer = { Authorization: 'Bearer <redacted>' };

describe('Notification Panel (notifications)', () => {
  let adminUser, customerA, customerB;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
    adminUser = await createTestUser({ firebase_uid: 'notif-admin-uid', role: 'admin', name: 'Notif Admin' });
    customerA = await createTestUser({ firebase_uid: 'notif-a-uid', role: 'customer', name: 'Customer A' });
    customerB = await createTestUser({ firebase_uid: 'notif-b-uid', role: 'customer', name: 'Customer B' });
  });

  async function adminCreate(payload) {
    authAs(adminUser.firebase_uid);
    return request(app).post('/api/v1/admin/notifications').set(bearer).send(payload);
  }

  describe('Admin creation', () => {
    it('creates a broadcast notification (201)', async () => {
      const res = await adminCreate({ title: 'New Sarkari Yojana!', body: 'PM MUDRA details inside', type: 'scheme_offer' });
      expect(res.status).toBe(201);
      expect(res.body.user_id).toBeNull();
      expect(res.body.is_read).toBe(false);
    });

    it('creates a user-targeted notification (201)', async () => {
      const res = await adminCreate({ user_id: customerA.id, title: 'Order update', type: 'order_update' });
      expect(res.status).toBe(201);
      expect(Number(res.body.user_id)).toBe(customerA.id);
    });

    it('rejects missing title (400) and bad type (400)', async () => {
      expect((await adminCreate({ type: 'promo' })).status).toBe(400);
      expect((await adminCreate({ title: 'x', type: 'bogus' })).status).toBe(400);
    });

    it('rejects non-admin (403) and unauthenticated (401)', async () => {
      authAs(customerA.firebase_uid);
      const forbidden = await request(app)
        .post('/api/v1/admin/notifications')
        .set(bearer)
        .send({ title: 'nope' });
      expect(forbidden.status).toBe(403);

      jest.restoreAllMocks();
      const unauth = await request(app)
        .post('/api/v1/admin/notifications')
        .send({ title: 'nope' });
      expect(unauth.status).toBe(401);
    });
  });

  describe('Customer panel (auth)', () => {
    let broadcastId, targetedAId;

    beforeEach(async () => {
      const b = await adminCreate({ title: 'Broadcast', type: 'system' });
      broadcastId = b.body.id;
      const t = await adminCreate({ user_id: customerA.id, title: 'For A only', type: 'promo' });
      targetedAId = t.body.id;
      jest.restoreAllMocks();
    });

    it('requires auth (401 without token)', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('customer A sees broadcast + own; customer B sees broadcast only', async () => {
      authAs(customerA.firebase_uid);
      const aRes = await request(app).get('/api/v1/notifications').set(bearer);
      expect(aRes.status).toBe(200);
      const aIds = aRes.body.data.map((n) => n.id);
      expect(aIds).toContain(broadcastId);
      expect(aIds).toContain(targetedAId);

      jest.restoreAllMocks();
      authAs(customerB.firebase_uid);
      const bRes = await request(app).get('/api/v1/notifications').set(bearer);
      expect(bRes.status).toBe(200);
      const bIds = bRes.body.data.map((n) => n.id);
      expect(bIds).toContain(broadcastId);
      expect(bIds).not.toContain(targetedAId);
    });

    it('marks own/broadcast as read; cannot touch another user\'s (403/404)', async () => {
      authAs(customerA.firebase_uid);
      const ok = await request(app).patch(`/api/v1/notifications/${targetedAId}/read`).set(bearer);
      expect(ok.status).toBe(200);
      expect(ok.body.is_read).toBe(true);

      const missing = await request(app)
        .patch('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')
        .set(bearer);
      expect(missing.status).toBe(404);

      jest.restoreAllMocks();
      authAs(customerB.firebase_uid);
      const forbidden = await request(app).patch(`/api/v1/notifications/${targetedAId}/read`).set(bearer);
      expect(forbidden.status).toBe(403);
    });

    it('broadcast read by A stays unread for B (per-user read state)', async () => {
      authAs(customerA.firebase_uid);
      const mark = await request(app).patch(`/api/v1/notifications/${broadcastId}/read`).set(bearer);
      expect(mark.status).toBe(200);
      expect(mark.body.is_read).toBe(true);

      jest.restoreAllMocks();
      authAs(customerB.firebase_uid);
      const bList = await request(app).get('/api/v1/notifications').set(bearer);
      const bBroadcast = bList.body.data.find((n) => n.id === broadcastId);
      expect(bBroadcast.is_read).toBe(false);

      // and the shared row itself was never flipped
      const { query: q } = require('../db');
      const row = await q('SELECT is_read FROM notifications WHERE id = $1', [broadcastId]);
      expect(row.rows[0].is_read).toBe(false);
    });

    it('read-all marks everything visible as read', async () => {
      authAs(customerB.firebase_uid);
      const res = await request(app).post('/api/v1/notifications/read-all').set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1); // only the broadcast is visible to B

      const list = await request(app).get('/api/v1/notifications').set(bearer);
      expect(list.body.data.every((n) => n.is_read)).toBe(true);
    });

    it('supports pagination', async () => {
      authAs(customerA.firebase_uid);
      const res = await request(app).get('/api/v1/notifications').query({ page: 1, limit: 1 }).set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(2);

      const bad = await request(app).get('/api/v1/notifications').query({ page: 0 }).set(bearer);
      expect(bad.status).toBe(400);
    });
  });
});
