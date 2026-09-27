const express = require('express');
const router = express.Router();
const { verifyAuth, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/verify', verifyAuth);
router.get('/me', authenticateToken, getMe);

module.exports = router;
