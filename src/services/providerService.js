'use strict';

const { getRedisClient, slidingWindowRateLimit, incrementCounter, getCounter } = require('../config/redis');
const {
  PROVIDERS,
  getEnabledProviders,
  buildWeightedProviderList,
  getProviderByName,
  getDomainThrottle,
} = require('../config/providers');

const PROVIDER_HEALTH_TTL = 60; // seconds to cache health status
const PROVIDER_COOLDOWN_TTL = 300; // 5 minutes cooldown after hard failure

/**
 * Redis key helpers.
 */
const keys = {
  providerDailyCount: (name) => `provider:daily:${name}:${todayKey()}`,
  providerRateWindow: (name) => `provider:rate:${name}`,
  providerHealth: (name) => `provider:health:${name}`,
  providerCooldown: (name) => `provider:cooldown:${name}`,
  domainHourly: (domain) => `domain:hourly:${domain}:${hourKey()}`,
  weightedIndex: () => 'provider:weighted:index',
};

function todayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function hourKey() {
  const now = new Date();
  return `${now.toISOString().split('T')[0]}-${now.getUTCHours()}`;
}

/**
 * Check if a provider is in cooldown (after hard failure).
 * @param {string} providerName
 * @returns {Promise<boolean>}
 */
async function isProviderInCooldown(providerName) {
  const redis = getRedisClient();
  const val = await redis.get(keys.providerCooldown(providerName));
  return val !== null;
}

/**
 * Put a provider in cooldown.
 * @param {string} providerName
 * @param {number} ttlSeconds
 */
async function setProviderCooldown(providerName, ttlSeconds = PROVIDER_COOLDOWN_TTL) {
  const redis = getRedisClient();
  await redis.setex(keys.providerCooldown(providerName), ttlSeconds, '1');
  console.warn(`[ProviderService] Provider ${providerName} is in cooldown for ${ttlSeconds}s`);
}

/**
 * Clear provider cooldown.
 * @param {string} providerName
 */
async function clearProviderCooldown(providerName) {
  const redis = getRedisClient();
  await redis.del(keys.providerCooldown(providerName));
}

/**
 * Check if provider has exceeded its daily limit.
 * @param {string} providerName
 * @returns {Promise<{exceeded: boolean, current: number, limit: number}>}
 */
async function checkDailyLimit(providerName) {
  const provider = getProviderByName(providerName);
  if (!provider) return { exceeded: true, current: 0, limit: 0 };

  const redis = getRedisClient();
  const current = await getCounter(redis, keys.providerDailyCount(providerName));
  const exceeded = current >= provider.dailyLimit;

  return { exceeded, current, limit: provider.dailyLimit };
}

/**
 * Check per-second rate limit for a provider.
 * @param {string} providerName
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 */
async function checkProviderRateLimit(providerName) {
  const provider = getProviderByName(providerName);
  if (!provider) return { allowed: false, remaining: 0 };

  const redis = getRedisClient();
  const result = await slidingWindowRateLimit(
    redis,
    keys.providerRateWindow(providerName),
    provider.ratePerSecond,
    1000 // 1 second window
  );

  return result;
}

/**
 * Check per-domain hourly throttle.
 * @param {string} email
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 */
async function checkDomainThrottle(email) {
  const domain = email.split('@')[1]?.toLowerCase() || 'unknown';
  const limit = getDomainThrottle(email);
  const redis = getRedisClient();

  const result = await slidingWindowRateLimit(
    redis,
    keys.domainHourly(domain),
    limit,
    3600 * 1000 // 1 hour window
  );

  return result;
}

/**
 * Increment provider daily counter.
 * @param {string} providerName
 * @returns {Promise<number>}
 */
async function incrementProviderCount(providerName) {
  const redis = getRedisClient();
  return incrementCounter(redis, keys.providerDailyCount(providerName), 86400);
}

/**
 * Get all provider stats for today.
 * @returns {Promise<Array>}
 */
