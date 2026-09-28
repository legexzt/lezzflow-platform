const express = require('express');
const router = express.Router();
const {
  listProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  compareProducts,
} = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { cacheMiddleware } = require('../middleware/cache');

router.get('/', cacheMiddleware, listProducts);
router.post('/', authenticateToken, requireRole('seller'), createProduct);
// NOTE: /compare must be registered before /:id so "compare" isn't parsed as an id.
router.get('/compare', compareProducts);
router.get('/:id', cacheMiddleware, getProductById);
router.put('/:id', authenticateToken, requireRole('seller'), updateProduct);
router.delete('/:id', authenticateToken, requireRole('seller'), deleteProduct);

module.exports = router;
