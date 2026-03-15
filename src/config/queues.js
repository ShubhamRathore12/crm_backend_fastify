'use strict';

/**
 * BullMQ queue names and configuration.
 */

const QUEUE_NAMES = {
  EMAIL: 'email:queue',
  CAMPAIGN: 'campaign:queue',
  BOUNCE: 'bounce:queue',
  ANALYTICS: 'analytics:queue',
};

const QUEUE_DEFAULTS = {
  removeOnComplete: { count: 1000, age: 24 * 3600 }, // keep last 1000 completed jobs, max 24h
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // keep failed jobs for 7 days
};

/**
 * Retry configuration with exponential backoff.
 * Delays: 1min, 5min, 15min
 */
const EMAIL_JOB_OPTIONS = {
  attempts: parseInt(process.env.MAX_RETRIES || '3', 10) + 1, // +1 for initial attempt
  backoff: {
    type: 'custom',
  },
  removeOnComplete: QUEUE_DEFAULTS.removeOnComplete,
  removeOnFail: QUEUE_DEFAULTS.removeOnFail,
  priority: 10,
};

/**
 * Custom backoff strategy: 1min, 5min, 15min.
 * @param {number} attemptsMade - Number of attempts made (1-indexed)
 * @returns {number} delay in milliseconds
 */
function customBackoffStrategy(attemptsMade) {
  const delays = [
    60 * 1000,       // 1 minute
    5 * 60 * 1000,   // 5 minutes
    15 * 60 * 1000,  // 15 minutes
    30 * 60 * 1000,  // 30 minutes (extra safety)
  ];
  return delays[Math.min(attemptsMade - 1, delays.length - 1)];
}

const CAMPAIGN_JOB_OPTIONS = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 30000,
  },
  removeOnComplete: { count: 500, age: 7 * 24 * 3600 },
  removeOnFail: { count: 200, age: 14 * 24 * 3600 },
  priority: 5,
};

const BOUNCE_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'fixed',
    delay: 5000,
  },
  removeOnComplete: { count: 2000 },
  removeOnFail: { count: 1000 },
};

/**
 * BullMQ worker options.
 */
const EMAIL_WORKER_OPTIONS = {
  concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '50', 10),
  limiter: {
    max: 500,
    duration: 1000, // 500 emails per second max across all workers
  },
};

const CAMPAIGN_WORKER_OPTIONS = {
  concurrency: 5,
};

const BOUNCE_WORKER_OPTIONS = {
  concurrency: 10,
};

/**
 * Flow producer configuration for campaign → email batch flows.
 */
const FLOW_OPTIONS = {
  queuesOptions: {
    [QUEUE_NAMES.EMAIL]: {
      defaultJobOptions: EMAIL_JOB_OPTIONS,
    },
    [QUEUE_NAMES.CAMPAIGN]: {
      defaultJobOptions: CAMPAIGN_JOB_OPTIONS,
    },
  },
};

module.exports = {
  QUEUE_NAMES,
  QUEUE_DEFAULTS,
  EMAIL_JOB_OPTIONS,
  CAMPAIGN_JOB_OPTIONS,
  BOUNCE_JOB_OPTIONS,
  EMAIL_WORKER_OPTIONS,
  CAMPAIGN_WORKER_OPTIONS,
  BOUNCE_WORKER_OPTIONS,
  FLOW_OPTIONS,
  customBackoffStrategy,
};
