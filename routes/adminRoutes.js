const express = require('express');
const router = express.Router();
const { getAdminStats, listAllShops, listAllOrders, listAllUsers, listAllProducts } = require('../controllers/adminController');
const { listAudit, nudgeOrder, grantOpsViewer, revokeOpsViewer } = require('../controllers/auditController');
const { getFunnelDropoff } = require('../controllers/onboardingController');
const { listLocalities, getLocality } = require('../controllers/localityAnalyticsController');
const { listSosAlerts, updateSosAlert } = require('../controllers/deliveryController');
const { listAdminOffers } = require('../controllers/offerController');
const { listAdminReferrals } = require('../controllers/referralController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireAdminWrite } = require('../middleware/adminWrite');

router.get('/stats', authenticateToken, requireRole('admin'), getAdminStats);
router.get('/shops', authenticateToken, requireRole('admin'), listAllShops);
router.get('/orders', authenticateToken, requireRole('admin'), listAllOrders);
router.get('/users', authenticateToken, requireRole('admin'), listAllUsers);
router.get('/products', authenticateToken, requireRole('admin'), listAllProducts);
router.get('/offers', authenticateToken, requireRole('admin'), listAdminOffers);
router.get('/referrals', authenticateToken, requireRole('admin'), listAdminReferrals);

// Per-locality analytics (read-only; admin auth)
router.get('/analytics/localities', authenticateToken, requireRole('admin'), listLocalities);
router.get('/analytics/localities/:locality', authenticateToken, requireRole('admin'), getLocality);

// Onboarding funnel dropoff (read-only; admin auth)
router.get('/onboarding/funnel-dropoff', authenticateToken, requireRole('admin'), getFunnelDropoff);

// Partner SOS alerts (read-only; admin auth) — receiving end of the partner SOS FAB
router.get('/sos-alerts', authenticateToken, requireRole('admin'), listSosAlerts);
router.patch('/sos-alerts/:id', authenticateToken, requireRole('admin'), requireAdminWrite, updateSosAlert);

// Audit and operations viewer routes
router.get('/audit', authenticateToken, requireRole('admin'), listAudit);
router.post('/orders/:id/nudge', authenticateToken, requireRole('admin'), requireAdminWrite, nudgeOrder);
router.post('/ops-viewers', authenticateToken, requireRole('admin'), requireAdminWrite, grantOpsViewer);
router.delete('/ops-viewers/:uid', authenticateToken, requireRole('admin'), requireAdminWrite, revokeOpsViewer);

module.exports = router;

