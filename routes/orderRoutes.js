const express = require('express');
const router = express.Router();
const {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  assignDelivery,
  packScan,
  getOrderBill,
  confirmPack,
} = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.post('/', authenticateToken, requireRole('customer'), createOrder);
router.get('/', authenticateToken, listOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, requireRole(['seller', 'admin']), updateOrderStatus);
router.post('/:id/assign-delivery', authenticateToken, assignDelivery);
router.post('/:id/pack-scan', authenticateToken, requireRole('seller'), packScan);
router.get('/:id/bill', authenticateToken, requireRole(['seller', 'admin']), getOrderBill);
router.post('/:id/confirm-pack', authenticateToken, requireRole('seller'), confirmPack);

module.exports = router;

