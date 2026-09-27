const express = require('express');
const router = express.Router();
const {
  listShops,
  createShop,
  getShopById,
  updateShop,
  deleteShop,
} = require('../controllers/shopController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// Optional auth for listShops so mine=true works for authenticated sellers
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) {
    return authenticateToken(req, res, next);
  }
  next();
};

router.get('/', optionalAuth, listShops);
router.post('/', authenticateToken, requireRole('seller'), createShop);
router.get('/:id', getShopById);
router.put('/:id', authenticateToken, requireRole('seller'), updateShop);
router.delete('/:id', authenticateToken, requireRole('seller'), deleteShop);

module.exports = router;
