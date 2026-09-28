const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
} = require('../controllers/partnerController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/me', authenticateToken, requireRole(['partner', 'admin']), getMyProfile);
router.patch('/me', authenticateToken, requireRole(['partner', 'admin']), updateMyProfile);

module.exports = router;
