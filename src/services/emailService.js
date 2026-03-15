'use strict';

const nodemailer = require('nodemailer');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const sgMail = require('@sendgrid/mail');
const Mailgun = require('mailgun.js');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pRetry = require('p-retry');

const { supabase } = require('../config/supabase');
const { getRedisClient } = require('../config/redis');
const { DKIM_CONFIG, getProviderByName } = require('../config/providers');
const {
  selectProvider,
  checkDomainThrottle,
  recordProviderSuccess,
  recordProviderFailure,
} = require('./providerService');

// Provider client singletons
let _sesClient = null;
let _mailgunClient = null;
let _dkimPrivateKey = null;

/**
 * Lazy-load DKIM private key from file or env.
 * @returns {string|null}
 */
function getDkimPrivateKey() {
  if (_dkimPrivateKey) return _dkimPrivateKey;

  if (DKIM_CONFIG.privateKey) {
    _dkimPrivateKey = DKIM_CONFIG.privateKey;
    return _dkimPrivateKey;
  }

  if (DKIM_CONFIG.privateKeyPath && fs.existsSync(DKIM_CONFIG.privateKeyPath)) {
    _dkimPrivateKey = fs.readFileSync(DKIM_CONFIG.privateKeyPath, 'utf8').trim();
    return _dkimPrivateKey;
  }

  return null;
}

/**
 * Get SES client (singleton).
 */
function getSESClient() {
  if (!_sesClient) {
    const provider = getProviderByName('ses');
    _sesClient = new SESClient({
      region: provider.config.region,
      credentials: {
        accessKeyId: provider.config.accessKeyId,
        secretAccessKey: provider.config.secretAccessKey,
      },
    });
  }
  return _sesClient;
}

/**
 * Get Mailgun client (singleton).
 */
function getMailgunClient() {
  if (!_mailgunClient) {
    const mailgun = new Mailgun(FormData);
    const provider = getProviderByName('mailgun');
    _mailgunClient = mailgun.client({
      username: 'api',
      key: provider.config.apiKey,
      url: provider.config.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net',
    });
  }
  return _mailgunClient;
}

/**
 * Initialize SendGrid.
 */
function initSendGrid() {
  const provider = getProviderByName('sendgrid');
  if (provider?.config?.apiKey) {
    sgMail.setApiKey(provider.config.apiKey);
  }
}

/**
 * Build DKIM options for nodemailer.
 * @returns {Object|null}
 */
function buildDkimOptions() {
  if (!DKIM_CONFIG.enabled) return null;
  const privateKey = getDkimPrivateKey();
  if (!privateKey) return null;

  return {
    domainName: DKIM_CONFIG.domainName,
    keySelector: DKIM_CONFIG.keySelector,
    privateKey,
    hashAlgo: DKIM_CONFIG.hashAlgo || 'sha256',
    headerFieldNames: 'from:to:subject:date:message-id',
  };
}

/**
 * Add unsubscribe and tracking links to email HTML.
 * @param {string} html
 * @param {string} emailLogId
 * @param {string} contactEmail
 * @param {string} campaignId
 * @returns {string}
 */
