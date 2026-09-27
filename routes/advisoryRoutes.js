const express = require('express');
const { getFeasibility } = require('../controllers/advisoryController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Sellers (and admins) can pull feasibility signals for a location
router.get('/feasibility', authenticateToken, getFeasibility);

module.exports = router;