async function getProviderStats() {
  const redis = getRedisClient();
  const stats = [];

  for (const provider of PROVIDERS) {
    const dailyKey = keys.providerDailyCount(provider.name);
    const cooldownKey = keys.providerCooldown(provider.name);

    const [dailyCount, inCooldown] = await Promise.all([
      redis.get(dailyKey).then((v) => (v ? parseInt(v, 10) : 0)),
      redis.get(cooldownKey).then((v) => v !== null),
    ]);

    stats.push({
      name: provider.name,
      displayName: provider.displayName,
      enabled: provider.enabled,
      dailyCount,
      dailyLimit: provider.dailyLimit,
      dailyRemaining: Math.max(0, provider.dailyLimit - dailyCount),
      dailyUsagePercent: ((dailyCount / provider.dailyLimit) * 100).toFixed(2),
      ratePerSecond: provider.ratePerSecond,
      inCooldown,
      weight: provider.weight,
    });
  }

  return stats;
}

/**
 * Select the best available provider using weighted round-robin.
 * Skips providers that are rate-limited, in cooldown, or over daily limit.
 *
 * @returns {Promise<string|null>} provider name or null if all unavailable
 */
async function selectProvider() {
  const redis = getRedisClient();
  const weighted = buildWeightedProviderList();

  if (weighted.length === 0) {
    throw new Error('No email providers configured or enabled');
  }

  // Get current weighted index (atomic increment)
  const index = await redis.incr(keys.weightedIndex());
  const totalWeight = weighted.length;

  // Try each provider starting from current index, cycling through
  for (let attempt = 0; attempt < totalWeight; attempt++) {
    const providerName = weighted[(index + attempt) % totalWeight];

    // Check cooldown
    if (await isProviderInCooldown(providerName)) continue;

    // Check daily limit
    const daily = await checkDailyLimit(providerName);
    if (daily.exceeded) continue;

    // Check per-second rate limit
    const rate = await checkProviderRateLimit(providerName);
    if (!rate.allowed) continue;

    return providerName;
  }

  // All providers are rate-limited, return least-loaded one as fallback
  console.warn('[ProviderService] All providers rate-limited, using fallback selection');
  const enabled = getEnabledProviders();
  if (enabled.length === 0) return null;

  // Find provider with most remaining daily quota
  let best = null;
  let bestRemaining = -1;

  for (const provider of enabled) {
    const daily = await checkDailyLimit(provider.name);
    const inCooldown = await isProviderInCooldown(provider.name);
    if (!inCooldown && !daily.exceeded) {
      const remaining = daily.limit - daily.current;
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        best = provider.name;
      }
    }
  }

  return best;
}

/**
 * Mark a provider send as successful (increment counters).
 * @param {string} providerName
 */
async function recordProviderSuccess(providerName) {
  await incrementProviderCount(providerName);
}

/**
 * Record a provider failure — may trigger cooldown.
 * @param {string} providerName
 * @param {Error} error
 * @param {boolean} isHardFailure - If true, put provider in cooldown
 */
async function recordProviderFailure(providerName, error, isHardFailure = false) {
  const redis = getRedisClient();
  const failKey = `provider:failures:${providerName}:${hourKey()}`;

  await redis.incr(failKey);
  await redis.expire(failKey, 3600);

  const failCount = await getCounter(redis, failKey);
  const FAILURE_THRESHOLD = 10;

  if (isHardFailure || failCount >= FAILURE_THRESHOLD) {
    const cooldownDuration = isHardFailure ? 600 : 300; // 10 or 5 minutes
    await setProviderCooldown(providerName, cooldownDuration);
  }

  console.error(`[ProviderService] ${providerName} failure #${failCount}: ${error.message}`);
}

/**
 * Get provider health summary.
 * @returns {Promise<Object>}
 */
async function getProviderHealth() {
  const stats = await getProviderStats();
  const healthy = stats.filter((s) => s.enabled && !s.inCooldown && s.dailyRemaining > 0);
  const degraded = stats.filter((s) => s.enabled && (s.inCooldown || s.dailyUsagePercent > 90));
  const down = stats.filter((s) => !s.enabled);

  return {
    status: healthy.length > 0 ? 'ok' : 'degraded',
    totalCapacity: stats.reduce((sum, s) => sum + s.dailyLimit, 0),
    remainingCapacity: stats.reduce((sum, s) => sum + s.dailyRemaining, 0),
    providers: { healthy, degraded, down },
    stats,
  };
}

module.exports = {
  selectProvider,
  checkDomainThrottle,
  checkDailyLimit,
  checkProviderRateLimit,
  incrementProviderCount,
  recordProviderSuccess,
  recordProviderFailure,
  setProviderCooldown,
  clearProviderCooldown,
  isProviderInCooldown,
  getProviderStats,
  getProviderHealth,
};
