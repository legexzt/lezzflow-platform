const express = require('express');
const router = express.Router();
const {
  submitKyc,
  getMyKyc,
  listPendingKyc,
  approveKyc,
  rejectKyc,
} = require('../controllers/kycController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// Partner KYC routes
router.post('/kyc', authenticateToken, requireRole(['partner', 'admin']), submitKyc);
router.post('/partner/kyc', authenticateToken, requireRole(['partner', 'admin']), submitKyc);
router.get('/kyc', authenticateToken, requireRole(['partner', 'admin']), getMyKyc);
router.get('/partner/kyc', authenticateToken, requireRole(['partner', 'admin']), getMyKyc);

// Admin KYC review routes
router.get('/admin/kyc/pending', authenticateToken, requireRole('admin'), listPendingKyc);
router.post('/admin/kyc/:id/approve', authenticateToken, requireRole('admin'), approveKyc);
router.post('/admin/kyc/:id/reject', authenticateToken, requireRole('admin'), rejectKyc);

module.exports = router;
