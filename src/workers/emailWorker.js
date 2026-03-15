'use strict';

require('dotenv').config();

const { Worker, MetricsTime } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { QUEUE_NAMES, EMAIL_WORKER_OPTIONS, customBackoffStrategy } = require('../config/queues');
const { sendEmail, updateEmailLog } = require('../services/emailService');

const CONCURRENCY = parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '50', 10);

console.log(`[EmailWorker] Starting with concurrency: ${CONCURRENCY}`);

/**
 * Process an individual email job.
 * @param {import('bullmq').Job} job
 */
async function processEmailJob(job) {
  const {
    to,
    subject,
    htmlBody,
    textBody,
    campaignId,
    contactId,
    variables,
    replyTo,
    emailLogId,
    preferredProvider,
  } = job.data;

  // Update job progress
  await job.updateProgress(10);

  job.log(`Processing email to ${to} for campaign ${campaignId}`);

  // Validate required fields
  if (!to || !subject || (!htmlBody && !textBody)) {
    throw new Error(`Invalid email job data: missing to, subject, or body for job ${job.id}`);
  }

  await job.updateProgress(20);

  let result;
  try {
    result = await sendEmail({
      to,
      subject,
      htmlBody: htmlBody || '',
      textBody: textBody || '',
      campaignId,
      contactId,
      variables: variables || {},
      replyTo,
      emailLogId,
      preferredProvider,
    });
  } catch (err) {
    // Update email log to failed
    await updateEmailLog(emailLogId, {
      status: 'failed',
      error_message: err.message,
    }).catch(() => {});

    job.log(`Email failed: ${err.message}`);
    throw err; // Re-throw so BullMQ can handle retry
  }

  await job.updateProgress(100);

  if (result.skipped) {
    job.log(`Email skipped: ${result.reason} for ${to}`);
    return { skipped: true, reason: result.reason };
  }

  job.log(`Email sent via ${result.provider}: ${result.messageId}`);
  return {
    success: true,
    provider: result.provider,
    messageId: result.messageId,
    emailLogId: result.emailLogId,
  };
}

/**
 * Create and start the email worker.
 */
const worker = new Worker(QUEUE_NAMES.EMAIL, processEmailJob, {
  connection: createRedisConnection('email-worker'),
  concurrency: CONCURRENCY,
  limiter: EMAIL_WORKER_OPTIONS.limiter,
  settings: {
    backoffStrategy: customBackoffStrategy,
  },
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK,
  },
});

// Worker event listeners
worker.on('completed', (job, result) => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[EmailWorker] Job ${job.id} completed:`, result?.messageId || result?.reason);
  }
});

worker.on('failed', (job, err) => {
  const isLastAttempt = job.attemptsMade >= (job.opts.attempts || 4);
  if (isLastAttempt) {
    console.error(`[EmailWorker] Job ${job.id} permanently failed after ${job.attemptsMade} attempts:`, err.message);
  } else {
    console.warn(`[EmailWorker] Job ${job.id} failed attempt ${job.attemptsMade}: ${err.message} — will retry`);
  }
});

worker.on('error', (err) => {
  console.error('[EmailWorker] Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`[EmailWorker] Job ${jobId} stalled`);
});

worker.on('active', (job) => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[EmailWorker] Processing job ${job.id} → ${job.data.to}`);
  }
});

// Graceful shutdown
async function shutdown() {
  console.log('[EmailWorker] Shutting down gracefully...');
  await worker.close();
  console.log('[EmailWorker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[EmailWorker] Uncaught exception:', err);
  shutdown().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[EmailWorker] Unhandled rejection:', reason);
});

console.log(`[EmailWorker] Ready. Listening on queue: ${QUEUE_NAMES.EMAIL}`);

module.exports = { worker };
