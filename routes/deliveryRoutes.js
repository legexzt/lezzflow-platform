const express = require('express');
const router = express.Router();
const {
  listDeliveryRequests,
  updateDeliveryRequestStatus,
} = require('../controllers/deliveryController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/requests', authenticateToken, requireRole(['partner', 'admin']), listDeliveryRequests);
router.patch('/requests/:id', authenticateToken, requireRole(['partner', 'admin']), updateDeliveryRequestStatus);

module.exports = router;
