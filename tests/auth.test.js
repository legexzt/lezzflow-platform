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

    it('should update existing user when verified again', async () => {
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
      expect(res.body.user.role).toBe('partner');
    });
  });
});
