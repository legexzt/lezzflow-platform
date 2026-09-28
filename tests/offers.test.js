process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestProduct,
} = require('./helpers/testDb');

function authAs(firebaseUid) {
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: firebaseUid }),
  });
}

const offerPayload = {
  title: 'Diwali Dhamaka',
  description: 'Rs 50 off above Rs 500',
  discount_type: 'flat',
  discount_value: 50,
  min_order: 500,
  active: true,
};

describe('Dukaan Offers (shop_offers)', () => {
  let sellerUser, otherSeller, customerUser, shop, otherShop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({ firebase_uid: 'offer-seller-uid', role: 'seller', name: 'Offer Seller' });
    otherSeller = await createTestUser({ firebase_uid: 'offer-seller2-uid', role: 'seller', name: 'Other Seller' });
    customerUser = await createTestUser({ firebase_uid: 'offer-customer-uid', role: 'customer', name: 'Offer Customer' });

    shop = await createTestShop({ seller_id: sellerUser.id, name: 'Offer Shop' });
    otherShop = await createTestShop({ seller_id: otherSeller.id, name: 'Other Shop' });
  });

  describe('POST /api/v1/shops/:id/offers (seller)', () => {
    it('creates an offer for the owning seller (201)', async () => {
      authAs(sellerUser.firebase_uid);
      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set('Authorization', 'Bearer <redacted>')
        .send(offerPayload);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Diwali Dhamaka');
      expect(res.body.discount_type).toBe('flat');
      expect(Number(res.body.discount_value)).toBe(50);
      expect(res.body.shop_id).toBe(shop.id);
    });

    it('rejects percent discount_value above 100 (400)', async () => {
      authAs(sellerUser.firebase_uid);
      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set('Authorization', 'Bearer <redacted>')
        .send({ ...offerPayload, discount_type: 'percent', discount_value: 150 });

      expect(res.status).toBe(400);
    });

    it('rejects creation on another seller\'s shop (404)', async () => {
      authAs(sellerUser.firebase_uid);
      const res = await request(app)
        .post(`/api/v1/shops/${otherShop.id}/offers`)
        .set('Authorization', 'Bearer <redacted>')
        .send(offerPayload);

      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated creation (401)', async () => {
      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .send(offerPayload);

      expect(res.status).toBe(401);
    });

    it('rejects customer role creation (403)', async () => {
      authAs(customerUser.firebase_uid);
      const res = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set('Authorization', 'Bearer <redacted>')
        .send(offerPayload);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/shops/:id/offers visibility', () => {
    it('customer sees only active, in-window offers; seller sees all', async () => {
      authAs(sellerUser.firebase_uid);
      const base = request(app);
      const authHeader = { Authorization: 'Bearer <redacted>' };

      // Active offer
      await base.post(`/api/v1/shops/${shop.id}/offers`).set(authHeader).send(offerPayload).expect(201);
      // Inactive offer
      await base
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set(authHeader)
        .send({ ...offerPayload, title: 'Hidden Offer', active: false })
        .expect(201);
      // Expired offer
      await base
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set(authHeader)
        .send({
          ...offerPayload,
          title: 'Old Offer',
          valid_from: '2020-01-01T00:00:00Z',
          valid_to: '2020-02-01T00:00:00Z',
        })
        .expect(201);

      // Customer view: only the active, in-window offer
      const customerRes = await base.get(`/api/v1/shops/${shop.id}/offers`);
      expect(customerRes.status).toBe(200);
      expect(customerRes.body.length).toBe(1);
      expect(customerRes.body[0].title).toBe('Diwali Dhamaka');

      // Owner view: all three
      const sellerRes = await base.get(`/api/v1/shops/${shop.id}/offers`).set(authHeader);
      expect(sellerRes.status).toBe(200);
      expect(sellerRes.body.length).toBe(3);
    });
  });

  describe('PATCH /api/v1/shops/:id/offers/:offerId (seller)', () => {
    it('updates the offer and rejects invalid percent (200 then 400)', async () => {
      authAs(sellerUser.firebase_uid);
      const authHeader = { Authorization: 'Bearer <redacted>' };
      const created = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set(authHeader)
        .send(offerPayload);
      const offerId = created.body.id;

      const okRes = await request(app)
        .patch(`/api/v1/shops/${shop.id}/offers/${offerId}`)
        .set(authHeader)
        .send({ active: false, title: 'Paused Offer' });
      expect(okRes.status).toBe(200);
      expect(okRes.body.active).toBe(false);
      expect(okRes.body.title).toBe('Paused Offer');

      const badRes = await request(app)
        .patch(`/api/v1/shops/${shop.id}/offers/${offerId}`)
        .set(authHeader)
        .send({ discount_type: 'percent', discount_value: 200 });
      expect(badRes.status).toBe(400);
    });

    it('rejects update on another seller\'s offer (404)', async () => {
      // Create the offer as the rightful owner first
      authAs(sellerUser.firebase_uid);
      const owned = await request(app)
        .post(`/api/v1/shops/${shop.id}/offers`)
        .set('Authorization', 'Bearer <redacted>')
        .send(offerPayload);
      expect(owned.status).toBe(201);

      // Another seller tries to patch it
      authAs(otherSeller.firebase_uid);
      const res = await request(app)
        .patch(`/api/v1/shops/${shop.id}/offers/${owned.body.id}`)
        .set('Authorization', 'Bearer <redacted>')
        .send({ active: false });
      expect(res.status).toBe(404);
    });
  });
});

