const cacheService = require('../services/cache');

const EXCLUDED_PREFIXES = [
  '/api/orders',
  '/api/delivery',
  '/api/partner',
  '/api/admin',
  '/api/kyc',
  '/api/auth',
  '/api/advisory',
  '/api/scan',
  '/api/upload',
  '/health',
];

function isPublicGetRoute(path) {
  const cleanPath = path.replace(/\/+$/, '') || '/';
  if (cleanPath === '/api/shops' || /^\/api\/shops\/[^/]+$/.test(cleanPath)) {
    return true;
  }
  if (cleanPath === '/api/products' || /^\/api\/products\/[^/]+$/.test(cleanPath)) {
    return true;
  }
  if (cleanPath === '/api/discover') {
    return true;
  }
  return false;
}

function cacheMiddleware(req, res, next) {
  if (req.method !== 'GET') {
    return next();
  }

  if (req.headers.authorization || (req.get && req.get('authorization'))) {
    return next();
  }

  const rawUrl = req.originalUrl || req.url || '';
  const urlPath = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

  if (EXCLUDED_PREFIXES.some((prefix) => urlPath === prefix || urlPath.startsWith(prefix + '/'))) {
    return next();
  }

  if (!isPublicGetRoute(urlPath)) {
    return next();
  }

  const cacheKey = 'GET:' + rawUrl;
  const cachedData = cacheService.get(cacheKey);

  if (cachedData !== undefined) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(cachedData);
  }

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      res.set('X-Cache', 'MISS');
      res.set('Cache-Control', 'public, max-age=60');
      cacheService.set(cacheKey, body);
    }
    return originalJson(body);
  };

  next();
}

function cacheInvalidator(req, res, next) {
  const method = req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const rawUrl = req.originalUrl || req.url || '';
    const urlPath = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';
    const isShopWrite = urlPath === '/api/shops' || urlPath.startsWith('/api/shops/');
    const isProductWrite = urlPath === '/api/products' || urlPath.startsWith('/api/products/');

    if (isShopWrite || isProductWrite) {
      let invalidated = false;
      const doInvalidate = () => {
        if (!invalidated && res.statusCode >= 200 && res.statusCode < 400) {
          invalidated = true;
          if (isShopWrite) {
            cacheService.invalidatePrefix('GET:/api/shops');
            cacheService.invalidatePrefix('GET:/api/discover');
          }
          if (isProductWrite) {
            cacheService.invalidatePrefix('GET:/api/products');
            cacheService.invalidatePrefix('GET:/api/discover');
          }
        }
      };

      const originalJson = res.json.bind(res);
      res.json = function (body) {
        doInvalidate();
        return originalJson(body);
      };

      res.on('finish', doInvalidate);
    }
  }
  next();
}

cacheMiddleware.cacheMiddleware = cacheMiddleware;
cacheMiddleware.cacheInvalidator = cacheInvalidator;

module.exports = cacheMiddleware;
