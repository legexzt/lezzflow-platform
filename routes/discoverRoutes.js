const express = require('express');
const router = express.Router();
const { discoverShops } = require('../controllers/discoverController');

router.get('/', discoverShops);

module.exports = router;
