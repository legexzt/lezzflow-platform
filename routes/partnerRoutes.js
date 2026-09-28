const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
} = require('../controllers/partnerController');
const {
  claimReferral,
  listMyReferrals,
} = require('../controllers/referralController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/me', authenticateToken, requireRole(['partner', 'admin']), getMyProfile);
router.patch('/me', authenticateToken, requireRole(['partner', 'admin']), updateMyProfile);
router.get('/referrals', authenticateToken, requireRole(['partner', 'admin']), listMyReferrals);
router.post('/referral/claim', authenticateToken, requireRole(['partner', 'admin']), claimReferral);

module.exports = router;
