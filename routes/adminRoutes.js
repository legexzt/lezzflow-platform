const express = require('express');
const router = express.Router();
const { getAdminStats, listAllShops, listAllOrders, listAllUsers, listAllProducts } = require('../controllers/adminController');
const { listAudit, nudgeOrder, grantOpsViewer, revokeOpsViewer } = require('../controllers/auditController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireAdminWrite } = require('../middleware/adminWrite');

router.get('/stats', authenticateToken, requireRole('admin'), getAdminStats);
router.get('/shops', authenticateToken, requireRole('admin'), listAllShops);
router.get('/orders', authenticateToken, requireRole('admin'), listAllOrders);
router.get('/users', authenticateToken, requireRole('admin'), listAllUsers);
router.get('/products', authenticateToken, requireRole('admin'), listAllProducts);

// Audit and operations viewer routes
router.get('/audit', authenticateToken, requireRole('admin'), listAudit);
router.post('/orders/:id/nudge', authenticateToken, requireRole('admin'), requireAdminWrite, nudgeOrder);
router.post('/ops-viewers', authenticateToken, requireRole('admin'), requireAdminWrite, grantOpsViewer);
router.delete('/ops-viewers/:uid', authenticateToken, requireRole('admin'), requireAdminWrite, revokeOpsViewer);

module.exports = router;
