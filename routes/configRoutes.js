const express = require('express');
const router = express.Router();
const { getPublicConfig, updateAdminConfig } = require('../controllers/configController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireAdminWrite } = require('../middleware/adminWrite');

// Public: GET /api/config, /api/v1/config
router.get('/config', getPublicConfig);

// Admin write: PATCH /api/admin/config, /api/v1/admin/config
router.patch(
  '/admin/config',
  authenticateToken,
  requireRole('admin'),
  requireAdminWrite,
  updateAdminConfig,
);

module.exports = router;
