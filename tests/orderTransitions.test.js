process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { isValidOrderStatusTransition } = require('../controllers/orderController');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
  createTestOrder,
} = require('./helpers/testDb');

describe('Order Status Transitions & Delivery Assignment', () => {
  let customerUser, sellerUser, otherSellerUser, shop;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();

    // Create users
    customerUser = await createTestUser({
      firebase_uid: 'cust-order-uid',
      role: 'customer',
      name: 'Customer Bob',
    });

    sellerUser = await createTestUser({
      firebase_uid: 'seller-order-uid',
      role: 'seller',
      name: 'Seller Alice',
    });

    otherSellerUser = await createTestUser({
      firebase_uid: 'other-seller-uid',
      role: 'seller',
      name: 'Seller Charlie',
    });

    shop = await createTestShop({
      seller_id: sellerUser.id,
      name: 'Alice Grocery',
    });
  });

  describe('Unit rules: isValidOrderStatusTransition', () => {
    it('should permit legal seller transitions: placed -> accepted -> packed', () => {
      expect(isValidOrderStatusTransition('placed', 'accepted', 'seller')).toBe(true);
      expect(isValidOrderStatusTransition('accepted', 'packed', 'seller')).toBe(true);
    });

    it('should permit cancellation from placed or accepted', () => {
      expect(isValidOrderStatusTransition('placed', 'cancelled', 'seller')).toBe(true);
      expect(isValidOrderStatusTransition('accepted', 'cancelled', 'seller')).toBe(true);
    });

    it('should reject invalid seller status transitions', () => {
      // Cannot skip placed -> packed directly
      expect(isValidOrderStatusTransition('placed', 'packed', 'seller')).toBe(false);
      // Cannot skip placed -> delivered
      expect(isValidOrderStatusTransition('placed', 'delivered', 'seller')).toBe(false);
      // Cannot move backwards: accepted -> placed
      expect(isValidOrderStatusTransition('accepted', 'placed', 'seller')).toBe(false);
      // Cannot move backwards: packed -> accepted
      expect(isValidOrderStatusTransition('packed', 'accepted', 'seller')).toBe(false);
      // Cannot transition from cancelled
      expect(isValidOrderStatusTransition('cancelled', 'placed', 'seller')).toBe(false);
    });
  });

  describe('POST /api/orders (Order Creation)', () => {
    it('should allow customer to create order with fulfillment delivery', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          shop_id: shop.id,
          fulfillment: 'delivery',
          address: '123 Test Street, Hyderabad',
          items: [{ product_id: 1, name: 'Apples', price: 10, quantity: 2 }],
          total: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('placed');
      expect(res.body.fulfillment).toBe('delivery');
      expect(parseFloat(res.body.total)).toBe(20);
      expect(res.body.customer_id).toBe(customerUser.id);
    });

    it('should return 400 if fulfillment is not delivery or pickup', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          shop_id: shop.id,
          fulfillment: 'drone_teleport',
          items: [{ product_id: 1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid fulfillment type');
    });

    it('should return 400 if items array is empty', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          shop_id: shop.id,
          fulfillment: 'delivery',
          address: '123 Test Street, Hyderabad',
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('items must be a non-empty array');
    });
  });

  describe('PATCH /api/orders/:id/status (Seller transition rules)', () => {
    it('should allow seller to advance status: placed -> accepted', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'placed',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', 'Bearer valid-seller-token')
        .send({ status: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('accepted');
    });

    it('should allow seller to advance status: accepted -> packed', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'accepted',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', 'Bearer valid-seller-token')
        .send({ status: 'packed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('packed');
    });

    it('should reject illegal status skip: placed -> packed with 400', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'placed',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: sellerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', 'Bearer valid-seller-token')
        .send({ status: 'packed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid status transition from 'placed' to 'packed'");
    });

    it('should reject non-owner seller with 403', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        status: 'placed',
      });

      // Different seller tries to update Alice's shop order
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: otherSellerUser.firebase_uid }),
      });

      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', 'Bearer other-seller-token')
        .send({ status: 'accepted' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });

  describe('POST /api/orders/:id/assign-delivery', () => {
    it('should create delivery_request with status requested for delivery order', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'packed',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/orders/${order.id}/assign-delivery`)
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(201);
      expect(res.body.order_id).toBe(order.id);
      expect(res.body.status).toBe('requested');
      expect(res.body.partner_id).toBeNull();
    });

    it('should return 400 if order fulfillment is pickup', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'pickup',
        status: 'packed',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      const res = await request(app)
        .post(`/api/orders/${order.id}/assign-delivery`)
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("fulfillment is 'pickup'");
    });

    it('should return 400 if delivery_request already exists for the order', async () => {
      const order = await createTestOrder({
        customer_id: customerUser.id,
        shop_id: shop.id,
        fulfillment: 'delivery',
        status: 'packed',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: customerUser.firebase_uid }),
      });

      // First assignment succeeds
      const firstRes = await request(app)
        .post(`/api/orders/${order.id}/assign-delivery`)
        .set('Authorization', 'Bearer valid-customer-token');
      expect(firstRes.status).toBe(201);

      // Second assignment fails
      const secondRes = await request(app)
        .post(`/api/orders/${order.id}/assign-delivery`)
        .set('Authorization', 'Bearer valid-customer-token');
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toContain('Delivery request already exists');
    });
  });
});
