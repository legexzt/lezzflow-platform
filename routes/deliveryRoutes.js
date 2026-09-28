const express = require('express');
const router = express.Router();
const {
  listDeliveryRequests,
  updateDeliveryRequestStatus,
  sendSosAlert,
} = require('../controllers/deliveryController');
const { getPartnerConfig } = require('../controllers/configController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/requests', authenticateToken, requireRole(['partner', 'admin']), listDeliveryRequests);
router.patch('/requests/:id', authenticateToken, requireRole(['partner', 'admin']), updateDeliveryRequestStatus);
router.post('/sos', authenticateToken, requireRole(['partner', 'admin']), sendSosAlert);
router.get('/config', authenticateToken, requireRole(['partner', 'admin']), getPartnerConfig);

module.exports = router;
