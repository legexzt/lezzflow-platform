const express = require('express');
const router = express.Router();
const { discoverShops } = require('../controllers/discoverController');
const { cacheMiddleware } = require('../middleware/cache');

router.get('/', cacheMiddleware, discoverShops);

module.exports = router;
