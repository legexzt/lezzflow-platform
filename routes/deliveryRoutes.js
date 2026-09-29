const express = require('express');
const router = express.Router();
const {
  listDeliveryRequests,
  updateDeliveryRequestStatus,
  sendSosAlert,
  addTripNote,
  getTripTimeline,
  openDispute,
  listDisputes,
  resolveDispute,
  getReliability,
  getRecap,
} = require('../controllers/deliveryController');
const { getPartnerConfig } = require('../controllers/configController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/requests', authenticateToken, requireRole(['partner', 'admin']), listDeliveryRequests);
router.patch('/requests/:id', authenticateToken, requireRole(['partner', 'admin']), updateDeliveryRequestStatus);
router.post('/sos', authenticateToken, requireRole(['partner', 'admin']), sendSosAlert);
router.get('/config', authenticateToken, requireRole(['partner', 'admin']), getPartnerConfig);

// Partner cycle-3: trip chips, timeline, disputes, reliability, recap
router.post('/requests/:id/trip-notes', authenticateToken, requireRole(['partner', 'admin']), addTripNote);
router.get('/requests/:id/timeline', authenticateToken, requireRole(['partner', 'admin']), getTripTimeline);
router.post('/disputes', authenticateToken, requireRole(['partner']), openDispute);
router.get('/disputes', authenticateToken, requireRole(['partner', 'admin']), listDisputes);
router.patch('/disputes/:id', authenticateToken, requireRole(['admin']), resolveDispute);
router.get('/reliability', authenticateToken, requireRole(['partner', 'admin']), getReliability);
router.get('/recap', authenticateToken, requireRole(['partner']), getRecap);

module.exports = router;
