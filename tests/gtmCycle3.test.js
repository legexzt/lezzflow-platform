/**
 * GTM Cycle-3 backend:
 *  - first delivered trip of a referred partner auto-qualifies the referral
 *    with the configured partner_referral_bonus (system-backed rewards)
 *  - /discover response carries the cluster launch gate (25 live shops)
 *  - GET /admin/analytics/launch-gate lists localities vs the 25-shop threshold
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

const authHeader = { Authorization: 'Bearer <redacted>' };
const mockAuth = (uid) =>
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid }),
  });

describe('GTM Cycle-3', () => {
  let sellerUser, customerUser, partnerUser, referrerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    await createTestUser({ firebase_uid: 'g3-admin', role: 'admin', name: 'Admin' });
    sellerUser = await createTestUser({ firebase_uid: 'g3-seller', role: 'seller', name: 'Seller' });
    customerUser = await createTestUser({ firebase_uid: 'g3-cust', role: 'customer', name: 'Cust' });
    partnerUser = await createTestUser({ firebase_uid: 'g3-partner', role: 'partner', name: 'Partner' });
    referrerUser = await createTestUser({ firebase_uid: 'g3-referrer', role: 'partner', name: 'Referrer' });
    await createTestKyc({ partner_id: partnerUser.id, status: 'approved' });
    await query('UPDATE users SET is_online = true WHERE id = $1', [partnerUser.id]);

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'G3 Shop' });
  });

  // Drives one full trip requested -> accepted -> picked -> delivered via the
  // real HTTP + OTP flow so the referral hook actually fires.
  async function driveToDelivered() {
    const order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      status: 'packed',
    });
    const dr = await createTestDeliveryRequest({ order_id: order.id, status: 'requested' });

    mockAuth('g3-partner');
    const accept = await request(app)
      .patch(`/api/v1/delivery/requests/${dr.id}`)
      .set(authHeader)
      .send({ status: 'accepted' });
    expect(accept.status).toBe(200);

    const pickupOtp = (
      await query('SELECT pickup_otp FROM delivery_requests WHERE id = $1', [dr.id])
    ).rows[0].pickup_otp;
    const pick = await request(app)
      .patch(`/api/v1/delivery/requests/${dr.id}`)
      .set(authHeader)
      .send({ status: 'picked', otp: pickupOtp });
    expect(pick.status).toBe(200);

    const deliveryOtp = (
      await query('SELECT delivery_otp FROM delivery_requests WHERE id = $1', [dr.id])
    ).rows[0].delivery_otp;
    const deliver = await request(app)
      .patch(`/api/v1/delivery/requests/${dr.id}`)
      .set(authHeader)
      .send({ status: 'delivered', otp: deliveryOtp });
    expect(deliver.status).toBe(200);
  }

  async function referralRow() {
    const r = await query(
      'SELECT status, bonus_amount FROM partner_referrals WHERE referred_partner_id = $1',
      [partnerUser.id]
    );
    return r.rows[0] || null;
  }

  describe('Referral auto-qualify (system-backed rewards)', () => {
    test('first delivered trip qualifies a pending referral with the configured bonus', async () => {
      await query(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES ('partner_referral_bonus', '200', CURRENT_TIMESTAMP)`
      );
      await query(
        `INSERT INTO partner_referrals (referrer_partner_id, referred_partner_id, status)
         VALUES ($1, $2, 'pending')`,
        [referrerUser.id, partnerUser.id]
      );

      await driveToDelivered();

      const row = await referralRow();
      expect(row.status).toBe('qualified');
      expect(Number(row.bonus_amount)).toBe(200);
    });

    test('a later trip does not re-touch an already-qualified referral', async () => {
      await query(
        `INSERT INTO partner_referrals (referrer_partner_id, referred_partner_id, status)
         VALUES ($1, $2, 'pending')`,
        [referrerUser.id, partnerUser.id]
      );

      await driveToDelivered();
      // Admin manually overrides the bonus before payout — the hook must not clobber it
      await query(`UPDATE partner_referrals SET bonus_amount = 500 WHERE referred_partner_id = $1`, [
        partnerUser.id,
      ]);
      await driveToDelivered();

      const row = await referralRow();
      expect(row.status).toBe('qualified');
      expect(Number(row.bonus_amount)).toBe(500);
    });

    test('delivery succeeds normally when there is no pending referral', async () => {
      await driveToDelivered();
      const n = await query('SELECT COUNT(*)::int AS n FROM partner_referrals');
      expect(Number(n.rows[0].n)).toBe(0);
    });

    test('missing bonus config leaves bonus_amount unset (honest, not invented)', async () => {
      await query(
        `INSERT INTO partner_referrals (referrer_partner_id, referred_partner_id, status)
         VALUES ($1, $2, 'pending')`,
        [referrerUser.id, partnerUser.id]
      );

      await driveToDelivered();

      const row = await referralRow();
      expect(row.status).toBe('qualified');
      expect(row.bonus_amount).toBeNull();
    });
  });

  describe('Cluster launch gate', () => {
    test('discover response carries launch_gate (not ready below 25 shops)', async () => {
      const res = await request(app).get('/api/v1/discover?lat=12.9716&lng=77.5946');
      expect(res.status).toBe(200);
      expect(res.body.launch_gate).toBeDefined();
      expect(res.body.launch_gate.threshold).toBe(25);
      expect(res.body.launch_gate.live_shops_10km).toBe(1);
      expect(res.body.launch_gate.ready).toBe(false);
    });

    test('admin launch-gate lists localities against the threshold, not-ready first', async () => {
      await query('UPDATE shops SET locality = $1 WHERE id = $2', ['G3Locality', shop.id]);

      mockAuth('g3-admin');
      const res = await request(app)
        .get('/api/v1/admin/analytics/launch-gate')
        .set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.threshold).toBe(25);
      const row = res.body.data.find((d) => d.locality === 'G3Locality');
      expect(row).toBeDefined();
      expect(row.active_kiranas).toBe(1);
      expect(row.ready).toBe(false);
      expect(row.shops_needed).toBe(24);
    });

    test('launch-gate is admin-only', async () => {
      mockAuth('g3-partner');
      const res = await request(app)
        .get('/api/v1/admin/analytics/launch-gate')
        .set(authHeader);
      expect(res.status).toBe(403);
    });
  });
});
