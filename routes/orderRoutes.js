const express = require('express');
const router = express.Router();
const {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  assignDelivery,
} = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.post('/', authenticateToken, requireRole('customer'), createOrder);
router.get('/', authenticateToken, listOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, requireRole(['seller', 'admin']), updateOrderStatus);
router.post('/:id/assign-delivery', authenticateToken, assignDelivery);

module.exports = router;
