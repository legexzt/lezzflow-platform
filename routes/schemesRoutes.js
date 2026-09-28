const express = require('express');
const router = express.Router();
const { listSchemes, getScheme } = require('../controllers/schemesController');

// Public: Sarkari Yojanaen for the Mart customer app
router.get('/', listSchemes);
router.get('/:id', getScheme);

module.exports = router;
