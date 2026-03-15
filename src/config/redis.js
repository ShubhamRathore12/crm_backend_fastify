'use strict';

const Redis = require('ioredis');

const REDIS_RETRY_DELAYS = [100, 200, 400, 1000, 2000, 5000];

function createRedisConfig() {
  const clusterNodes = process.env.REDIS_CLUSTER_NODES;

  const commonOptions = {
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryStrategy(times) {
      if (times > REDIS_RETRY_DELAYS.length) {
        return null; // stop retrying
      }
      return REDIS_RETRY_DELAYS[times - 1];
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  };

  if (clusterNodes) {
    const nodes = clusterNodes.split(',').map((node) => {
      const [host, port] = node.trim().split(':');
      return { host, port: parseInt(port, 10) };
    });
    return { type: 'cluster', nodes, commonOptions };
  }

  return {
    type: 'standalone',
    options: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
      ...commonOptions,
    },
  };
}

/**
 * Create a Redis connection (standalone or cluster).
 * @param {string} name - Connection name for logging
 * @returns {Redis | Redis.Cluster}
 */
function createRedisConnection(name = 'default') {
  const config = createRedisConfig();

  let client;

  if (config.type === 'cluster') {
    client = new Redis.Cluster(config.nodes, {
      clusterRetryStrategy(times) {
        if (times > 6) return null;
        return REDIS_RETRY_DELAYS[Math.min(times - 1, REDIS_RETRY_DELAYS.length - 1)];
      },
      redisOptions: config.commonOptions,
      scaleReads: 'slave',
      enableReadyCheck: true,
    });
  } else {
    client = new Redis(config.options);
  }

  client.on('connect', () => {
    console.log(`[Redis:${name}] Connected`);
  });

  client.on('ready', () => {
    console.log(`[Redis:${name}] Ready`);
  });

  client.on('error', (err) => {
    console.error(`[Redis:${name}] Error:`, err.message);
  });

  client.on('close', () => {
    console.warn(`[Redis:${name}] Connection closed`);
  });

  client.on('reconnecting', (delay) => {
    console.log(`[Redis:${name}] Reconnecting in ${delay}ms`);
  });

  return client;
}

// Singleton connections
let _redisClient = null;
let _redisSub = null;
let _redisPub = null;

function getRedisClient() {
  if (process.env.REDIS_DISABLED === 'true') return null;
  if (!_redisClient) {
    try {
      _redisClient = createRedisConnection('main');
    } catch (err) {
      console.warn('[Redis] Failed to create connection:', err.message);
      return null;
    }
  }
  return _redisClient;
}

function getRedisSubscriber() {
  if (!_redisSub) {
    _redisSub = createRedisConnection('subscriber');
  }
  return _redisSub;
}

function getRedisPublisher() {
  if (!_redisPub) {
    _redisPub = createRedisConnection('publisher');
  }
  return _redisPub;
}

/**
 * Check Redis health.
 * @returns {Promise<boolean>}
 */
async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    if (!client) return false;
    const result = await client.ping();
    return result === 'PONG';
  } catch (err) {
    console.error('Redis health check failed:', err.message);
    return false;
  }
}

/**
 * Sliding window rate limit using Redis.
 * Returns true if the action is allowed, false if rate limited.
 *
 * @param {Redis} redis
 * @param {string} key - Rate limit key
 * @param {number} limit - Max requests in window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
async function slidingWindowRateLimit(redis, key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = results[2][1];
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = now + windowMs;

  return { allowed, remaining, resetAt, count };
}

/**
 * Increment a counter with optional expiry (for daily limits).
 * @param {Redis} redis
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>} new counter value
 */
async function incrementCounter(redis, key, ttlSeconds = 86400) {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttlSeconds, 'NX');
  const results = await pipeline.exec();
  return results[0][1];
}

/**
 * Get current counter value.
 * @param {Redis} redis
 * @param {string} key
 * @returns {Promise<number>}
 */
async function getCounter(redis, key) {
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

async function closeRedisConnections() {
  const closing = [];
  if (_redisClient) closing.push(_redisClient.quit().catch(() => {}));
  if (_redisSub) closing.push(_redisSub.quit().catch(() => {}));
  if (_redisPub) closing.push(_redisPub.quit().catch(() => {}));
  await Promise.all(closing);
  _redisClient = null;
  _redisSub = null;
  _redisPub = null;
}

module.exports = {
  createRedisConnection,
  getRedisClient,
  getRedisSubscriber,
  getRedisPublisher,
  checkRedisHealth,
  slidingWindowRateLimit,
  incrementCounter,
  getCounter,
  closeRedisConnections,
};
