process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const admin = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { setupTestDb, createTestUser } = require('./helpers/testDb');

describe('Auth Middleware & Auth Endpoints', () => {
  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
  });

  describe('authenticateToken Middleware Unit Tests', () => {
    it('should return 401 if Authorization header is missing', async () => {
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Missing or invalid Authorization header') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if Bearer token is empty', async () => {
      const req = { headers: { authorization: 'Bearer ' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if Firebase verifyIdToken throws an error', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Firebase token expired')),
      });

      const req = { headers: { authorization: 'Bearer expired-token' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized: Invalid or expired Firebase ID token.' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user does not exist in PostgreSQL', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: 'non-existent-uid', email: 'none@example.com' }),
      });

      const req = { headers: { authorization: 'Bearer valid-token-unregistered-user' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('User not found') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should attach req.user and call next() for valid token and existing user', async () => {
      const user = await createTestUser({
        firebase_uid: 'fb-user-123',
        role: 'customer',
        name: 'John Doe',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: 'fb-user-123', email: 'john@example.com' }),
      });

      const req = { headers: { authorization: 'Bearer valid-jwt-token' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.firebase_uid).toBe('fb-user-123');
      expect(req.user.name).toBe('John Doe');
    });
  });

  describe('requireRole Middleware', () => {
    it('should return 401 if req.user is missing', () => {
      const middleware = requireRole('seller');
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if user role does not match required role', () => {
      const middleware = requireRole(['seller', 'admin']);
      const req = { user: { role: 'customer' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Forbidden: Access requires') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() if user role matches', () => {
      const middleware = requireRole('seller');
      const req = { user: { role: 'seller' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should return 400 if idToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/verify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('idToken is required');
    });

    it('should return 401 if idToken is invalid', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token signature')),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ idToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired Firebase ID token');
    });

    it('should reject invalid roles with 400', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: 'new-uid-test', email: 'test@example.com' }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ idToken: 'valid-token', role: 'super-hacker' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid role');
    });

    it('should upsert and register a new user successfully', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'firebase-new-123',
          email: 'alice@example.com',
          name: 'Alice Wonder',
        }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({
          idToken: 'token-for-alice',
          role: 'seller',
          name: 'Alice Wonder',
          phone: '+1234567890',
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.firebase_uid).toBe('firebase-new-123');
      expect(res.body.user.role).toBe('seller');
      expect(res.body.role).toBe('seller');
      expect(res.body.user.name).toBe('Alice Wonder');
    });


    // (a) New user attempts to self-assign 'admin' -> must be blocked with 403, no user row created
    it('should return 403 and NOT create a user when a new user sends role:admin', async () => {
      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'evil-new-uid',
          email: 'evil@example.com',
        }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ idToken: 'token-evil', role: 'admin', name: 'Evil Admin' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Role 'admin' cannot be self-assigned");

      // Verify no user row was created in the DB
      const { query: dbQuery } = require('./helpers/testDb');
      const check = await dbQuery('SELECT * FROM users WHERE firebase_uid = $1', ['evil-new-uid']);
      expect(check.rows.length).toBe(0);
    });

    // (b) Existing seller sends role:'admin' on verify -> 200 but role stays 'seller'
    it('should NOT change role of existing user even when role:admin is sent', async () => {
      await createTestUser({
        firebase_uid: 'existing-seller-uid',
        role: 'seller',
        name: 'Seller Sam',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'existing-seller-uid',
          email: 'seller@example.com',
        }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ idToken: 'token-seller', role: 'admin', name: 'Seller Sam' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('seller');
      expect(res.body.role).toBe('seller');

      // Double-check DB
      const { query: dbQuery } = require('./helpers/testDb');
      const dbCheck = await dbQuery('SELECT role FROM users WHERE firebase_uid = $1', ['existing-seller-uid']);
      expect(dbCheck.rows[0].role).toBe('seller');
    });

    // (c) New users with allowed roles (seller, customer, partner) get created successfully
    it('should create new users with allowed roles: seller, customer, partner', async () => {
      for (const allowedRole of ['seller', 'customer', 'partner']) {
        const uid = `new-uid-${allowedRole}`;
        jest.spyOn(admin, 'auth').mockReturnValue({
          verifyIdToken: jest.fn().mockResolvedValue({
            uid,
            email: `${allowedRole}@example.com`,
          }),
        });

        const res = await request(app)
          .post('/api/auth/verify')
          .send({ idToken: `token-${allowedRole}`, role: allowedRole, name: `Test ${allowedRole}` });

        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe(allowedRole);
        expect(res.body.role).toBe(allowedRole);
      }
    });

    // Fixed: existing user verify does NOT change role (was: asserted role changed customer->partner)
    it('should update existing user name but NOT change role when verified again', async () => {
      await createTestUser({
        firebase_uid: 'existing-fb-uid',
        role: 'customer',
        name: 'Old Name',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'existing-fb-uid',
          email: 'updated@example.com',
        }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({
          idToken: 'token-existing',
          name: 'New Name',
          role: 'partner',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('New Name');
      // Role must NOT have changed — stays 'customer'
      expect(res.body.user.role).toBe('customer');
      expect(res.body.role).toBe('customer');
    });

    // Existing admin keeps their role on verify (admin is not stripped)
    it('should keep admin role for existing admin user on verify', async () => {
      await createTestUser({
        firebase_uid: 'existing-admin-uid',
        role: 'admin',
        name: 'Admin Alice',
      });

      jest.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'existing-admin-uid',
          email: 'admin@example.com',
        }),
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ idToken: 'token-admin', name: 'Admin Alice' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('admin');
      expect(res.body.role).toBe('admin');
    });
  });
});
