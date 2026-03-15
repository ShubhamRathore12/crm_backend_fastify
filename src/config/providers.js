'use strict';

/**
 * Email provider pool configuration.
 * Supports weighted round-robin rotation with per-provider rate limits.
 */

const PROVIDERS = [
  {
    name: 'ses',
    displayName: 'AWS SES',
    weight: 3,
    dailyLimit: parseInt(process.env.AWS_SES_DAILY_LIMIT || '50000', 10),
    ratePerSecond: parseInt(process.env.AWS_SES_RATE_PER_SECOND || '14', 10),
    ratePerMinute: parseInt(process.env.AWS_SES_RATE_PER_SECOND || '14', 10) * 60,
    enabled: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    config: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      fromEmail: process.env.AWS_SES_FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.AWS_SES_FROM_NAME || 'CRM',
    },
  },
  {
    name: 'sendgrid',
    displayName: 'SendGrid',
    weight: 4,
    dailyLimit: parseInt(process.env.SENDGRID_DAILY_LIMIT || '100000', 10),
    ratePerSecond: parseInt(process.env.SENDGRID_RATE_PER_SECOND || '100', 10),
    ratePerMinute: parseInt(process.env.SENDGRID_RATE_PER_SECOND || '100', 10) * 60,
    enabled: !!process.env.SENDGRID_API_KEY,
    config: {
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.SENDGRID_FROM_NAME || 'CRM',
    },
  },
  {
    name: 'mailgun',
    displayName: 'Mailgun',
    weight: 3,
    dailyLimit: parseInt(process.env.MAILGUN_DAILY_LIMIT || '50000', 10),
    ratePerSecond: parseInt(process.env.MAILGUN_RATE_PER_SECOND || '50', 10),
    ratePerMinute: parseInt(process.env.MAILGUN_RATE_PER_SECOND || '50', 10) * 60,
    enabled: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    config: {
      apiKey: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN,
      fromEmail: process.env.MAILGUN_FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.MAILGUN_FROM_NAME || 'CRM',
      region: process.env.MAILGUN_REGION || 'us',
    },
  },
];

/**
 * Domain-specific throttling (emails per hour).
 */
const DOMAIN_THROTTLES = {
  'gmail.com': parseInt(process.env.DOMAIN_THROTTLE_GMAIL || '100', 10),
  'googlemail.com': parseInt(process.env.DOMAIN_THROTTLE_GMAIL || '100', 10),
  'yahoo.com': parseInt(process.env.DOMAIN_THROTTLE_YAHOO || '80', 10),
  'yahoo.co.uk': parseInt(process.env.DOMAIN_THROTTLE_YAHOO || '80', 10),
  'hotmail.com': parseInt(process.env.DOMAIN_THROTTLE_HOTMAIL || '80', 10),
  'outlook.com': parseInt(process.env.DOMAIN_THROTTLE_OUTLOOK || '80', 10),
  'live.com': parseInt(process.env.DOMAIN_THROTTLE_OUTLOOK || '80', 10),
  'msn.com': parseInt(process.env.DOMAIN_THROTTLE_OUTLOOK || '80', 10),
  'aol.com': 60,
  'icloud.com': 60,
  'me.com': 60,
  default: parseInt(process.env.DOMAIN_THROTTLE_DEFAULT || '200', 10),
};

/**
 * Get throttle limit for an email address domain.
 * @param {string} email
 * @returns {number} emails per hour
 */
function getDomainThrottle(email) {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return DOMAIN_THROTTLES[domain] || DOMAIN_THROTTLES.default;
}

/**
 * Get enabled providers sorted by weight.
 * @returns {Array}
 */
function getEnabledProviders() {
  return PROVIDERS.filter((p) => p.enabled);
}

/**
 * Build weighted provider list for round-robin selection.
 * Returns an array where each provider appears weight times.
 * @returns {Array<string>} provider names in weighted order
 */
function buildWeightedProviderList() {
  const enabled = getEnabledProviders();
  const weighted = [];
  for (const provider of enabled) {
    for (let i = 0; i < provider.weight; i++) {
      weighted.push(provider.name);
    }
  }
  return weighted;
}

/**
 * Get provider config by name.
 * @param {string} name
 * @returns {Object|null}
 */
function getProviderByName(name) {
  return PROVIDERS.find((p) => p.name === name) || null;
}

/**
 * DKIM configuration.
 */
const DKIM_CONFIG = {
  enabled: !!(process.env.DKIM_DOMAIN && (process.env.DKIM_PRIVATE_KEY || process.env.DKIM_PRIVATE_KEY_PATH)),
  domainName: process.env.DKIM_DOMAIN || '',
  keySelector: process.env.DKIM_KEY_SELECTOR || 'mail',
  privateKey: process.env.DKIM_PRIVATE_KEY
    ? process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null,
  privateKeyPath: process.env.DKIM_PRIVATE_KEY_PATH || null,
  hashAlgo: 'sha256',
};

/**
 * Queue configuration defaults.
 */
const QUEUE_CONFIG = {
  emailConcurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '50', 10),
  campaignBatchSize: parseInt(process.env.CAMPAIGN_BATCH_SIZE || '500', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryDelayBase: parseInt(process.env.RETRY_DELAY_BASE || '60000', 10),
};

module.exports = {
  PROVIDERS,
  DOMAIN_THROTTLES,
  DKIM_CONFIG,
  QUEUE_CONFIG,
  getDomainThrottle,
  getEnabledProviders,
  buildWeightedProviderList,
  getProviderByName,
};
