const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { createOffer, listOffers, updateOffer } = require('../controllers/offerController');

const router = express.Router({ mergeParams: true });

// Optional auth: when a token is present we populate req.user so the
// shop owner (or admin) sees all offers; anonymous callers only see
// active, in-window offers.
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) {
    return authenticateToken(req, res, next);
  }
  next();
};

// Seller/admin write + seller read-all; customers get active+in-window only.
// Paths are mounted at /api/shops and /api/v1/shops, so these become
// /api/v1/shops/:id/offers (and the /api legacy equivalent).
router.post('/:id/offers', authenticateToken, requireRole(['seller', 'admin']), createOffer);
router.patch(
  '/:id/offers/:offerId',
  authenticateToken,
  requireRole(['seller', 'admin']),
  updateOffer
);
// Public read: handler filters to active, in-window offers for non-owners.
router.get('/:id/offers', optionalAuth, listOffers);

module.exports = router;
