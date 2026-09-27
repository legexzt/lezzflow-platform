const express = require('express');
const router = express.Router();
const {
  listProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/', listProducts);
router.post('/', authenticateToken, requireRole('seller'), createProduct);
router.get('/:id', getProductById);
router.put('/:id', authenticateToken, requireRole('seller'), updateProduct);
router.delete('/:id', authenticateToken, requireRole('seller'), deleteProduct);

module.exports = router;
