process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { query } = require('../db');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestOrder,
  createTestKyc,
  createTestDeliveryRequest,
} = require('./helpers/testDb');

describe('Task 2: Partner Upgrades (Duty, OTP, Profile, Fees)', () => {
  let partnerUser, partnerUser2, adminUser, sellerUser, customerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    partnerUser = await createTestUser({
      firebase_uid: 'partner-test-uid-1',
      role: 'partner',
      name: 'Rider Raj',
      phone: '9876500001',
    });

    partnerUser2 = await createTestUser({
      firebase_uid: 'partner-test-uid-2',
      role: 'partner',
      name: 'Rider Simran',
      phone: '9876500002',
    });

    adminUser = await createTestUser({
      firebase_uid: 'admin-test-uid',
      role: 'admin',
      name: 'Admin Boss',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'seller-test-uid',
      role: 'seller',
      name: 'Seller Suresh',
    });

    customerUser = await createTestUser({
      firebase_uid: 'customer-test-uid',
      role: 'customer',
      name: 'Customer Anita',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Suresh Kirana',
    });

    // Approve KYC for partner 1 and partner 2
    await createTestKyc({ partner_id: partnerUser.id, status: 'approved' });
    await createTestKyc({ partner_id: partnerUser2.id, status: 'approved' });
  });

  describe('Partner Profile: GET & PATCH /api/partner/me', () => {
    it('should return initial profile with is_online=false and training_completed=false', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/partner/me')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: partnerUser.id,
        name: 'Rider Raj',
        phone: '9876500001',
        is_online: false,
        training_completed: false,
      });
    });

    it('should update is_online and training_completed via PATCH', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      // Update is_online to true
      const res1 = await request(app)
        .patch('/api/partner/me')
        .set('Authorization', 'Bearer partner-token')
        .send({ is_online: true });

      expect(res1.status).toBe(200);
      expect(res1.body.is_online).toBe(true);
      expect(res1.body.training_completed).toBe(false);

      // Update training_completed to true
      const res2 = await request(app)
        .patch('/api/partner/me')
        .set('Authorization', 'Bearer partner-token')
        .send({ training_completed: true });

      expect(res2.status).toBe(200);
      expect(res2.body.is_online).toBe(true);
      expect(res2.body.training_completed).toBe(true);

      // Verify persistence via GET
      const resGet = await request(app)
        .get('/api/partner/me')
        .set('Authorization', 'Bearer partner-token');

      expect(resGet.status).toBe(200);
      expect(resGet.body.is_online).toBe(true);
      expect(resGet.body.training_completed).toBe(true);
    });

    it('should reject PATCH /api/partner/me if no valid fields provided', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch('/api/partner/me')
        .set('Authorization', 'Bearer partner-token')
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No valid fields');
    });

    it('should reject non-partner non-admin users with 403', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/partner/me')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
    });
  });

  describe('Duty Filtering in GET /api/delivery/requests', () => {
    it('should show only assigned requests to an off-duty partner; show open requests once online', async () => {
      // Create order 1 (open requested)
      const order1 = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'packed',
      });
      const openReq = await createTestDeliveryRequest({ order_id: order1.id, status: 'requested' });

      // Create order 2 (assigned to partnerUser)
      const order2 = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'assigned',
      });
      const assignedReq = await createTestDeliveryRequest({
        order_id: order2.id,
        partner_id: partnerUser.id,
        status: 'accepted',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      // 1. Off-duty check: partnerUser is offline by default
      const offDutyRes = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');

      expect(offDutyRes.status).toBe(200);
      expect(Array.isArray(offDutyRes.body)).toBe(true);
      expect(offDutyRes.body.some(r => r.id === assignedReq.id)).toBe(true);
      expect(offDutyRes.body.some(r => r.id === openReq.id)).toBe(false);

      // 2. Off-duty partner cannot accept new requests -> 403
      const acceptOffDutyRes = await request(app)
        .patch(`/api/delivery/requests/${openReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'accepted' });

      expect(acceptOffDutyRes.status).toBe(403);
      expect(acceptOffDutyRes.body.error).toBe('You are offline. Go online to accept deliveries.');

      // 3. Go online
      await request(app)
        .patch('/api/partner/me')
        .set('Authorization', 'Bearer partner-token')
        .send({ is_online: true });

      // 4. On-duty check: now sees open requested deliveries
      const onDutyRes = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');

      expect(onDutyRes.status).toBe(200);
      expect(onDutyRes.body.some(r => r.id === assignedReq.id)).toBe(true);
      expect(onDutyRes.body.some(r => r.id === openReq.id)).toBe(true);
    });
  });

  describe('OTP-based handoff & Status transitions', () => {
    it('accept generates pickup_otp, requires otp for picked, generates delivery_otp, requires otp for delivered', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'packed',
      });
      const deliveryReq = await createTestDeliveryRequest({ order_id: order.id, status: 'requested' });

      // Put partner online
      await query('UPDATE users SET is_online = true WHERE id = $1', [partnerUser.id]);

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockImplementation(async (token) => {
          if (token === 'admin-token') return { uid: adminUser.firebase_uid };
          if (token === 'partner2-token') return { uid: partnerUser2.firebase_uid };
          return { uid: partnerUser.firebase_uid };
        }),
      });

      // 1. Partner accepts -> pickup_otp generated
      const acceptRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'accepted' });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.status).toBe('accepted');
      expect(acceptRes.body.partner_id).toBe(partnerUser.id);
      // Partner response must NOT expose pickup_otp or delivery_otp
      expect(acceptRes.body.pickup_otp).toBeUndefined();
      expect(acceptRes.body.delivery_otp).toBeUndefined();

      // Partner GET /api/delivery/requests also masks OTPs
      const partnerList = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');
      const partnerDeliveryItem = partnerList.body.find(r => r.id === deliveryReq.id);
      expect(partnerDeliveryItem.pickup_otp).toBeUndefined();
      expect(partnerDeliveryItem.delivery_otp).toBeUndefined();

      // Admin GET /api/delivery/requests retains raw pickup_otp
      const adminList = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer admin-token');
      const adminDeliveryItem = adminList.body.find(r => r.id === deliveryReq.id);
      expect(adminDeliveryItem.pickup_otp).toBeDefined();
      expect(typeof adminDeliveryItem.pickup_otp).toBe('string');
      expect(adminDeliveryItem.pickup_otp.length).toBe(4);
      const correctPickupOtp = adminDeliveryItem.pickup_otp;

      // 2. 409 Race: Partner 2 attempts to accept already accepted delivery
      const raceRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner2-token')
        .send({ status: 'accepted' });

      expect(raceRes.status).toBe(409);
      expect(raceRes.body.error).toBe('Delivery request has already been accepted by another partner.');

      // 3. Legal transitions: cannot jump accepted -> delivered directly
      const skipRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered', otp: '1234' });

      expect(skipRes.status).toBe(400);
      expect(skipRes.body.error).toContain("Invalid delivery status transition from 'accepted' to 'delivered'");

      // 4. Mark picked with missing or wrong OTP -> 400
      const missingPickOtpRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'picked' });

      expect(missingPickOtpRes.status).toBe(400);
      expect(missingPickOtpRes.body.error).toBe(
        'Incorrect pickup code. Ask the shop staff for the 4-digit code.'
      );

      const wrongPickOtpRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'picked', otp: '0000' });

      expect(wrongPickOtpRes.status).toBe(400);
      expect(wrongPickOtpRes.body.error).toBe(
        'Incorrect pickup code. Ask the shop staff for the 4-digit code.'
      );

      // 5. Mark picked with correct OTP -> 200 and generates delivery_otp
      const correctPickRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'picked', otp: correctPickupOtp });

      expect(correctPickRes.status).toBe(200);
      expect(correctPickRes.body.status).toBe('picked');
      // Partner does not see delivery_otp
      expect(correctPickRes.body.delivery_otp).toBeUndefined();

      // Admin inspects delivery_otp
      const adminListAfterPick = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer admin-token');
      const adminPickedItem = adminListAfterPick.body.find(r => r.id === deliveryReq.id);
      expect(adminPickedItem.delivery_otp).toBeDefined();
      expect(typeof adminPickedItem.delivery_otp).toBe('string');
      expect(adminPickedItem.delivery_otp.length).toBe(4);
      const correctDeliveryOtp = adminPickedItem.delivery_otp;

      // 6. Mark delivered with missing/wrong OTP -> 400
      const wrongDeliverOtpRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered', otp: '9999' });

      expect(wrongDeliverOtpRes.status).toBe(400);
      expect(wrongDeliverOtpRes.body.error).toBe(
        'Incorrect delivery code. Ask the customer for the 4-digit code.'
      );

      // 7. Mark delivered with correct OTP -> 200
      const correctDeliverRes = await request(app)
        .patch(`/api/delivery/requests/${deliveryReq.id}`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered', otp: correctDeliveryOtp });

      expect(correctDeliverRes.status).toBe(200);
      expect(correctDeliverRes.body.status).toBe('delivered');
    });
  });

  describe('Fee Honesty & Absence of Fabricated Values', () => {
    it('should have NULL delivery_fee by default and no bonus/incentive fields', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'placed',
      });
      const dr = await createTestDeliveryRequest({ order_id: order.id, status: 'requested' });

      await query('UPDATE users SET is_online = true WHERE id = $1', [partnerUser.id]);

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: partnerUser.firebase_uid }),
      });

      const res = await request(app)
        .get('/api/delivery/requests')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(200);
      const item = res.body.find(r => r.id === dr.id);
      expect(item).toBeDefined();
      expect(item.delivery_fee).toBeNull();
      expect(item.distance_km).toBeNull();
      expect(item.bonus).toBeUndefined();
      expect(item.incentive).toBeUndefined();
      expect(item.projected_earnings).toBeUndefined();
      expect(item.estimated_fee).toBeUndefined();
    });
  });
});
