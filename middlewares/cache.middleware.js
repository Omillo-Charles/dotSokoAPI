import { cache } from '../config/redis.js';

/**
 * Cache middleware for GET requests
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 * @param {function} keyGenerator - Optional function to generate cache key
 * @returns {function} Express middleware
 */
export const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req) 
        : `cache:${req.originalUrl || req.url}`;

      // Try to get from cache
      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        console.log(`Cache HIT: ${cacheKey}`);
        return res.status(200).json(JSON.parse(cachedData));
      }

      console.log(`Cache MISS: ${cacheKey}`);

      // Store original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(cacheKey, data, ttl).catch(err => {
            console.error('Failed to cache response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Pattern to match (e.g., 'products:*')
 * @returns {Promise<void>}
 */
export const invalidateCache = async (pattern) => {
  try {
    await cache.delPattern(pattern);
    console.log(`Cache invalidated: ${pattern}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

/**
 * Invalidate specific cache key
 * @param {string} key - Cache key to invalidate
 * @returns {Promise<void>}
 */
export const invalidateCacheKey = async (key) => {
  try {
    await cache.del(key);
    console.log(`Cache key invalidated: ${key}`);
  } catch (error) {
    console.error('Cache key invalidation error:', error);
  }
};

export default cacheMiddleware;