describe('GET /api/v1/products/compare', () => {
  let shopA, shopB, closedShop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    const seller = await createTestUser({ firebase_uid: 'cmp-seller-uid', role: 'seller' });
    shopA = await createTestShop({ seller_id: seller.id, name: 'Shop A', lat: 17.385, lng: 78.4867 });
    shopB = await createTestShop({ seller_id: seller.id, name: 'Shop B', lat: 17.395, lng: 78.4967 });
    closedShop = await createTestShop({
      seller_id: seller.id,
      name: 'Closed Shop',
      lat: 17.39,
      lng: 78.49,
      is_open: false,
    });

    await createTestProduct({ shop_id: shopA.id, name: 'Amul Taaza Milk 1L', price: 66, stock: 10 });
    await createTestProduct({ shop_id: shopB.id, name: 'amul  taaza milk 1L ', price: 62, stock: 5 });
    await createTestProduct({ shop_id: closedShop.id, name: 'Amul Taaza Milk 1L', price: 50, stock: 20 });
    await createTestProduct({ shop_id: shopB.id, name: 'Parle-G Biscuits', price: 10, stock: 30 });
  });

  it('returns same-named product at other open live shops sorted by price, with real distances', async () => {
    const res = await request(app).get(
      `/api/v1/products/compare?shop_id=${shopA.id}&name=${encodeURIComponent('Amul Taaza Milk 1L')}&lat=17.385&lng=78.4867`
    );

    expect(res.status).toBe(200);
    // Only Shop B: closed shop excluded, own shop excluded
    expect(res.body.length).toBe(1);
    expect(res.body[0].shop_name).toBe('Shop B');
    expect(Number(res.body[0].price)).toBe(62);
    expect(res.body[0].distance_km).toBeGreaterThan(0);
    expect(res.body[0].distance_km).toBeLessThan(5);
  });

  it('returns empty array when no other shop stocks the item', async () => {
    const res = await request(app).get(
      `/api/v1/products/compare?shop_id=${shopA.id}&name=${encodeURIComponent('Parle-G Biscuits')}&lat=17.385&lng=78.4867`
    );

    expect(res.status).toBe(200);
    // Parle-G is at shopB; querying from shopA should find it at shopB
    expect(res.body.length).toBe(1);
    expect(res.body[0].shop_name).toBe('Shop B');
  });

  it('returns 400 when required params are missing', async () => {
    const res = await request(app).get('/api/v1/products/compare?shop_id=1');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/orders with offer_id (server-side discount)', () => {
  let customerUser, sellerUser, shop, product;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    sellerUser = await createTestUser({ firebase_uid: 'ord-offer-seller', role: 'seller' });
    customerUser = await createTestUser({ firebase_uid: 'ord-offer-cust', role: 'customer' });
    shop = await createTestShop({ seller_id: sellerUser.id, name: 'Order Offer Shop' });
    product = await createTestProduct({ shop_id: shop.id, name: 'Rice 5kg', price: 600, stock: 10 });
  });

  const orderPayload = (extra = {}) => ({
    shop_id: shop.id,
    fulfillment: 'pickup',
    items: [{ product_id: product.id, name: 'Rice 5kg', price: 600, quantity: 1 }],
    ...extra,
  });

  it('applies a valid flat offer: total reduced server-side, offer_id + discount stored', async () => {
    // Seller creates the offer
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
    });
    const created = await request(app)
      .post(`/api/v1/shops/${shop.id}/offers`)
      .set('Authorization', 'Bearer <redacted>')
      .send({ title: 'Flat 50', discount_type: 'flat', discount_value: 50, min_order: 500 });
    expect(created.status).toBe(201);

    // Customer orders with the offer
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer <redacted>')
      .send(orderPayload({ offer_id: created.body.id }));

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(550); // 600 - 50, computed server-side
    expect(Number(res.body.discount)).toBe(50);
    expect(res.body.offer_id).toBe(created.body.id);
  });

  it('rejects an offer below its min_order (400)', async () => {
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
    });
    const created = await request(app)
      .post(`/api/v1/shops/${shop.id}/offers`)
      .set('Authorization', 'Bearer <redacted>')
      .send({ title: 'Big order only', discount_type: 'flat', discount_value: 50, min_order: 1000 });
    expect(created.status).toBe(201);

    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer <redacted>')
      .send(orderPayload({ offer_id: created.body.id }));

    expect(res.status).toBe(400);
  });

  it('rejects an inactive offer (400) and ignores a bogus offer_id (400)', async () => {
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
    });
    const created = await request(app)
      .post(`/api/v1/shops/${shop.id}/offers`)
      .set('Authorization', 'Bearer <redacted>')
      .send({ title: 'Paused', discount_type: 'flat', discount_value: 50, active: false });
    expect(created.status).toBe(201);

    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
    });
    const inactiveRes = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer <redacted>')
      .send(orderPayload({ offer_id: created.body.id }));
    expect(inactiveRes.status).toBe(400);

    const bogusRes = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer <redacted>')
      .send(orderPayload({ offer_id: 999999 }));
    expect(bogusRes.status).toBe(400);
  });

  it('orders without offer_id are unaffected (full total, zero discount)', async () => {
    jest.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer <redacted>')
      .send(orderPayload());

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(600);
    expect(Number(res.body.discount)).toBe(0);
    expect(res.body.offer_id).toBeNull();
  });
});
