'use strict';

const { LRUCache } = require('lru-cache');
const crypto = require('crypto');

/**
 * HTTP response cache middleware
 * Supports Redis and in-memory caching
 */
class CacheMiddleware {
  constructor(options = {}) {
    this.options = {
      ttl: parseInt(process.env.CACHE_TTL || '300000', 10), // 5 minutes default
      max: parseInt(process.env.CACHE_MAX_ITEMS || '1000', 10),
      useRedis: process.env.REDIS_CACHE_ENABLED === 'true',
      ...options,
    };

    // In-memory cache
    this.memoryCache = new LRUCache({
      max: this.options.max,
      ttl: this.options.ttl,
      allowStale: false,
      updateAgeOnGet: true,
    });

    // Redis cache client (if enabled)
    this.redisClient = null;
    if (this.options.useRedis) {
      const { createRedisConnection } = require('../config/redis');
      this.redisClient = createRedisConnection('cache');
    }

    this.metrics = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      redisHits: 0,
    };
  }

  /**
   * Generate cache key from request
   */
  generateKey(request) {
    const { method, url, query, body } = request;
    
    // Don't cache non-GET requests
    if (method !== 'GET') return null;

    // Create hash of request
    const data = `${method}:${url}:${JSON.stringify(query)}:${JSON.stringify(body)}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Get cached response
   */
  async get(key) {
    if (!key) return null;

    // Try memory cache first
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached) {
      this.metrics.hits++;
      this.metrics.memoryHits++;
      return memoryCached;
    }

    // Try Redis cache if enabled
    if (this.redisClient) {
      try {
        const redisCached = await this.redisClient.get(`cache:${key}`);
        if (redisCached) {
          const parsed = JSON.parse(redisCached);
          this.metrics.hits++;
          this.metrics.redisHits++;
          
          // Also store in memory cache for faster subsequent access
          this.memoryCache.set(key, parsed);
          return parsed;
        }
      } catch (error) {
        console.warn('[Cache] Redis get error:', error.message);
      }
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Set cached response
   */
  async set(key, data, ttl = null) {
    if (!key) return;

    const cacheTtl = ttl || this.options.ttl;
    
    // Store in memory cache
    this.memoryCache.set(key, data, { ttl: cacheTtl });

    // Store in Redis if enabled
    if (this.redisClient) {
      try {
        await this.redisClient.setex(
          `cache:${key}`,
          Math.floor(cacheTtl / 1000),
          JSON.stringify(data)
        );
      } catch (error) {
        console.warn('[Cache] Redis set error:', error.message);
      }
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern) {
    // Clear memory cache entries matching pattern
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear Redis cache if enabled
    if (this.redisClient) {
      try {
        // Note: This is inefficient for large keysets
        // In production, use Redis SCAN or maintain a key index
        const keys = await this.redisClient.keys(`cache:*${pattern}*`);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (error) {
        console.warn('[Cache] Redis invalidate error:', error.message);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    this.memoryCache.clear();
    
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys('cache:*');
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (error) {
        console.warn('[Cache] Redis clear error:', error.message);
      }
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total * 100).toFixed(2) : 0;
    
    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      memorySize: this.memoryCache.size,
      memoryMax: this.options.max,
    };
  }

  /**
   * Fastify middleware setup
   */
  async setup(fastify) {
    const cacheEnabled = process.env.CACHE_ENABLED !== 'false';
    
    if (!cacheEnabled) {
      fastify.log.info('Cache middleware disabled');
      return;
    }

    fastify.decorate('cache', this);

    // Add cache control header hook
    fastify.addHook('onSend', async (request, reply, payload) => {
      if (request.method === 'GET' && reply.statusCode === 200) {
        const cacheControl = request.routeOptions?.config?.cacheControl;
        if (cacheControl) {
          reply.header('Cache-Control', cacheControl);
        } else {
          // Default cache control
          reply.header('Cache-Control', 'public, max-age=60');
        }
      }
    });

    // Cache middleware for specific routes
    fastify.addHook('preHandler', async (request, reply) => {
      const cacheConfig = request.routeOptions?.config?.cache;
      
      if (cacheConfig && request.method === 'GET') {
        const key = this.generateKey(request);
        const cached = await this.get(key);
        
        if (cached) {
          reply.header('X-Cache', 'HIT');
          reply.header('X-Cache-Source', cached.source);
          reply.send(cached.data);
          return reply; // Stop further processing
        }
        
        reply.header('X-Cache', 'MISS');
      }
    });

    // Store response in cache
    fastify.addHook('onSend', async (request, reply, payload) => {
      const cacheConfig = request.routeOptions?.config?.cache;
      
      if (cacheConfig && request.method === 'GET' && reply.statusCode === 200) {
        const key = this.generateKey(request);
        if (key) {
          const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
          await this.set(key, {
            data,
            source: this.redisClient ? 'redis' : 'memory',
            timestamp: Date.now(),
          }, cacheConfig.ttl);
        }
      }
    });

    fastify.log.info('Cache middleware enabled');
  }
}

// Singleton instance
const cacheMiddleware = new CacheMiddleware();
module.exports = cacheMiddleware;