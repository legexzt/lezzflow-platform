const express = require('express');
const router = express.Router();
const { recordFunnelEvent } = require('../controllers/onboardingController');
const { authenticateToken } = require('../middleware/auth');

router.post('/funnel-event', authenticateToken, recordFunnelEvent);

module.exports = router;
