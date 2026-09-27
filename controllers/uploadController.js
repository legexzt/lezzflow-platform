const { storageService } = require('../services/storageService');

/**
 * POST /api/upload
 * Handles multipart file uploads (KYC docs, product images)
 * Saves to ./uploads locally (or S3 if configured via env), returns file URL
 */
async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadResult = await storageService.upload(req.file);

    return res.status(201).json({
      url: uploadResult.url,
      filename: uploadResult.filename,
      storage: uploadResult.storage,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadFile,
};
