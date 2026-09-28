const express = require('express');
const router = express.Router();
const {
  listShops,
  createShop,
  getShopById,
  updateShop,
  deleteShop,
  goLiveShop,
} = require('../controllers/shopController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { cacheMiddleware } = require('../middleware/cache');
const { getTimings, putTimings } = require('../controllers/timingController');

// Optional auth for listShops so mine=true works for authenticated sellers
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) {
    return authenticateToken(req, res, next);
  }
  next();
};

router.get('/', optionalAuth, cacheMiddleware, listShops);
router.post('/', authenticateToken, requireRole('seller'), createShop);
router.post('/:id/go-live', authenticateToken, requireRole('seller'), goLiveShop);
// Per-day timings (seller-owned shop or admin). Registered before /:id so it isn't shadowed.
router.get('/:id/timings', authenticateToken, requireRole(['seller', 'admin']), getTimings);
router.put('/:id/timings', authenticateToken, requireRole(['seller', 'admin']), putTimings);
router.get('/:id', cacheMiddleware, getShopById);
router.put('/:id', authenticateToken, requireRole('seller'), updateShop);
router.delete('/:id', authenticateToken, requireRole('seller'), deleteShop);

module.exports = router;
