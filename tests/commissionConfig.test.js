/**
 * ITEM 3 — Commission config endpoints.
 *
 * GET /api/v1/config            (public; safe keys only -> { commission_bps })
 * PATCH /api/v1/admin/config    (admin-only; { commission_bps: int 0..10000 })
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { setupTestDb, createTestUser, query } = require('./helpers/testDb');

describe('Commission Config Endpoints', () => {
  let adminUser, sellerUser;

  const mockAuth = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid }),
    });

  const mockOpsViewer = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid, ops_viewer: true }),
    });

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({
      firebase_uid: 'commission-admin-uid',
      role: 'admin',
      name: 'Commission Admin',
      phone: '5550001111',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'commission-seller-uid',
      role: 'seller',
      name: 'Commission Seller',
      phone: '5550002222',
    });
  });

  describe('GET /api/v1/config', () => {
    it('is public: returns 200 with seeded { commission_bps: 0 } and no token', async () => {
      const res = await request(app).get('/api/v1/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ commission_bps: 0 });
    });

    it('also serves /api/config (non-versioned mount)', async () => {
      const res = await request(app).get('/api/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ commission_bps: 0 });
    });

    it('exposes no other keys', async () => {
      await query(
        "INSERT INTO app_config (key, value) VALUES ('some_secret_key', 'nope') ON CONFLICT (key) DO NOTHING"
      );

      const res = await request(app).get('/api/v1/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ commission_bps: 0 });
      expect(res.body.some_secret_key).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/admin/config', () => {
    it('401 without a token', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/config')
        .send({ commission_bps: 100 });

      expect(res.status).toBe(401);
    });

    it('403 for a non-admin (seller) role', async () => {
      mockAuth(sellerUser.firebase_uid);

      const res = await request(app)
        .patch('/api/v1/admin/config')
        .set('Authorization', 'Bearer <redacted>')
        .send({ commission_bps: 100 });

      expect(res.status).toBe(403);
    });

    it('403 for an ops-viewer token (read-only)', async () => {
      mockOpsViewer(adminUser.firebase_uid);

      const res = await request(app)
        .patch('/api/v1/admin/config')
        .set('Authorization', 'Bearer <redacted>')
        .send({ commission_bps: 100 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('ops viewer role is read-only');
    });

    it.each([
      ['negative', -1],
      ['non-integer', 2.5],
      ['over 10000', 10001],
      ['string', 'abc'],
      ['missing', undefined],
    ])('400 for %s commission_bps (%s)', async (_label, value) => {
      mockAuth(adminUser.firebase_uid);

      const res = await request(app)
        .patch('/api/v1/admin/config')
        .set('Authorization', 'Bearer <redacted>')
        .send(value === undefined ? {} : { commission_bps: value });

      expect(res.status).toBe(400);
    });

    it('200 for a valid value; persists and is reflected by GET', async () => {
      mockAuth(adminUser.firebase_uid);

      const patchRes = await request(app)
        .patch('/api/v1/admin/config')
        .set('Authorization', 'Bearer <redacted>')
        .send({ commission_bps: 150 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toEqual({ commission_bps: 150 });

      const dbRes = await query(
        "SELECT value FROM app_config WHERE key = 'commission_bps'"
      );
      expect(dbRes.rows[0].value).toBe('150');

      const getRes = await request(app).get('/api/v1/config');
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual({ commission_bps: 150 });
    });

    it('accepts boundary values 0 and 10000', async () => {
      mockAuth(adminUser.firebase_uid);

      for (const v of [0, 10000]) {
        const res = await request(app)
          .patch('/api/v1/admin/config')
          .set('Authorization', 'Bearer <redacted>')
          .send({ commission_bps: v });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ commission_bps: v });
      }
    });
  });
});
