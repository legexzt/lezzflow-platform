/**
 * Admin Cycle-2 endpoints.
 *
 * - PATCH /api/v1/admin/sos-alerts/:id (acknowledge / resolve)
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  query,
} = require('./helpers/testDb');

describe('Admin Cycle-2 endpoints', () => {
  let adminUser, opsViewerUser, partnerUser, customerUser, sellerUser, shop, sosAlert;

  const mockAuth = (uid, extraClaims = {}) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid, ...extraClaims }),
    });

  const authHeader = { Authorization: 'Bearer <redacted>' };

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({ firebase_uid: 'ac2-admin', role: 'admin', name: 'Admin' });
    opsViewerUser = await createTestUser({ firebase_uid: 'ac2-opsviewer', role: 'admin', name: 'Ops Viewer' });
    partnerUser = await createTestUser({ firebase_uid: 'ac2-partner', role: 'partner', name: 'Partner' });
    customerUser = await createTestUser({ firebase_uid: 'ac2-cust', role: 'customer', name: 'Customer' });
    sellerUser = await createTestUser({ firebase_uid: 'ac2-seller', role: 'seller', name: 'Seller' });

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'AC2 Shop' });

    const sosRes = await query(
      `INSERT INTO sos_alerts (partner_id, note) VALUES ($1, $2) RETURNING *`,
      [partnerUser.id, 'Help!']
    );
    sosAlert = sosRes.rows[0];
  });

  describe('PATCH /api/v1/admin/sos-alerts/:id', () => {
    it('admin can acknowledge an open SOS alert', async () => {
      mockAuth('ac2-admin');
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('acknowledged');
    });

    it('admin can resolve an acknowledged SOS alert', async () => {
      mockAuth('ac2-admin');
      // First acknowledge
      await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'acknowledged' });

      // Then resolve
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'resolved' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved');
    });

    it('returns 400 for invalid status "banana"', async () => {
      mockAuth('ac2-admin');
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'banana' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/acknowledged.*resolved|resolved.*acknowledged/i);
    });

    it('returns 400 when status is missing', async () => {
      mockAuth('ac2-admin');
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({});
      expect(res.status).toBe(400);
    });

    it('ops-viewer (ops_viewer: true claim) gets 403 from requireAdminWrite', async () => {
      mockAuth('ac2-opsviewer', { ops_viewer: true });
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(403);
    });

    it('customer role gets 403', async () => {
      mockAuth('ac2-cust');
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .set(authHeader)
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(403);
    });

    it('unauthenticated request (no auth header) gets 401', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/sos-alerts/${sosAlert.id}`)
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for a non-existent alert id', async () => {
      mockAuth('ac2-admin');
      const res = await request(app)
        .patch('/api/v1/admin/sos-alerts/999999')
        .set(authHeader)
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(404);
    });
  });
});
