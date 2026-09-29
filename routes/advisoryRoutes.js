const express = require('express');
const { getFeasibility } = require('../controllers/advisoryController');
const { authenticateToken } = require('../middleware/auth');
const { isDegradedMode, degradedResponse } = require('../middleware/degradedMode');

const router = express.Router();

// DEGRADED_MODE: pause AI advisory with a truthful, retryable 503.
// Never serve fake or guessed advice when the backend is shedding load.
router.use((req, res, next) => {
  if (isDegradedMode()) {
    return res
      .status(503)
      .set('Retry-After', '60')
      .json(degradedResponse('AI advisory is paused while the server is in degraded mode'));
  }
  next();
});

// Sellers (and admins) can pull feasibility signals for a location
router.get('/feasibility', authenticateToken, getFeasibility);

module.exports = router;
