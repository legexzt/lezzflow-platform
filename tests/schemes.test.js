process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { query } = require('../db');
const { setupTestDb, createTestUser } = require('./helpers/testDb');

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

describe('Sarkari Yojanaen (government_schemes)', () => {
  let adminUser, customerUser;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
    adminUser = await createTestUser({ firebase_uid: 'scheme-admin-uid', role: 'admin', name: 'Scheme Admin' });
    customerUser = await createTestUser({ firebase_uid: 'scheme-customer-uid', role: 'customer', name: 'Scheme Customer' });
  });

  describe('GET /api/v1/schemes (public)', () => {
    it('returns the 8 active seeded schemes (no auth needed)', async () => {
      const res = await request(app).get('/api/v1/schemes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(8);
      for (const s of res.body) {
        expect(s.status).toBe('active');
        expect(s.is_active).toBe(true);
      }
      const titles = res.body.map((s) => s.title);
      expect(titles).toContain('PM MUDRA Yojana');
    });

    it('filters by ?category=', async () => {
      const all = await request(app).get('/api/v1/schemes');
      const category = all.body[0].category;
      const res = await request(app).get('/api/v1/schemes').query({ category });
      expect(res.status).toBe(200);
      for (const s of res.body) {
        expect(s.category).toBe(category);
      }
    });
  });

  describe('GET /api/v1/schemes/:id (public)', () => {
    it('returns 200 for an active scheme', async () => {
      const all = await request(app).get('/api/v1/schemes');
      const res = await request(app).get(`/api/v1/schemes/${all.body[0].id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(all.body[0].id);
    });

    it('returns 404 for a check-status (unverified) scheme', async () => {
      const found = await query(
        "SELECT id FROM government_schemes WHERE status = 'check' LIMIT 1"
      );
      expect(found.rows.length).toBe(1);
      const res = await request(app).get(`/api/v1/schemes/${found.rows[0].id}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for a random uuid', async () => {
      const res = await request(app).get('/api/v1/schemes/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('Admin scheme curation', () => {
    const authAdmin = () => authAs(adminUser.firebase_uid);
    const adminHeader = { Authorization: 'Bearer <redacted>' };

    it('rejects unauthenticated admin access (401)', async () => {
      const res = await request(app).get('/api/v1/admin/schemes');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users (403)', async () => {
      authAs(customerUser.firebase_uid);
      const res = await request(app)
        .get('/api/v1/admin/schemes')
        .set('Authorization', 'Bearer <redacted>');
      expect(res.status).toBe(403);
    });

    it('lists all 11 schemes including check-status (admin)', async () => {
      authAdmin();
      const res = await request(app)
        .get('/api/v1/admin/schemes')
        .set(adminHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(11);
    });

    it('creates a scheme (201) and rejects missing title (400)', async () => {
      authAdmin();
      const bad = await request(app)
        .post('/api/v1/admin/schemes')
        .set(adminHeader)
        .send({ description: 'no title' });
      expect(bad.status).toBe(400);

      const good = await request(app)
        .post('/api/v1/admin/schemes')
        .set(adminHeader)
        .send({ title: 'Test State Scheme', status: 'check', category: 'Test' });
      expect(good.status).toBe(201);
      expect(good.body.title).toBe('Test State Scheme');

      // check-status => not visible publicly
      const pub = await request(app).get('/api/v1/schemes');
      expect(pub.body.map((s) => s.title)).not.toContain('Test State Scheme');
    });

    it('rejects invalid status on create (400)', async () => {
      authAdmin();
      const res = await request(app)
        .post('/api/v1/admin/schemes')
        .set(adminHeader)
        .send({ title: 'Bad Status', status: 'bogus' });
      expect(res.status).toBe(400);
    });

    it('patches a scheme and soft-deletes it (public list shrinks)', async () => {
      authAdmin();
      const created = await request(app)
        .post('/api/v1/admin/schemes')
        .set(adminHeader)
        .send({ title: 'Deletable Scheme', status: 'active' });
      const id = created.body.id;

      const patched = await request(app)
        .patch(`/api/v1/admin/schemes/${id}`)
        .set(adminHeader)
        .send({ benefits: 'Updated benefits' });
      expect(patched.status).toBe(200);
      expect(patched.body.benefits).toBe('Updated benefits');

      const del = await request(app)
        .delete(`/api/v1/admin/schemes/${id}`)
        .set(adminHeader);
      expect(del.status).toBe(200);

      const pub = await request(app).get('/api/v1/schemes');
      expect(pub.body.map((s) => s.title)).not.toContain('Deletable Scheme');

      const missing = await request(app)
        .patch('/api/v1/admin/schemes/00000000-0000-0000-0000-000000000000')
        .set(adminHeader)
        .send({ benefits: 'x' });
      expect(missing.status).toBe(404);
    });
  });
});
