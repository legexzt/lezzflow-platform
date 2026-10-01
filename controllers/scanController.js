const { scanProductImage, scanShoppingList } = require('../services/bedrockService');
const { lookupBarcode } = require('../services/barcodeService');

/**
 * POST /api/scan/ai
 * Accepts multipart image upload, uses AWS Bedrock Converse API to extract { name, category, description }
 */
async function scanAi(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required in multipart field (image or file)' });
    }

    const { buffer, mimetype } = req.file;

    try {
      const productInfo = await scanProductImage(buffer, mimetype);
      return res.json(productInfo);
    } catch (modelError) {
      console.error('AWS Bedrock scanning error:', modelError);
      return res.status(502).json({
        error: 'AI product scanner failed to process the image',
        details: modelError.message,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/scan/barcode
 * Body: { code }
 * Looks up product in OpenFoodFacts v2 API
 */
async function scanBarcode(req, res, next) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Barcode code is required' });
    }

    const result = await lookupBarcode(code);
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/scan/list
 * Accepts multipart image upload of a handwritten/printed shopping list,
 * returns extracted items as { items: [{ item, qty }] }
 */
async function scanList(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required in multipart field (image or file)' });
    }

    try {
      const items = await scanShoppingList(req.file.buffer, req.file.mimetype);
      return res.json({ items });
    } catch (modelError) {
      console.error('AI list scan error:', modelError);
      return res.status(502).json({
        error: 'AI list scan failed',
        details: modelError.message,
      });
    }
  } catch (error) {
    next(error);
  }
}

module.exports = {
  scanAi,
  scanBarcode,
  scanList,
};
