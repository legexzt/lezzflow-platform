const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { scanAi, scanBarcode } = require('../controllers/scanController');
const { createScanJob, getScanJobStatus } = require('../controllers/scanJobController');

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

// Async job queue (scaling cycle-3): accepts JSON or multipart image upload
const maybeUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return scanUpload(req, res, next);
  }
  next();
};
router.post('/jobs', maybeUpload, createScanJob);
router.get('/jobs/:id', getScanJobStatus);

module.exports = router;
