import { Redis } from '@upstash/redis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from './env.js';

// Initialize Upstash Redis client
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

// Cache utility functions
export const cache = {
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  async get(key) {
    try {
      const value = await redis.get(key);
      return value;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  /**
   * Set value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = 300) {
    try {
      if (ttl) {
        await redis.setex(key, ttl, JSON.stringify(value));
      } else {
        await redis.set(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  /**
   * Delete multiple keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'products:*')
   * @returns {Promise<boolean>} - Success status
   */
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Redis DEL PATTERN error:', error);
      return false;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Exists status
   */
  async exists(key) {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  },

  /**
   * Increment a counter
   * @param {string} key - Cache key
   * @returns {Promise<number>} - New value
   */
  async incr(key) {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  },

  /**
   * Set expiration on a key
   * @param {string} key - Cache key
   * @param {number} seconds - Seconds until expiration
   * @returns {Promise<boolean>} - Success status
   */
  async expire(key, seconds) {
    try {
      await redis.expire(key, seconds);
      return true;
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      return false;
    }
  }
};

export default redis;
