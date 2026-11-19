// config/redis.js
// Production-grade resilient Redis Client & In-Memory Fallback
// If REDIS_URL or Redis server is not reachable, it gracefully falls back
// to a high-speed In-Memory LRU cache without crashing the application.

let redis = null;
let isRedisConnected = false;

// Fallback in-memory map when Redis server is not running locally
const memoryCache = new Map();

if (process.env.REDIS_URL || process.env.ENABLE_REDIS === 'true') {
  try {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: true
    });

    redis.connect().then(() => {
      isRedisConnected = true;
      console.log('⚡ Redis Connected successfully for high-speed caching.');
    }).catch((err) => {
      isRedisConnected = false;
      console.log('ℹ️ Redis not reachable, using fast In-Memory cache fallback.');
    });

    redis.on('error', () => {
      isRedisConnected = false;
    });

    redis.on('connect', () => {
      isRedisConnected = true;
    });
  } catch (err) {
    isRedisConnected = false;
  }
} else {
  // By default in dev without Redis daemon, use ultra-fast In-Memory cache
  console.log('⚡ High-speed Cache initialized (In-Memory Engine active).');
}

/**
 * Get cached data
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getCache(key) {
  try {
    if (isRedisConnected && redis) {
      return await redis.get(key);
    }
    const item = memoryCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return item.value;
  } catch (err) {
    return null;
  }
}

/**
 * Set cached data with TTL (in seconds)
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
async function setCache(key, value, ttlSeconds = 60) {
  try {
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    if (isRedisConnected && redis) {
      await redis.set(key, strVal, 'EX', ttlSeconds);
      return;
    }
    // In-memory fallback
    memoryCache.set(key, {
      value: strVal,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });

    // Prevent memory leaks: cap size to 10,000 keys
    if (memoryCache.size > 10000) {
      const oldestKey = memoryCache.keys().next().value;
      memoryCache.delete(oldestKey);
    }
  } catch (err) {
    // Fail silently without blocking requests
  }
}

/**
 * Invalidate cache by key or prefix
 * @param {string} prefix
 */
async function clearCache(prefix) {
  try {
    if (isRedisConnected && redis) {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
    for (const k of memoryCache.keys()) {
      if (k.startsWith(prefix)) {
        memoryCache.delete(k);
      }
    }
  } catch (err) {
    // Fail silently
  }
}

/**
 * Express middleware for automatic route response caching
 * @param {number} ttlSeconds
 */
function cacheMiddleware(ttlSeconds = 30) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Cache key based on original URL & query params
    const cacheKey = `cache:${req.originalUrl || req.url}`;

    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache-Lookup', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cached);
      }

      // If MISS, hijack res.send to save response before sending
      res.setHeader('X-Cache-Lookup', 'MISS');
      const originalSend = res.send.bind(res);

      res.send = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCache(cacheKey, body, ttlSeconds).catch(() => {});
        }
        return originalSend(body);
      };

      next();
    } catch (err) {
      next();
    }
  };
}

module.exports = {
  redis,
  getCache,
  setCache,
  clearCache,
  cacheMiddleware
};
