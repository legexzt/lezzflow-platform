/**
 * Partner Cycle-2 endpoints (migration 010).
 *
 * - GET /api/v1/delivery/requests now includes order_status (pack-status sync)
 * - PATCH /api/v1/admin/config accepts partner fee/referral/support keys
 * - GET /api/v1/delivery/config (partner-facing config, nulls when unset)
 * - POST /api/v1/delivery/sos + GET /api/v1/admin/sos-alerts
 * - GET /api/v1/partner/referrals + POST /api/v1/partner/referral/claim
 */
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

describe('Partner Cycle-2 endpoints', () => {
  let adminUser, partnerUser, partner2User, sellerUser, customerUser, shop, order;

  const mockAuth = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid }),
    });

  const authHeader = { Authorization: 'Bearer <redacted>' };

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({ firebase_uid: 'c2-admin', role: 'admin', name: 'Admin' });
    sellerUser = await createTestUser({ firebase_uid: 'c2-seller', role: 'seller', name: 'Seller' });
    customerUser = await createTestUser({ firebase_uid: 'c2-cust', role: 'customer', name: 'Cust' });
    partnerUser = await createTestUser({ firebase_uid: 'c2-partner', role: 'partner', name: 'Partner One' });
    partner2User = await createTestUser({ firebase_uid: 'c2-partner2', role: 'partner', name: 'Partner Two' });
    await createTestKyc({ partner_id: partnerUser.id, status: 'approved' });
    await createTestKyc({ partner_id: partner2User.id, status: 'approved' });

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'Cycle2 Shop' });
    order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      status: 'packed',
    });
  });

  describe('GET /api/v1/delivery/requests includes order_status', () => {
    it('returns order_status for partner-visible requests', async () => {
      mockAuth('c2-partner');
      await createTestDeliveryRequest({ order_id: order.id, partner_id: partnerUser.id, status: 'accepted' });

      const res = await request(app).get('/api/v1/delivery/requests').set(authHeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const row = res.body.find((r) => r.order_id === order.id);
      expect(row).toBeDefined();
      expect(row.order_status).toBe('packed');
      // OTPs still stripped for partners
      expect(row.pickup_otp).toBeUndefined();
      expect(row.delivery_otp).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/admin/config partner keys', () => {
    it('accepts delivery_base_fee, delivery_per_km_fee, referral flags, support phone', async () => {
      mockAuth('c2-admin');
      const res = await request(app)
        .patch('/api/v1/admin/config')
        .set(authHeader)
        .send({
          commission_bps: 0,
          delivery_base_fee: 15,
          delivery_per_km_fee: 4,
          partner_referral_enabled: true,
          partner_referral_bonus: 200,
          partner_support_phone: '+911234567890',
        });
      expect(res.status).toBe(200);
      expect(res.body.delivery_base_fee).toBe('15');

      const cfg = await request(app).get('/api/v1/delivery/config').set(authHeader);
      // admin can also read partner config
      expect(cfg.body.delivery_base_fee).toBe(15);
      expect(cfg.body.partner_referral_enabled).toBe(true);
      expect(cfg.body.partner_support_phone).toBe('+911234567890');
    });

    it('rejects negative fee and bad phone', async () => {
      mockAuth('c2-admin');
      const bad1 = await request(app)
        .patch('/api/v1/admin/config')
        .set(authHeader)
        .send({ commission_bps: 0, delivery_base_fee: -5 });
      expect(bad1.status).toBe(400);

      const bad2 = await request(app)
        .patch('/api/v1/admin/config')
        .set(authHeader)
        .send({ commission_bps: 0, partner_support_phone: 'not-a-phone!!!' });
      expect(bad2.status).toBe(400);
    });

    it('still requires commission_bps (legacy behavior preserved)', async () => {
      mockAuth('c2-admin');
      const res = await request(app)
        .patch('/api/v1/admin/config')
        .set(authHeader)
        .send({ delivery_base_fee: 10 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/delivery/config', () => {
    it('returns nulls/false when nothing configured', async () => {
      mockAuth('c2-partner');
      const res = await request(app).get('/api/v1/delivery/config').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        delivery_base_fee: null,
        delivery_per_km_fee: null,
        partner_referral_enabled: false,
        partner_referral_bonus: null,
        partner_support_phone: null,
      });
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/v1/delivery/config');
      expect(res.status).toBe(401);
    });
  });

  describe('SOS alerts', () => {
    it('partner can POST an SOS; admin can list it', async () => {
      mockAuth('c2-partner');
      const dr = await createTestDeliveryRequest({
        order_id: order.id,
        partner_id: partnerUser.id,
        status: 'accepted',
      });

      const post = await request(app)
        .post('/api/v1/delivery/sos')
        .set(authHeader)
        .send({ lat: 17.4, lng: 78.48, delivery_request_id: dr.id, note: 'Shop closed' });
      expect(post.status).toBe(201);
      expect(post.body.status).toBe('open');
      expect(post.body.note).toBe('Shop closed');

      mockAuth('c2-admin');
      const list = await request(app).get('/api/v1/admin/sos-alerts').set(authHeader);
      expect(list.status).toBe(200);
      expect(list.body.length).toBe(1);
      expect(list.body[0].partner_name).toBe('Partner One');
    });

    it('rejects SOS for another partner\'s delivery', async () => {
      mockAuth('c2-partner2');
      const dr = await createTestDeliveryRequest({
        order_id: order.id,
        partner_id: partnerUser.id,
        status: 'accepted',
      });
      const res = await request(app)
        .post('/api/v1/delivery/sos')
        .set(authHeader)
        .send({ delivery_request_id: dr.id });
      expect(res.status).toBe(403);
    });

    it('partner cannot read admin SOS list', async () => {
      mockAuth('c2-partner');
      const res = await request(app).get('/api/v1/admin/sos-alerts').set(authHeader);
      expect(res.status).toBe(403);
    });
  });

  describe('Referrals', () => {
    it('GET /partner/referrals returns deterministic my_code and empty list', async () => {
      mockAuth('c2-partner');
      const res = await request(app).get('/api/v1/partner/referrals').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.my_code).toBe(`LF-${partnerUser.id.toString(36).toUpperCase()}`);
      expect(res.body.referrals).toEqual([]);
    });

    it('claim flow: valid claim, duplicate 409, self-claim 400, bad code 400', async () => {
      // partner2 claims partner1's code
      mockAuth('c2-partner2');
      const myCode = `LF-${partnerUser.id.toString(36).toUpperCase()}`;
      const claim = await request(app)
        .post('/api/v1/partner/referral/claim')
        .set(authHeader)
        .send({ code: myCode });
      expect(claim.status).toBe(201);
      expect(claim.body.referrer_partner_id).toBe(partnerUser.id);
      expect(claim.body.status).toBe('pending');

      // duplicate
      const dup = await request(app)
        .post('/api/v1/partner/referral/claim')
        .set(authHeader)
        .send({ code: myCode });
      expect(dup.status).toBe(409);

      // self-claim
      mockAuth('c2-partner');
      const self = await request(app)
        .post('/api/v1/partner/referral/claim')
        .set(authHeader)
        .send({ code: `LF-${partnerUser.id.toString(36).toUpperCase()}` });
      expect(self.status).toBe(400);

      // bad code
      const bad = await request(app)
        .post('/api/v1/partner/referral/claim')
        .set(authHeader)
        .send({ code: 'NOPE' });
      expect(bad.status).toBe(400);

      // referrer sees the referred partner
      const list = await request(app).get('/api/v1/partner/referrals').set(authHeader);
      expect(list.body.referrals.length).toBe(1);
      expect(list.body.referrals[0].referred_name).toBe('Partner Two');
    });

    it('snapshots configured bonus at claim time', async () => {
      mockAuth('c2-admin');
      await request(app)
        .patch('/api/v1/admin/config')
        .set(authHeader)
        .send({ commission_bps: 0, partner_referral_bonus: 250 });

      mockAuth('c2-partner2');
      const myCode = `LF-${partnerUser.id.toString(36).toUpperCase()}`;
      const claim = await request(app)
        .post('/api/v1/partner/referral/claim')
        .set(authHeader)
        .send({ code: myCode });
      expect(claim.status).toBe(201);
      expect(Number(claim.body.bonus_amount)).toBe(250);
    });
  });
});
