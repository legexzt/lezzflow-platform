process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { resetIsLiveCache } = require('../controllers/localityAnalyticsController');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
  query,
} = require('./helpers/testDb');

// Raw order insert with explicit created_at (helpers don't support it)
async function createOrderAt({ customer_id, shop_id, fulfillment = 'delivery', total = 100, status = 'placed', daysAgo = 1 }) {
  const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const result = await query(
    `INSERT INTO orders (customer_id, shop_id, items, fulfillment, total, status, created_at)
     VALUES ($1, $2, '[]'::jsonb, $3, $4, $5, $6)
     RETURNING *`,
    [customer_id, shop_id, fulfillment, total, status, createdAt]
  );
  return result.rows[0];
}

async function createDeliveryFee({ order_id, fee }) {
  await query(
    `INSERT INTO delivery_requests (order_id, delivery_fee, status)
     VALUES ($1, $2, 'delivered')`,
    [order_id, fee]
  );
}

async function setShopAttrs(shopId, locality, isLive) {
  await query(`UPDATE shops SET locality = $1, is_live = $2 WHERE id = $3`, [
    locality,
    isLive,
    shopId,
  ]);
}

describe('Locality analytics (admin)', () => {
  let adminUser, sellerUser;
  let custA, custB, custC;

  const mockAuth = (uid) =>
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid }),
    });

  // Seeds two localities with real-shape data. Returns key ids.
  async function seed() {
    const seller1 = sellerUser;
    const seller2 = await createTestUser({
      firebase_uid: 'seller2-uid',
      role: 'seller',
      name: 'Seller Two',
    });

    // dilsukhnagar: shopD1 (live), shopD2 (not live, has products)
    const shopD1 = await createTestShop({
      seller_id: seller1.id,
      name: 'Dilsukhnagar Store 1',
      address: '1, Main Road, Dilsukhnagar',
    });
    const shopD2 = await createTestShop({
      seller_id: seller1.id,
      name: 'Dilsukhnagar Store 2',
      address: '2, Market Lane, Dilsukhnagar',
    });
    // malakpet: shopM1 (live), shopM2 (no products at all)
    const shopM1 = await createTestShop({
      seller_id: seller2.id,
      name: 'Malakpet Store 1',
      address: '5, Bazaar Rd, Malakpet',
    });
    const shopM2 = await createTestShop({
      seller_id: seller2.id,
      name: 'Malakpet Store 2 (empty)',
      address: '9, Lane, Malakpet',
    });

    await setShopAttrs(shopD1.id, 'dilsukhnagar', true);
    await setShopAttrs(shopD2.id, 'dilsukhnagar', false);
    await setShopAttrs(shopM1.id, 'malakpet', true);
    await setShopAttrs(shopM2.id, 'malakpet', false);

    await createTestProduct({ shop_id: shopD1.id, price: 10 });
    await createTestProduct({ shop_id: shopD1.id, price: 20 });
    await createTestProduct({ shop_id: shopD2.id, price: 30 });
    await createTestProduct({ shop_id: shopM1.id, price: 40 });
    // shopM2 deliberately gets no products

    // Window orders (all within 30 days)
    const o1 = await createOrderAt({ customer_id: custA.id, shop_id: shopD1.id, fulfillment: 'pickup', total: 100, daysAgo: 2 });
    const o2 = await createOrderAt({ customer_id: custA.id, shop_id: shopD1.id, fulfillment: 'delivery', total: 200, daysAgo: 1 });
    const o3 = await createOrderAt({ customer_id: custB.id, shop_id: shopD1.id, fulfillment: 'delivery', total: 300, daysAgo: 3 });
    await createDeliveryFee({ order_id: o2.id, fee: 30 });
    await createDeliveryFee({ order_id: o3.id, fee: 50 });

    const o4 = await createOrderAt({ customer_id: custA.id, shop_id: shopM1.id, fulfillment: 'delivery', total: 400, daysAgo: 5 });
    // o4 has NO delivery_request -> unassigned_delivery

    // Old orders — outside the 30-day window, must be excluded
    await createOrderAt({ customer_id: custC.id, shop_id: shopM1.id, fulfillment: 'pickup', total: 150, daysAgo: 40 });
    await createOrderAt({ customer_id: custB.id, shop_id: shopD1.id, fulfillment: 'pickup', total: 60, daysAgo: 35 });

    return { o1, o2, o3, o4 };
  }

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
    resetIsLiveCache();

    adminUser = await createTestUser({
      firebase_uid: 'admin-uid',
      role: 'admin',
      name: 'Admin',
    });
    sellerUser = await createTestUser({
      firebase_uid: 'seller-uid',
      role: 'seller',
      name: 'Seller',
    });
    custA = await createTestUser({ firebase_uid: 'custA-uid', role: 'customer', name: 'Cust A' });
    custB = await createTestUser({ firebase_uid: 'custB-uid', role: 'customer', name: 'Cust B' });
    custC = await createTestUser({ firebase_uid: 'custC-uid', role: 'customer', name: 'Cust C' });
  });

  test('GET /api/v1/admin/analytics/localities returns real per-locality metrics', async () => {
    await seed();
    mockAuth('admin-uid');

    const res = await request(app).get('/api/v1/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(res.body.localities_count).toBe(2);

    const d = res.body.data.find((r) => r.locality === 'dilsukhnagar');
    const m = res.body.data.find((r) => r.locality === 'malakpet');
    expect(d).toBeDefined();
    expect(m).toBeDefined();

    // dilsukhnagar: 3 window orders (o1, o2, o3); old o6 excluded
    expect(d.orders_total).toBe(3);
    expect(d.orders_per_day).toBeCloseTo(3 / 30, 2); // = 0.1
    // area unknown -> null + note, never fabricated
    expect(d.orders_per_day_per_km2).toBeNull();
    expect(d.area_note).toMatch(/n\/a \(area unknown/);

    // repeat: custA has 2 orders, custB has 1 -> 1/2 = 0.5
    expect(d.customers_total).toBe(2);
    expect(d.repeat_order_rate).toBe(0.5);

    // AOV = (100+200+300)/3 = 200
    expect(d.aov).toBe(200);

    // fulfillment mix: 1 pickup, 2 partner deliveries (both have DR rows), 0 unassigned
    expect(d.fulfillment_mix).toEqual({
      self_pickup: 1,
      partner_delivery: 2,
      unassigned_delivery: 0,
    });

    // delivery cost = avg(30, 50) = 40
    expect(d.delivery_cost_per_order).toBe(40);
    expect(d.delivery_cost_note).toBeUndefined();

    // revenue is 0 in beta with explicit note
    expect(d.revenue_per_order).toBe(0);
    expect(d.revenue_note).toBe('Payments coming soon — revenue is ₹0 during beta');

    // is_live branch: only shopD1 is live
    expect(d.active_kiranas).toBe(1);
    expect(d.active_kiranas_definition).toMatch(/is_live/);

    // malakpet: 1 window order (o4); old order excluded
    expect(m.orders_total).toBe(1);
    expect(m.orders_per_day).toBeCloseTo(1 / 30, 2);
    expect(m.repeat_order_rate).toBe(0);
    expect(m.aov).toBe(400);
    expect(m.fulfillment_mix).toEqual({
      self_pickup: 0,
      partner_delivery: 0,
      unassigned_delivery: 1,
    });
    // no delivery-fee rows -> 0 with note
    expect(m.delivery_cost_per_order).toBe(0);
    expect(m.delivery_cost_note).toBe('no delivery-fee data recorded');
    expect(m.revenue_per_order).toBe(0);
    expect(m.active_kiranas).toBe(1);
  });

  test('detail endpoint is case-insensitive and honors days param', async () => {
    await seed();
    mockAuth('admin-uid');

    const res = await request(app).get('/api/v1/admin/analytics/localities/DILSUKHNAGAR').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    // bare object, no wrapper
    expect(res.body.locality).toBe('dilsukhnagar');
    expect(res.body.orders_total).toBe(3);
    expect(res.body.data).toBeUndefined();

    const res7 = await request(app).get('/api/v1/admin/analytics/localities/dilsukhnagar?days=7').set('Authorization', 'Bearer test-token');
    expect(res7.status).toBe(200);
    // all 3 window orders are within 7 days -> 3/7
    expect(res7.body.orders_per_day).toBeCloseTo(3 / 7, 2);
  });

  test('detail endpoint 404s for unknown locality', async () => {
    await seed();
    mockAuth('admin-uid');

    const res = await request(app).get('/api/v1/admin/analytics/localities/nowhere').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No shops found/);
  });

  test('empty data: fresh DB returns empty list, no fabricated metrics', async () => {
    mockAuth('admin-uid');
    const res = await request(app).get('/api/v1/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.localities_count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  test('empty data: shops with no orders report zeros, not nulls', async () => {
    mockAuth('admin-uid');
    const shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Empty Area Store',
      address: '1, Road, Emptytown',
    });
    await setShopAttrs(shop.id, 'emptytown', true);

    const res = await request(app).get('/api/v1/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.localities_count).toBe(1);
    const row = res.body.data[0];
    expect(row.locality).toBe('emptytown');
    expect(row.orders_total).toBe(0);
    expect(row.orders_per_day).toBe(0);
    expect(row.repeat_order_rate).toBe(0);
    expect(row.aov).toBe(0);
    expect(row.delivery_cost_per_order).toBe(0);
    expect(row.delivery_cost_note).toBe('no delivery-fee data recorded');
    expect(row.revenue_per_order).toBe(0);
    expect(row.orders_per_day_per_km2).toBeNull();
    expect(row.fulfillment_mix).toEqual({
      self_pickup: 0,
      partner_delivery: 0,
      unassigned_delivery: 0,
    });
    // live shop with no orders still counts as active kirana
    expect(row.active_kiranas).toBe(1);
  });

  test('fallback branch: without is_live column, active kiranas = shops with ≥1 product', async () => {
    await seed();
    mockAuth('admin-uid');

    await query('ALTER TABLE shops DROP COLUMN is_live');
    resetIsLiveCache();

    const res = await request(app).get('/api/v1/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    const d = res.body.data.find((r) => r.locality === 'dilsukhnagar');
    const m = res.body.data.find((r) => r.locality === 'malakpet');
    // dilsukhnagar: both D1 and D2 have products -> 2; malakpet: only M1 -> 1
    expect(d.active_kiranas).toBe(2);
    expect(m.active_kiranas).toBe(1);
    expect(d.active_kiranas_definition).toMatch(/fallback/);
    // other metrics unaffected
    expect(d.orders_total).toBe(3);
    expect(d.repeat_order_rate).toBe(0.5);
  });

  test('008 backfill heuristic is deterministic: comma-split, lowercased, unknown for blank', async () => {
    mockAuth('admin-uid');
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../db/migrations/008_locality_analytics.sql'),
      'utf8'
    );
    const backfill = sql.match(/UPDATE shops[\s\S]*?WHERE locality IS NULL;/)[0];
    expect(backfill).toBeTruthy();

    await createTestShop({ seller_id: sellerUser.id, name: 'S1', address: '100 Main St, Hyderabad' });
    await createTestShop({ seller_id: sellerUser.id, name: 'S2', address: 'NoComma Road' });
    await createTestShop({ seller_id: sellerUser.id, name: 'S3', address: '' });
    await createTestShop({ seller_id: sellerUser.id, name: 'S4', address: null });

    await query(backfill);

    const rows = await query('SELECT name, locality FROM shops ORDER BY name');
    const got = Object.fromEntries(rows.rows.map((r) => [r.name, r.locality]));
    expect(got.S1).toBe('100 main st'); // before first comma, lowercased
    expect(got.S2).toBe('nocomma road'); // no comma -> whole address
    expect(got.S3).toBe('unknown'); // empty -> unknown
    expect(got.S4).toBe('unknown'); // null -> unknown
  });

  test('non-admin gets 403 on both endpoints', async () => {
    await seed();
    mockAuth('seller-uid');

    const list = await request(app).get('/api/v1/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(list.status).toBe(403);
    const detail = await request(app).get('/api/v1/admin/analytics/localities/dilsukhnagar').set('Authorization', 'Bearer test-token');
    expect(detail.status).toBe(403);
  });

  test('also served under /api/admin (non-v1 mount)', async () => {
    await seed();
    mockAuth('admin-uid');
    const res = await request(app).get('/api/admin/analytics/localities').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.localities_count).toBe(2);
  });
});
