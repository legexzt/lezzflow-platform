const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { scanAi, scanBarcode } = require('../controllers/scanController');

// Accept image upload with field name 'image' or 'file'
const scanUpload = (req, res, next) => {
  const single = upload.single('image');
  single(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) {
      // Try 'file' field if 'image' was empty
      const altSingle = upload.single('file');
      return altSingle(req, res, next);
    }
    next();
  });
};

router.post('/ai', scanUpload, scanAi);
router.post('/barcode', scanBarcode);

module.exports = router;
