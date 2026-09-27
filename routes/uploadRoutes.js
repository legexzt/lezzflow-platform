const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { uploadFile } = require('../controllers/uploadController');

const multipartHandler = (req, res, next) => {
  const single = upload.single('file');
  single(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) {
      // Fallback to checking 'image' or 'doc' field
      const altSingle = upload.single('image');
      return altSingle(req, res, (err2) => {
        if (err2) return next(err2);
        if (!req.file) {
          const docSingle = upload.single('doc');
          return docSingle(req, res, next);
        }
        next();
      });
    }
    next();
  });
};

router.post('/', multipartHandler, uploadFile);

module.exports = router;
