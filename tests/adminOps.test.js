process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestOrder,
  createTestKyc,
  createTestDeliveryRequest,
  query,
} = require('./helpers/testDb');

describe('Admin Ops Upgrades & Audit Logging', () => {
  let adminUser, partnerUser, sellerUser, customerUser, shop, order, deliveryRequest;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({
      firebase_uid: 'admin-ops-uid',
      role: 'admin',
      name: 'Super Admin',
      phone: '1112223334',
    });

    partnerUser = await createTestUser({
      firebase_uid: 'partner-ops-uid',
      role: 'partner',
      name: 'Speedy Rider',
      phone: '9876543210',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'seller-ops-uid',
      role: 'seller',
      name: 'Kirana King',
      phone: '8887776665',
    });

    customerUser = await createTestUser({
      firebase_uid: 'customer-ops-uid',
      role: 'customer',
      name: 'Alice Shopper',
      phone: '7776665554',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'King Mart',
    });

    order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      fulfillment: 'delivery',
      status: 'placed',
    });

    deliveryRequest = await createTestDeliveryRequest({
      order_id: order.id,
      partner_id: partnerUser.id,
      status: 'requested',
    });
  });

  describe('KYC Approve & Audit', () => {
    it('approving KYC writes an admin_audit_log row with actor_firebase_uid and action kyc_approve', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/approve`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.kyc.status).toBe('approved');
      expect(res.body.kyc.reject_reason_code).toBeNull();
      expect(res.body.kyc.reupload_requested).toBe(false);

      const auditRes = await query(
        "SELECT * FROM admin_audit_log WHERE entity_type = 'kyc' AND action = 'kyc_approve'"
      );
      expect(auditRes.rows.length).toBe(1);
      const audit = auditRes.rows[0];
      expect(audit.actor_firebase_uid).toBe(adminUser.firebase_uid);
      expect(audit.actor_name).toBe(adminUser.name);
      expect(audit.entity_id).toBe(String(kyc.id));
      expect(audit.details.partner_id).toBe(partnerUser.id);
      expect(audit.details.partner_name).toBe(partnerUser.name);
    });
  });

  describe('KYC Reject & Reason Codes', () => {
    it('rejecting with an invalid reason_code returns 400; with a valid code stores reject_reason_code and writes kyc_reject audit', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      // Invalid reason code
      const badRes = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/reject`)
        .set('Authorization', 'Bearer admin-token')
        .send({ reason_code: 'fake_code', note: 'Not good' });

      expect(badRes.status).toBe(400);
      expect(badRes.body.error).toContain('Invalid reason_code');

      // Valid reason code
      const goodRes = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/reject`)
        .set('Authorization', 'Bearer admin-token')
        .send({ reason_code: 'blurry_doc', note: 'Image is unreadable' });

      expect(goodRes.status).toBe(200);
      expect(goodRes.body.kyc.status).toBe('rejected');
      expect(goodRes.body.kyc.reject_reason_code).toBe('blurry_doc');
      expect(goodRes.body.kyc.reject_note).toBe('Image is unreadable');

      const auditRes = await query(
        "SELECT * FROM admin_audit_log WHERE entity_type = 'kyc' AND action = 'kyc_reject'"
      );
      expect(auditRes.rows.length).toBe(1);
      const audit = auditRes.rows[0];
      expect(audit.actor_firebase_uid).toBe(adminUser.firebase_uid);
      expect(audit.details.reason_code).toBe('blurry_doc');
      expect(audit.details.note).toBe('Image is unreadable');
      expect(audit.details.partner_name).toBe(partnerUser.name);
    });
  });

  describe('KYC Request Re-upload', () => {
    it('request-reupload sets reupload_requested=true, removes the case from GET /admin/kyc/pending, writes audit', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/request-reupload`)
        .set('Authorization', 'Bearer admin-token')
        .send({ reason_code: 'expired', note: 'Driving license expired in 2023' });

      expect(res.status).toBe(200);
      expect(res.body.kyc.reupload_requested).toBe(true);
      expect(res.body.kyc.reject_reason_code).toBe('expired');
      expect(res.body.kyc.reject_note).toBe('Driving license expired in 2023');

      // Check it was removed from pending KYC list
      const pendingRes = await request(app)
        .get('/api/admin/kyc/pending')
        .set('Authorization', 'Bearer admin-token');

      expect(pendingRes.status).toBe(200);
      const found = pendingRes.body.find((item) => item.id === kyc.id);
      expect(found).toBeUndefined();

      // Check audit log
      const auditRes = await query(
        "SELECT * FROM admin_audit_log WHERE entity_type = 'kyc' AND action = 'kyc_reupload_requested'"
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].entity_id).toBe(String(kyc.id));
      expect(auditRes.rows[0].details.reason_code).toBe('expired');
    });
  });

  describe('Ops Viewer Write Guard', () => {
    it('ops viewer token: POST /admin/kyc/:id/approve -> 403; GET /admin/stats -> 200', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: adminUser.firebase_uid,
          ops_viewer: true,
        }),
      });

      // Write action should be forbidden
      const approveRes = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/approve`)
        .set('Authorization', 'Bearer ops-viewer-token');

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error).toContain('ops viewer role is read-only');

      // Read action should succeed
      const statsRes = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer ops-viewer-token');

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.orders).toBeDefined();
    });
  });

  describe('Order Nudge', () => {
    it('nudge: POST /admin/orders/:id/nudge { target: seller } -> 200 with contacts object and writes order_nudge audit; unknown order -> 404; bad target -> 400', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      // Bad target
      const badTargetRes = await request(app)
        .post(`/api/admin/orders/${order.id}/nudge`)
        .set('Authorization', 'Bearer admin-token')
        .send({ target: 'customer' });

      expect(badTargetRes.status).toBe(400);

      // Unknown order
      const notFoundRes = await request(app)
        .post('/api/admin/orders/99999/nudge')
        .set('Authorization', 'Bearer admin-token')
        .send({ target: 'seller' });

      expect(notFoundRes.status).toBe(404);

      // Valid nudge
      const nudgeRes = await request(app)
        .post(`/api/admin/orders/${order.id}/nudge`)
        .set('Authorization', 'Bearer admin-token')
        .send({ target: 'seller' });

      expect(nudgeRes.status).toBe(200);
      expect(nudgeRes.body.ok).toBe(true);
      expect(nudgeRes.body.contacts).toEqual({
        seller_name: sellerUser.name,
        seller_phone: sellerUser.phone,
        customer_name: customerUser.name,
        customer_phone: customerUser.phone,
        partner_name: partnerUser.name,
        partner_phone: partnerUser.phone,
      });

      // Check audit log
      const auditRes = await query(
        "SELECT * FROM admin_audit_log WHERE entity_type = 'order' AND action = 'order_nudge'"
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].details.target).toBe('seller');
      expect(auditRes.rows[0].details.shop_name).toBe(shop.name);
    });
  });

  describe('Audit Query Endpoint', () => {
    it('GET /admin/audit?entity_type=kyc returns the written rows', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      await request(app)
        .post(`/api/admin/kyc/${kyc.id}/approve`)
        .set('Authorization', 'Bearer admin-token');

      const auditRes = await request(app)
        .get('/api/admin/audit')
        .query({ entity_type: 'kyc' })
        .set('Authorization', 'Bearer admin-token');

      expect(auditRes.status).toBe(200);
      expect(Array.isArray(auditRes.body.data)).toBe(true);
      expect(auditRes.body.data.length).toBeGreaterThanOrEqual(1);
      const row = auditRes.body.data.find(
        (r) => r.entity_type === 'kyc' && r.action === 'kyc_approve'
      );
      expect(row).toBeDefined();
      expect(row.actor_firebase_uid).toBe(adminUser.firebase_uid);
    });
  });
});
