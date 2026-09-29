const cacheService = require('../services/cache');

/**
 * Location-smart discovery cache key (scaling cycle-3).
 *
 * Rounds lat/lng to 3 decimals (~100 m grid) and groups any radius param
 * into the nearest 5 km band, so nearby coordinates share a cache key while
 * distant ones do not. Other query params are kept sorted for stability.
 */
function round3(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function band5km(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return String(Math.round(n / 5) * 5);
}

function buildDiscoveryCacheKey(rawUrl) {
  const qIndex = rawUrl.indexOf('?');
  const pathPart = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : rawUrl.slice(qIndex + 1);
  const params = new URLSearchParams(queryPart);
  const parts = [];
  if (params.has('lat')) parts.push(`lat=${round3(params.get('lat'))}`);
  if (params.has('lng')) parts.push(`lng=${round3(params.get('lng'))}`);
  if (params.has('radius')) parts.push(`radius=${band5km(params.get('radius'))}`);
  for (const key of [...params.keys()].sort()) {
    if (key === 'lat' || key === 'lng' || key === 'radius') continue;
    parts.push(`${key}=${params.get(key)}`);
  }
  return `GET:${pathPart}${parts.length ? '?' + parts.join('&') : ''}`;
}

// Long-lived stale copy of discovery responses for DEGRADED_MODE serving.
const STALE_TTL_SECONDS = 3600;
function staleKey(cacheKey) {
  return `STALE:${cacheKey}`;
}

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

  const isDiscover = urlPath === '/api/discover' || urlPath.startsWith('/api/discover/');
  const cacheKey = isDiscover ? buildDiscoveryCacheKey(rawUrl) : 'GET:' + rawUrl;
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
      if (isDiscover) {
        // Keep a long-lived stale copy so DEGRADED_MODE can serve discovery
        // even after the 60s fresh TTL expires.
        cacheService.set(staleKey(cacheKey), body, STALE_TTL_SECONDS);
      }
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
cacheMiddleware.buildDiscoveryCacheKey = buildDiscoveryCacheKey;
cacheMiddleware.staleKey = staleKey;

module.exports = cacheMiddleware;
