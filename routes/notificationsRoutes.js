const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  listNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notificationsController');

// Customer notification panel (auth required)
router.get('/', authenticateToken, listNotifications);
router.post('/read-all', authenticateToken, markAllRead);
router.patch('/:id/read', authenticateToken, markRead);

module.exports = router;