function instrumentEmailHtml(html, emailLogId, contactEmail, campaignId) {
  const baseUrl = process.env.UNSUBSCRIBE_BASE_URL || 'https://api.example.com/unsubscribe';
  const trackingUrl = process.env.TRACKING_PIXEL_BASE_URL || 'https://api.example.com/track/open';
  const clickBase = process.env.CLICK_TRACKING_BASE_URL || 'https://api.example.com/track/click';

  const unsubToken = Buffer.from(JSON.stringify({ id: emailLogId, email: contactEmail, cid: campaignId }))
    .toString('base64url');
  const unsubLink = `${baseUrl}?t=${unsubToken}`;
  const trackingPixel = `<img src="${trackingUrl}/${emailLogId}" width="1" height="1" style="display:none" alt="" />`;

  // Replace links with tracked versions
  let tracked = html;

  tracked = tracked.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gi,
    (match, before, href, after) => {
      if (href.startsWith('mailto:') || href.startsWith('#') || href.includes('/unsubscribe')) {
        return match;
      }
      const encodedHref = Buffer.from(JSON.stringify({ id: emailLogId, url: href, cid: campaignId }))
        .toString('base64url');
      const trackedHref = `${clickBase}/${encodedHref}`;
      return `<a ${before}href="${trackedHref}"${after}>`;
    }
  );

  // Add unsubscribe footer
  const unsubFooter = `
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
      <p>You are receiving this email because you opted in.
      <a href="${unsubLink}" style="color:#999">Unsubscribe</a></p>
    </div>`;

  if (tracked.includes('</body>')) {
    tracked = tracked.replace('</body>', `${trackingPixel}${unsubFooter}</body>`);
  } else {
    tracked += trackingPixel + unsubFooter;
  }

  return tracked;
}

/**
 * Add List-Unsubscribe header.
 * @param {string} emailLogId
 * @param {string} contactEmail
 * @param {string} campaignId
 * @returns {string}
 */
function buildUnsubscribeHeader(emailLogId, contactEmail, campaignId) {
  const baseUrl = process.env.UNSUBSCRIBE_BASE_URL || 'https://api.example.com/unsubscribe';
  const token = Buffer.from(JSON.stringify({ id: emailLogId, email: contactEmail, cid: campaignId }))
    .toString('base64url');
  return `<${baseUrl}?t=${token}>, <mailto:unsubscribe@${DKIM_CONFIG.domainName || 'example.com'}?subject=unsubscribe>`;
}

/**
 * Check if email is in bounce or unsubscribe list (using Redis Sets for fast lookup).
 * @param {string} email
 * @returns {Promise<{blocked: boolean, reason: string|null}>}
 */
async function isEmailBlocked(email) {
  const redis = getRedisClient();
  const normalizedEmail = email.toLowerCase().trim();

  const [inBounce, inUnsub] = await Promise.all([
    redis.sismember('blocked:bounces', normalizedEmail),
    redis.sismember('blocked:unsubscribes', normalizedEmail),
  ]);

  if (inBounce) return { blocked: true, reason: 'bounce' };
  if (inUnsub) return { blocked: true, reason: 'unsubscribe' };
  return { blocked: false, reason: null };
}

/**
 * Add email to bounce block list.
 * @param {string} email
 */
async function addToBounceList(email) {
  const redis = getRedisClient();
  await redis.sadd('blocked:bounces', email.toLowerCase().trim());
}

/**
 * Add email to unsubscribe block list.
 * @param {string} email
 */
async function addToUnsubscribeList(email) {
  const redis = getRedisClient();
  await redis.sadd('blocked:unsubscribes', email.toLowerCase().trim());
}

/**
 * Send email via AWS SES.
 * @param {Object} mailOptions
 * @returns {Promise<{messageId: string}>}
 */
async function sendViaSES(mailOptions) {
  const transport = nodemailer.createTransport({
    SES: { ses: getSESClient(), aws: { SendRawEmailCommand } },
    sendingRate: 14,
  });

  const dkim = buildDkimOptions();
  const options = { ...mailOptions };
  if (dkim) options.dkim = dkim;

  const info = await transport.sendMail(options);
  return { messageId: info.messageId };
}

/**
 * Send email via SendGrid.
 * @param {Object} mailOptions
 * @returns {Promise<{messageId: string}>}
 */
async function sendViaSendGrid(mailOptions) {
  initSendGrid();

  const msg = {
    to: mailOptions.to,
    from: {
      email: mailOptions.from.address || mailOptions.from,
      name: mailOptions.from.name,
    },
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
    headers: mailOptions.headers || {},
    customArgs: {
      email_log_id: mailOptions.emailLogId || '',
      campaign_id: mailOptions.campaignId || '',
    },
    trackingSettings: {
      clickTracking: { enable: false }, // We do our own tracking
      openTracking: { enable: false },
    },
  };

  if (mailOptions.replyTo) msg.replyTo = mailOptions.replyTo;

  const [response] = await sgMail.send(msg);
  return { messageId: response.headers['x-message-id'] || uuidv4() };
}

