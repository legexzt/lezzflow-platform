/**
 * Partner Cycle-3 (migration 017):
 *  - order cancel -> delivery_request cancelled (cancelled_by='order') + event
 *  - partner can cancel an accepted trip (cancelled_by='partner')
 *  - "I already travelled" disputes: open / list / admin resolve + goodwill
 *  - trip-note chips + trip timeline
 *  - reliability score from backend-verified events only (partner/admin only)
 *  - end-of-day recap from real delivery_fee rows
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

describe('Partner Cycle-3', () => {
  let sellerUser, customerUser, partnerUser, adminUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    adminUser = await createTestUser({ firebase_uid: 'p3-admin', role: 'admin', name: 'Admin' });
    sellerUser = await createTestUser({ firebase_uid: 'p3-seller', role: 'seller', name: 'Seller' });
    customerUser = await createTestUser({ firebase_uid: 'p3-cust', role: 'customer', name: 'Cust' });
    partnerUser = await createTestUser({ firebase_uid: 'p3-partner', role: 'partner', name: 'Partner' });
    await createTestKyc({ partner_id: partnerUser.id, status: 'approved' });
    await query('UPDATE users SET is_online = true WHERE id = $1', [partnerUser.id]);
    partnerUser.is_online = true;

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'P3 Shop' });
  });

  async function makeTrip(orderStatus = 'packed', drStatus = 'accepted') {
    const order = await createTestOrder({
      customer_id: customerUser.id,
      shop_id: shop.id,
      status: orderStatus,
    });
    const dr = await createTestDeliveryRequest({
      order_id: order.id,
      partner_id: partnerUser.id,
      status: drStatus,
    });
    return { order, dr };
  }

  describe('Cancellation visibility', () => {
    test('order cancel marks the delivery request cancelled (by=order) + event', async () => {
      const { order, dr } = await makeTrip('placed', 'accepted');

      mockAuth('p3-seller');
      const cancel = await request(app)
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(authHeader)
        .send({ status: 'cancelled' });
      expect(cancel.status).toBe(200);

      mockAuth('p3-partner');
      const list = await request(app).get('/api/v1/delivery/requests').set(authHeader);
      const row = list.body.find((r) => r.order_id === order.id);
      expect(row.status).toBe('cancelled');
      expect(row.cancelled_by).toBe('order');

      const ev = await query(
        `SELECT * FROM delivery_events WHERE delivery_request_id = $1 AND event = 'cancelled'`,
        [dr.id]
      );
      expect(ev.rows.length).toBe(1);
      const meta = typeof ev.rows[0].meta === 'string' ? JSON.parse(ev.rows[0].meta) : ev.rows[0].meta;
      expect(meta.by).toBe('order');
    });

    test('partner can cancel an accepted trip (by=partner); picked cannot', async () => {
      const { dr } = await makeTrip('packed', 'accepted');
      mockAuth('p3-partner');

      const cancel = await request(app)
        .patch(`/api/v1/delivery/requests/${dr.id}`)
        .set(authHeader)
        .send({ status: 'cancelled' });
      expect(cancel.status).toBe(200);
      expect(cancel.body.cancelled_by).toBe('partner');

      const { dr: dr2 } = await makeTrip('packed', 'picked');
      const bad = await request(app)
        .patch(`/api/v1/delivery/requests/${dr2.id}`)
        .set(authHeader)
        .send({ status: 'cancelled' });
      expect(bad.status).toBe(400);
    });
  });

  describe('Travel disputes', () => {
    test('open -> 201, duplicate -> 409, partner-cancelled -> 400', async () => {
      const { dr } = await makeTrip('placed', 'accepted');
      mockAuth('p3-seller');
      await request(app).patch(`/api/v1/orders/${dr.order_id}/status`).set(authHeader).send({ status: 'cancelled' });

      mockAuth('p3-partner');
      const open = await request(app)
        .post('/api/v1/delivery/disputes')
        .set(authHeader)
        .send({ delivery_request_id: dr.id, note: 'Shop tak gaya tha' });
      expect(open.status).toBe(201);
      expect(open.body.status).toBe('open');

      const dup = await request(app)
        .post('/api/v1/delivery/disputes')
        .set(authHeader)
        .send({ delivery_request_id: dr.id });
      expect(dup.status).toBe(409);

      // partner-cancelled trip cannot be disputed
      const { dr: dr2 } = await makeTrip('packed', 'accepted');
      await request(app).patch(`/api/v1/delivery/requests/${dr2.id}`).set(authHeader).send({ status: 'cancelled' });
      const bad = await request(app)
        .post('/api/v1/delivery/disputes')
        .set(authHeader)
        .send({ delivery_request_id: dr2.id });
      expect(bad.status).toBe(400);
    });

    test('admin approves with goodwill; partner sees it in timeline', async () => {
      const { dr } = await makeTrip('placed', 'accepted');
      mockAuth('p3-seller');
      await request(app).patch(`/api/v1/orders/${dr.order_id}/status`).set(authHeader).send({ status: 'cancelled' });

      mockAuth('p3-partner');
      const open = await request(app)
        .post('/api/v1/delivery/disputes')
        .set(authHeader)
        .send({ delivery_request_id: dr.id });
      expect(open.status).toBe(201);

      mockAuth('p3-admin');
      const list = await request(app).get('/api/v1/delivery/disputes?status=open').set(authHeader);
      expect(list.status).toBe(200);
      expect(list.body.length).toBe(1);
      expect(list.body[0].partner_name).toBe('Partner');

      const resolve = await request(app)
        .patch(`/api/v1/delivery/disputes/${open.body.id}`)
        .set(authHeader)
        .send({ status: 'approved', goodwill_amount: 50 });
      expect(resolve.status).toBe(200);
      expect(resolve.body.status).toBe('approved');
      expect(Number(resolve.body.goodwill_amount)).toBe(50);

      // goodwill on rejection is rejected
      const { dr: dr2 } = await makeTrip('placed', 'accepted');
      mockAuth('p3-seller');
      await request(app).patch(`/api/v1/orders/${dr2.order_id}/status`).set(authHeader).send({ status: 'cancelled' });
      mockAuth('p3-partner');
      const open2 = await request(app).post('/api/v1/delivery/disputes').set(authHeader).send({ delivery_request_id: dr2.id });
      mockAuth('p3-admin');
      const bad = await request(app)
        .patch(`/api/v1/delivery/disputes/${open2.body.id}`)
        .set(authHeader)
        .send({ status: 'rejected', goodwill_amount: 10 });
      expect(bad.status).toBe(400);

      // partner sees the approved dispute in the trip timeline
      mockAuth('p3-partner');
      const timeline = await request(app).get(`/api/v1/delivery/requests/${dr.id}/timeline`).set(authHeader);
      expect(timeline.status).toBe(200);
      expect(timeline.body.dispute.status).toBe('approved');
      expect(Number(timeline.body.dispute.goodwill_amount)).toBe(50);
    });
  });

  describe('Trip notes + timeline', () => {
    test('chips accepted on active trips; invalid chip rejected', async () => {
      const { dr } = await makeTrip('packed', 'accepted');
      mockAuth('p3-partner');

      const note = await request(app)
        .post(`/api/v1/delivery/requests/${dr.id}/trip-notes`)
        .set(authHeader)
        .send({ chip: 'arrived_at_shop' });
      expect(note.status).toBe(201);

      const bad = await request(app)
        .post(`/api/v1/delivery/requests/${dr.id}/trip-notes`)
        .set(authHeader)
        .send({ chip: 'flying_to_moon' });
      expect(bad.status).toBe(400);

      const timeline = await request(app).get(`/api/v1/delivery/requests/${dr.id}/timeline`).set(authHeader);
      expect(timeline.status).toBe(200);
      expect(timeline.body.trip_notes.length).toBe(1);
      expect(timeline.body.trip_notes[0].chip).toBe('arrived_at_shop');
    });

    test('wrong OTP is a 400 and logs an otp_failed event', async () => {
      const { dr } = await makeTrip('packed', 'accepted');
      await query(`UPDATE delivery_requests SET pickup_otp = '1234' WHERE id = $1`, [dr.id]);
      mockAuth('p3-partner');

      const res = await request(app)
        .patch(`/api/v1/delivery/requests/${dr.id}`)
        .set(authHeader)
        .send({ status: 'picked', otp: '9999' });
      expect(res.status).toBe(400);

      const ev = await query(
        `SELECT * FROM delivery_events WHERE delivery_request_id = $1 AND event = 'otp_failed'`,
        [dr.id]
      );
      expect(ev.rows.length).toBe(1);
    });
  });

  describe('Reliability score', () => {
    test('null score before 3 trips; real score after', async () => {
      mockAuth('p3-partner');
      const empty = await request(app).get('/api/v1/delivery/reliability').set(authHeader);
      expect(empty.status).toBe(200);
      expect(empty.body.score).toBeNull();

      // 3 delivered trips (accepted -> picked -> delivered via events)
      for (let i = 0; i < 3; i++) {
        const { dr } = await makeTrip('packed', 'delivered');
        await query(
          `INSERT INTO delivery_events (delivery_request_id, partner_id, event, created_at)
           VALUES ($1, $2, 'accepted', NOW() - INTERVAL '40 minutes'),
                  ($1, $2, 'picked', NOW() - INTERVAL '20 minutes')`,
          [dr.id, partnerUser.id]
        );
      }
      const res = await request(app).get('/api/v1/delivery/reliability').set(authHeader);
      expect(res.status).toBe(200);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.score).toBeGreaterThanOrEqual(0);
      expect(res.body.score).toBeLessThanOrEqual(100);
      expect(res.body.trips).toBe(3);
      expect(res.body.delivered).toBe(3);

      // partner cannot view another partner's score
      const other = await createTestUser({ firebase_uid: 'p3-other', role: 'partner' });
      await createTestKyc({ partner_id: other.id, status: 'approved' });
      mockAuth('p3-other');
      const forbidden = await request(app)
        .get(`/api/v1/delivery/reliability?partner_id=${partnerUser.id}`)
        .set(authHeader);
      expect(forbidden.status).toBe(403);

      // admin can
      mockAuth('p3-admin');
      const adminView = await request(app)
        .get(`/api/v1/delivery/reliability?partner_id=${partnerUser.id}`)
        .set(authHeader);
      expect(adminView.status).toBe(200);
      expect(adminView.body.score).toBe(res.body.score);
    });
  });

  describe('End-of-day recap', () => {
    test('real fees summed; null earnings when fee not recorded', async () => {
      const { dr } = await makeTrip('packed', 'delivered');
      await query(`UPDATE delivery_requests SET delivery_fee = 25 WHERE id = $1`, [dr.id]);
      const { dr: dr2 } = await makeTrip('packed', 'delivered');

      mockAuth('p3-partner');
      const res = await request(app).get('/api/v1/delivery/recap').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.trips).toBe(2);
      // only one trip has a recorded fee -> earnings must be null, never invented
      expect(res.body.earnings).toBeNull();
      expect(res.body.earnings_note).toMatch(/not recorded/i);

      await query(`UPDATE delivery_requests SET delivery_fee = 35 WHERE id = $1`, [dr2.id]);
      const res2 = await request(app).get('/api/v1/delivery/recap').set(authHeader);
      expect(res2.body.trips).toBe(2);
      expect(res2.body.earnings).toBe(60);
    });
  });
});
