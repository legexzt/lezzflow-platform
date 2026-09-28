const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 60,
  checkperiod: 0,
});

function get(key) {
  return cache.get(key);
}

function set(key, val, ttl) {
  if (ttl !== undefined) {
    return cache.set(key, val, ttl);
  }
  return cache.set(key, val);
}

function del(key) {
  return cache.del(key);
}

function clear() {
  return cache.flushAll();
}

function invalidatePrefix(prefix) {
  const keys = cache.keys();
  const matchingKeys = keys.filter((key) => key.startsWith(prefix));
  if (matchingKeys.length > 0) {
    return cache.del(matchingKeys);
  }
  return 0;
}

module.exports = {
  get,
  set,
  del,
  clear,
  invalidatePrefix,
};