/**
 * Send email via Mailgun.
 * @param {Object} mailOptions
 * @returns {Promise<{messageId: string}>}
 */
async function sendViaMailgun(mailOptions) {
  const provider = getProviderByName('mailgun');
  const mg = getMailgunClient();

  const fromAddress = typeof mailOptions.from === 'object'
    ? `${mailOptions.from.name} <${mailOptions.from.address}>`
    : mailOptions.from;

  const data = {
    from: fromAddress,
    to: Array.isArray(mailOptions.to) ? mailOptions.to.join(',') : mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
    'h:List-Unsubscribe': mailOptions.headers?.['List-Unsubscribe'] || '',
    'o:tracking': 'no',
    'o:tracking-clicks': 'no',
    'o:tracking-opens': 'no',
  };

  if (mailOptions.replyTo) {
    data['h:Reply-To'] = mailOptions.replyTo;
  }

  const result = await mg.messages.create(provider.config.domain, data);
  return { messageId: result.id || uuidv4() };
}

/**
 * Substitute template variables in HTML/text.
 * @param {string} content
 * @param {Object} variables
 * @returns {string}
 */
function substituteVariables(content, variables) {
  if (!content || !variables) return content;
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

/**
 * Core email send function with provider rotation, DKIM, and retry logic.
 *
 * @param {Object} job - Email job data
 * @param {string} job.to - Recipient email
 * @param {string} job.subject - Email subject
 * @param {string} job.htmlBody - HTML content
 * @param {string} job.textBody - Plain text content
 * @param {string} job.campaignId - Campaign ID
 * @param {string} job.contactId - Contact ID
 * @param {Object} job.variables - Template variables for substitution
 * @param {string} [job.replyTo] - Reply-to address
 * @param {string} [job.preferredProvider] - Force specific provider
 * @returns {Promise<{success: boolean, provider: string, messageId: string}>}
 */
async function sendEmail(job) {
  const { to, subject, htmlBody, textBody, campaignId, contactId, variables, replyTo } = job;

  // 1. Check bounce/unsubscribe list
  const { blocked, reason } = await isEmailBlocked(to);
  if (blocked) {
    await updateEmailLog(job.emailLogId, { status: 'skipped', skip_reason: reason });
    return { success: false, skipped: true, reason, provider: null };
  }

  // 2. Check per-domain throttle
  const domainCheck = await checkDomainThrottle(to);
  if (!domainCheck.allowed) {
    throw new Error(`Domain throttle exceeded for ${to.split('@')[1]}. Remaining: ${domainCheck.remaining}`);
  }

  // 3. Select provider
  const providerName = job.preferredProvider || await selectProvider();
  if (!providerName) {
    throw new Error('No available email providers. All providers are rate-limited or over daily limit.');
  }

  // 4. Substitute variables in template
  const finalHtml = substituteVariables(htmlBody, variables);
  const finalText = substituteVariables(textBody, variables);

  // 5. Instrument HTML with tracking
  const emailLogId = job.emailLogId || uuidv4();
  const instrumentedHtml = instrumentEmailHtml(finalHtml, emailLogId, to, campaignId);

  // 6. Build mail options
  const provider = getProviderByName(providerName);
  const fromEmail = provider.config.fromEmail;
  const fromName = provider.config.fromName;

  const mailOptions = {
    from: { name: fromName, address: fromEmail },
    to,
    subject,
    html: instrumentedHtml,
    text: finalText,
    replyTo: replyTo || fromEmail,
    headers: {
      'List-Unsubscribe': buildUnsubscribeHeader(emailLogId, to, campaignId),
      'X-Campaign-Id': campaignId || '',
      'X-Email-Log-Id': emailLogId,
      'X-Mailer': 'CRM-Backend/1.0',
    },
    emailLogId,
    campaignId,
  };

  // 7. Send with retry logic
  const sendFn = async () => {
    switch (providerName) {
      case 'ses':
        return sendViaSES(mailOptions);
      case 'sendgrid':
        return sendViaSendGrid(mailOptions);
      case 'mailgun':
        return sendViaMailgun(mailOptions);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  };

  let result;
  try {
    result = await pRetry(sendFn, {
      retries: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      onFailedAttempt: (error) => {
        console.warn(`[EmailService] ${providerName} attempt ${error.attemptNumber} failed: ${error.message}`);
      },
    });

    await recordProviderSuccess(providerName);
  } catch (error) {
    const isHardFailure = error.statusCode >= 500 || error.code === 'ECONNREFUSED';
    await recordProviderFailure(providerName, error, isHardFailure);

    // Try fallback provider
    const fallbackProviders = ['ses', 'sendgrid', 'mailgun'].filter((p) => p !== providerName);
    let fallbackResult = null;

    for (const fallback of fallbackProviders) {
      try {
        const fallbackSend = async () => {
          const fProvider = getProviderByName(fallback);
          if (!fProvider?.enabled) throw new Error(`${fallback} not enabled`);

          mailOptions.from = { name: fProvider.config.fromName, address: fProvider.config.fromEmail };

          switch (fallback) {
            case 'ses': return sendViaSES(mailOptions);
            case 'sendgrid': return sendViaSendGrid(mailOptions);
            case 'mailgun': return sendViaMailgun(mailOptions);
          }
        };

        fallbackResult = await fallbackSend();
        await recordProviderSuccess(fallback);

        await updateEmailLog(emailLogId, {
          status: 'sent',
          provider: fallback,
          message_id: fallbackResult.messageId,
          sent_at: new Date().toISOString(),
        });

        return { success: true, provider: fallback, messageId: fallbackResult.messageId, emailLogId };
      } catch (fallbackError) {
        console.error(`[EmailService] Fallback ${fallback} also failed: ${fallbackError.message}`);
      }
    }

    // All providers failed
    await updateEmailLog(emailLogId, {
      status: 'failed',
      error_message: error.message,
    });
    throw error;
  }

  // 8. Update email log
  await updateEmailLog(emailLogId, {
    status: 'sent',
    provider: providerName,
    message_id: result.messageId,
    sent_at: new Date().toISOString(),
  });

  return { success: true, provider: providerName, messageId: result.messageId, emailLogId };
}

/**
 * Update email log status in Supabase.
 * @param {string} emailLogId
 * @param {Object} updates
 */
async function updateEmailLog(emailLogId, updates) {
  if (!emailLogId) return;
  try {
    const { error } = await supabase
      .from('email_logs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', emailLogId);
    if (error) console.error('[EmailService] Failed to update email log:', error.message);
  } catch (err) {
    console.error('[EmailService] updateEmailLog error:', err.message);
  }
}

/**
 * Create a new email log entry.
 * @param {Object} data
 * @returns {Promise<string>} email log ID
 */
async function createEmailLog(data) {
  const id = data.id || uuidv4();
  const { error } = await supabase.from('email_logs').insert({
    id,
    campaign_id: data.campaignId,
    contact_id: data.contactId,
    email: data.email,
    provider: data.provider || null,
    status: 'queued',
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[EmailService] Failed to create email log:', error.message);
  }
  return id;
}

/**
 * Process a bounce event from a provider webhook.
 * @param {string} email
 * @param {string} bounceType - 'hard' | 'soft'
 * @param {string} provider
 * @param {Object} rawData
 */
async function processBounce(email, bounceType, provider, rawData) {
  const normalizedEmail = email.toLowerCase().trim();

  // Add to Redis block list for hard bounces
  if (bounceType === 'hard') {
    await addToBounceList(normalizedEmail);
  }

  // Store in Supabase
  const { error } = await supabase.from('bounces').insert({
    id: uuidv4(),
    email: normalizedEmail,
    bounce_type: bounceType,
    provider,
    raw_data: rawData,
    created_at: new Date().toISOString(),
  });

  if (error) console.error('[EmailService] Failed to store bounce:', error.message);

  // Update contact status if hard bounce
  if (bounceType === 'hard') {
    await supabase
      .from('contacts')
      .update({ status: 'bounced', updated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);
  }
}

/**
 * Process an unsubscribe event.
 * @param {string} email
 * @param {string} campaignId
 */
async function processUnsubscribe(email, campaignId) {
  const normalizedEmail = email.toLowerCase().trim();
  await addToUnsubscribeList(normalizedEmail);

  await supabase.from('unsubscribes').insert({
    id: uuidv4(),
    email: normalizedEmail,
    campaign_id: campaignId || null,
    created_at: new Date().toISOString(),
  });

  await supabase
    .from('contacts')
    .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
    .eq('email', normalizedEmail);
}

/**
 * Process a complaint (spam report) event.
 * @param {string} email
 * @param {string} provider
 * @param {Object} rawData
 */
async function processComplaint(email, provider, rawData) {
  const normalizedEmail = email.toLowerCase().trim();
  await addToBounceList(normalizedEmail);

  await supabase
    .from('contacts')
    .update({ status: 'complained', updated_at: new Date().toISOString() })
    .eq('email', normalizedEmail);

  await supabase.from('bounces').insert({
    id: uuidv4(),
    email: normalizedEmail,
    bounce_type: 'complaint',
    provider,
    raw_data: rawData,
    created_at: new Date().toISOString(),
  });
}

/**
 * Sync bounce/unsubscribe lists from Supabase to Redis on startup.
 * Loads all hard bounces and unsubscribes into Redis Sets.
 */
async function syncBlockListsFromDB() {
  console.log('[EmailService] Syncing block lists from database...');
  const redis = getRedisClient();

  if (!redis) {
    console.warn('[EmailService] Redis not available, skipping block list sync');
    return;
  }

  try {
    // Load hard bounces
    let bouncePage = 0;
    const pageSize = 10000;
    while (true) {
      const { data, error } = await supabase
        .from('bounces')
        .select('email')
        .eq('bounce_type', 'hard')
        .range(bouncePage * pageSize, (bouncePage + 1) * pageSize - 1);

      if (error || !data || data.length === 0) break;

      if (data.length > 0) {
        const emails = data.map((r) => r.email.toLowerCase());
        await redis.sadd('blocked:bounces', ...emails);
      }

      if (data.length < pageSize) break;
      bouncePage++;
    }

    // Load unsubscribes
    let unsubPage = 0;
    while (true) {
      const { data, error } = await supabase
        .from('unsubscribes')
        .select('email')
        .range(unsubPage * pageSize, (unsubPage + 1) * pageSize - 1);

      if (error || !data || data.length === 0) break;

      if (data.length > 0) {
        const emails = data.map((r) => r.email.toLowerCase());
        await redis.sadd('blocked:unsubscribes', ...emails);
      }

      if (data.length < pageSize) break;
      unsubPage++;
    }

    const bounceCount = await redis.scard('blocked:bounces');
    const unsubCount = await redis.scard('blocked:unsubscribes');
    console.log(`[EmailService] Block lists synced: ${bounceCount} bounces, ${unsubCount} unsubscribes`);
  } catch (err) {
    console.error('[EmailService] Failed to sync block lists:', err.message);
  }
}

module.exports = {
  sendEmail,
  createEmailLog,
  updateEmailLog,
  processBounce,
  processUnsubscribe,
  processComplaint,
  syncBlockListsFromDB,
  isEmailBlocked,
  addToBounceList,
  addToUnsubscribeList,
  substituteVariables,
  instrumentEmailHtml,
};
