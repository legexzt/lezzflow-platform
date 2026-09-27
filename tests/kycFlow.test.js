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
} = require('./helpers/testDb');

describe('KYC Approve/Reject Flow & Partner Delivery Execution', () => {
  let adminUser, partnerUser, sellerUser, customerUser, shop, order, deliveryRequest;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({
      firebase_uid: 'admin-kyc-uid',
      role: 'admin',
      name: 'System Admin',
    });

    partnerUser = await createTestUser({
      firebase_uid: 'partner-kyc-uid',
      role: 'partner',
      name: 'Driver Dave',
      phone: '9876543210',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'seller-kyc-uid',
      role: 'seller',
      name: 'Shopkeeper Sam',
    });

    customerUser = await createTestUser({
      firebase_uid: 'customer-kyc-uid',
      role: 'customer',
      name: 'Customer Clara',
    });

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'Sam Store' });
    order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      fulfillment: 'delivery',
      status: 'packed',
    });
    deliveryRequest = await createTestDeliveryRequest({ order_id: order.id, status: 'requested' });
  });

  describe('Partner KYC Submission & Access Gate', () => {
    it('should submit partner KYC documents with pending status', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/kyc')
        .set('Authorization', 'Bearer partner-token')
        .send({
          aadhaar_url: 'https://cdn.example.com/aadhaar.pdf',
          pan_url: 'https://cdn.example.com/pan.pdf',
          license_url: 'https://cdn.example.com/license.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.partner_id).toBe(partnerUser.id);
      expect(res.body.aadhaar_url).toBe('https://cdn.example.com/aadhaar.pdf');
    });

    it('should forbid delivery request access for partner with unapproved KYC', async () => {
      // Unapproved (pending)
      await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('KYC verification must be approved');
    });
  });

  describe('Admin KYC Review (Pending list, Approve, Reject)', () => {
    it('should allow admin to list pending KYC requests', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/admin/kyc/pending')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].status).toBe('pending');
      expect(res.body[0].partner_name).toBe('Driver Dave');
    });

    it('should reject non-admin users from accessing pending KYC', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/admin/kyc/pending')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(403);
    });

    it('should allow admin to approve a pending KYC', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/approve`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.kyc.status).toBe('approved');
    });

    it('should allow admin to reject a KYC', async () => {
      const kyc = await createTestKyc({ partner_id: partnerUser.id, status: 'pending' });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: adminUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/admin/kyc/${kyc.id}/reject`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.kyc.status).toBe('rejected');
    });
  });

  describe('Approved Partner Workflow & Status Transitions', () => {
    beforeEach(async () => {
      // Mark partner as approved
      await createTestKyc({ partner_id: partnerUser.id, status: 'approved' });
    });

    it('should allow approved partner to list delivery requests', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(r => r.id === deliveryRequest.id)).toBe(true);
    });

    it('should allow partner to accept a requested delivery and transition through to delivered', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      // 1. Accept request (requested -> accepted)
      const acceptRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryRequest.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'accepted' });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.status).toBe('accepted');
      expect(acceptRes.body.partner_id).toBe(partnerUser.id);

      // 2. Pick order (accepted -> picked)
      const pickRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryRequest.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'picked' });

      expect(pickRes.status).toBe(200);
      expect(pickRes.body.status).toBe('picked');

      // 3. Deliver order (picked -> delivered)
      const deliverRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryRequest.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered' });

      expect(deliverRes.status).toBe(200);
      expect(deliverRes.body.status).toBe('delivered');
    });

    it('should reject invalid partner status skip (requested -> delivered) with 400', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch(`/api/delivery/requests/${deliveryRequest.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid delivery status transition from 'requested' to 'delivered'");
    });
  });
});
