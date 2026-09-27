const express = require('express');
const router = express.Router();
const { getAdminStats, listAllShops, listAllOrders, listAllUsers, listAllProducts } = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/stats', authenticateToken, requireRole('admin'), getAdminStats);
router.get('/shops', authenticateToken, requireRole('admin'), listAllShops);
router.get('/orders', authenticateToken, requireRole('admin'), listAllOrders);
router.get('/users', authenticateToken, requireRole('admin'), listAllUsers);
router.get('/products', authenticateToken, requireRole('admin'), listAllProducts);

module.exports = router;
