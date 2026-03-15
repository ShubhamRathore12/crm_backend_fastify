'use strict';

const { Queue, QueueEvents, FlowProducer } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { createRedisConnection } = require('../config/redis');
const {
  QUEUE_NAMES,
  EMAIL_JOB_OPTIONS,
  CAMPAIGN_JOB_OPTIONS,
  BOUNCE_JOB_OPTIONS,
  FLOW_OPTIONS,
  customBackoffStrategy,
} = require('../config/queues');

// Queue singletons
let _emailQueue = null;
let _campaignQueue = null;
let _bounceQueue = null;
let _flowProducer = null;
let _emailQueueEvents = null;

/**
 * Get the email queue singleton.
 * @returns {Queue}
 */
function getEmailQueue() {
  if (!_emailQueue) {
    _emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
      connection: createRedisConnection('email-queue'),
      defaultJobOptions: {
        ...EMAIL_JOB_OPTIONS,
        backoff: {
          type: 'custom',
        },
      },
    });
    _emailQueue.on('error', (err) => console.error('[EmailQueue] Error:', err.message));
  }
  return _emailQueue;
}

/**
 * Get the campaign queue singleton.
 * @returns {Queue}
 */
function getCampaignQueue() {
  if (!_campaignQueue) {
    _campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGN, {
      connection: createRedisConnection('campaign-queue'),
      defaultJobOptions: CAMPAIGN_JOB_OPTIONS,
    });
    _campaignQueue.on('error', (err) => console.error('[CampaignQueue] Error:', err.message));
  }
  return _campaignQueue;
}

/**
 * Get the bounce queue singleton.
 * @returns {Queue}
 */
function getBounceQueue() {
  if (!_bounceQueue) {
    _bounceQueue = new Queue(QUEUE_NAMES.BOUNCE, {
      connection: createRedisConnection('bounce-queue'),
      defaultJobOptions: BOUNCE_JOB_OPTIONS,
    });
    _bounceQueue.on('error', (err) => console.error('[BounceQueue] Error:', err.message));
  }
  return _bounceQueue;
}

/**
 * Get the flow producer singleton.
 * @returns {FlowProducer}
 */
function getFlowProducer() {
  if (!_flowProducer) {
    _flowProducer = new FlowProducer({
      connection: createRedisConnection('flow-producer'),
    });
    _flowProducer.on('error', (err) => console.error('[FlowProducer] Error:', err.message));
  }
  return _flowProducer;
}

/**
 * Get queue events for monitoring.
 * @returns {QueueEvents}
 */
function getEmailQueueEvents() {
  if (!_emailQueueEvents) {
    _emailQueueEvents = new QueueEvents(QUEUE_NAMES.EMAIL, {
      connection: createRedisConnection('email-queue-events'),
    });
  }
  return _emailQueueEvents;
}

/**
 * Add a single email job to the email queue.
 *
 * @param {Object} emailData
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.htmlBody - HTML content
 * @param {string} emailData.textBody - Plain text content
 * @param {string} emailData.campaignId - Campaign ID
 * @param {string} emailData.contactId - Contact ID
 * @param {Object} [emailData.variables] - Template variables
 * @param {Object} [options] - Job options override
 * @returns {Promise<string>} job ID
 */
async function addEmailJob(emailData, options = {}) {
  const queue = getEmailQueue();
  const jobId = `email:${emailData.campaignId}:${emailData.contactId}:${uuidv4()}`;
  const emailLogId = emailData.emailLogId || uuidv4();

  const job = await queue.add(
    'send-email',
    { ...emailData, emailLogId },
    {
      ...EMAIL_JOB_OPTIONS,
      ...options,
      jobId,
    }
  );

  return { jobId: job.id, emailLogId };
}

/**
 * Add a batch of email jobs to the queue.
 * Uses BullMQ bulk add for efficiency.
 *
 * @param {Array<Object>} emails - Array of email data objects
 * @param {string} campaignId - Campaign ID for grouping
 * @returns {Promise<{jobs: number, emailLogIds: string[]}>}
 */
async function addEmailBatch(emails, campaignId) {
  const queue = getEmailQueue();

  const jobs = emails.map((email) => {
    const emailLogId = email.emailLogId || uuidv4();
    return {
      name: 'send-email',
      data: { ...email, emailLogId },
      opts: {
        ...EMAIL_JOB_OPTIONS,
        jobId: `email:${campaignId}:${email.contactId}:${uuidv4()}`,
      },
    };
  });

  await queue.addBulk(jobs);

  return {
    jobs: jobs.length,
    emailLogIds: jobs.map((j) => j.data.emailLogId),
  };
}

/**
 * Add a campaign dispatch job.
 *
 * @param {Object} campaignData
 * @param {string} campaignData.campaignId
 * @param {string} campaignData.templateId
 * @param {string} campaignData.subject
 * @param {Object} campaignData.segmentQuery - Supabase filter for contacts
 * @param {Object} [options] - Job options override
 * @returns {Promise<string>} job ID
 */
async function addCampaignJob(campaignData, options = {}) {
  const queue = getCampaignQueue();
  const jobId = `campaign:${campaignData.campaignId}`;

  const job = await queue.add('dispatch-campaign', campaignData, {
    ...CAMPAIGN_JOB_OPTIONS,
    ...options,
    jobId,
  });

  return job.id;
}

/**
 * Add a bounce processing job.
 * @param {Object} bounceData
 * @returns {Promise<string>} job ID
 */
async function addBounceJob(bounceData) {
  const queue = getBounceQueue();
  const job = await queue.add('process-bounce', bounceData, BOUNCE_JOB_OPTIONS);
  return job.id;
}

/**
 * Create a BullMQ Flow: campaign → batch → email jobs.
 * This links jobs so that campaign completion depends on all email jobs finishing.
 *
 * @param {string} campaignId
 * @param {Array<Object>} emailBatch - Batch of email job data
 * @param {number} batchIndex - Batch sequence number
 * @returns {Promise<Object>} flow job
 */
async function createEmailFlow(campaignId, emailBatch, batchIndex) {
  const fp = getFlowProducer();

  const childJobs = emailBatch.map((email) => {
    const emailLogId = email.emailLogId || uuidv4();
    return {
      name: 'send-email',
      data: { ...email, emailLogId },
      queueName: QUEUE_NAMES.EMAIL,
      opts: {
        ...EMAIL_JOB_OPTIONS,
        jobId: `email:${campaignId}:${email.contactId}:${uuidv4()}`,
      },
    };
  });

  const flow = await fp.add({
    name: 'campaign-batch',
    queueName: QUEUE_NAMES.CAMPAIGN,
    data: { campaignId, batchIndex, batchSize: emailBatch.length },
    opts: {
      ...CAMPAIGN_JOB_OPTIONS,
      jobId: `batch:${campaignId}:${batchIndex}`,
    },
    children: childJobs,
  });

  return flow;
}

/**
 * Get queue statistics.
 * @returns {Promise<Object>}
 */
async function getQueueStats() {
  const [emailQueue, campaignQueue, bounceQueue] = [
    getEmailQueue(),
    getCampaignQueue(),
    getBounceQueue(),
  ];

  const [emailCounts, campaignCounts, bounceCounts] = await Promise.all([
    emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    campaignQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    bounceQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ]);

  return {
    email: emailCounts,
    campaign: campaignCounts,
    bounce: bounceCounts,
  };
}

/**
 * Get a specific job's status and data.
 * @param {string} queueName
 * @param {string} jobId
 * @returns {Promise<Object|null>}
 */
async function getJob(queueName, jobId) {
  let queue;
  switch (queueName) {
    case QUEUE_NAMES.EMAIL: queue = getEmailQueue(); break;
    case QUEUE_NAMES.CAMPAIGN: queue = getCampaignQueue(); break;
    case QUEUE_NAMES.BOUNCE: queue = getBounceQueue(); break;
    default: return null;
  }

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    timestamp: job.timestamp,
  };
}

/**
 * Pause a queue.
 * @param {string} queueName
 */
async function pauseQueue(queueName) {
  let queue;
  switch (queueName) {
    case QUEUE_NAMES.EMAIL: queue = getEmailQueue(); break;
    case QUEUE_NAMES.CAMPAIGN: queue = getCampaignQueue(); break;
    default: throw new Error(`Unknown queue: ${queueName}`);
  }
  await queue.pause();
}

/**
 * Resume a paused queue.
 * @param {string} queueName
 */
async function resumeQueue(queueName) {
  let queue;
  switch (queueName) {
    case QUEUE_NAMES.EMAIL: queue = getEmailQueue(); break;
    case QUEUE_NAMES.CAMPAIGN: queue = getCampaignQueue(); break;
    default: throw new Error(`Unknown queue: ${queueName}`);
  }
  await queue.resume();
}

/**
 * Remove all jobs from a queue by campaign ID prefix.
 * Used when a campaign is cancelled.
 * @param {string} campaignId
 */
async function removeCampaignJobs(campaignId) {
  const queue = getEmailQueue();
  const jobs = await queue.getJobs(['waiting', 'delayed', 'paused']);
  const toRemove = jobs.filter((j) => j.data?.campaignId === campaignId);

  await Promise.all(toRemove.map((j) => j.remove()));
  return toRemove.length;
}

/**
 * Get paginated list of failed jobs.
 * @param {string} queueName
 * @param {number} start
 * @param {number} end
 */
async function getFailedJobs(queueName, start = 0, end = 49) {
  let queue;
  switch (queueName) {
    case QUEUE_NAMES.EMAIL: queue = getEmailQueue(); break;
    case QUEUE_NAMES.CAMPAIGN: queue = getCampaignQueue(); break;
    default: queue = getEmailQueue();
  }

  const jobs = await queue.getFailed(start, end);
  return jobs.map((j) => ({
    id: j.id,
    name: j.name,
    data: j.data,
    failedReason: j.failedReason,
    attemptsMade: j.attemptsMade,
    timestamp: j.timestamp,
  }));
}

/**
 * Retry all failed jobs in a queue.
 * @param {string} queueName
 * @returns {Promise<number>} count of retried jobs
 */
async function retryFailedJobs(queueName) {
  let queue;
  switch (queueName) {
    case QUEUE_NAMES.EMAIL: queue = getEmailQueue(); break;
    case QUEUE_NAMES.CAMPAIGN: queue = getCampaignQueue(); break;
    default: queue = getEmailQueue();
  }

  const failedJobs = await queue.getFailed(0, 999);
  await Promise.all(failedJobs.map((j) => j.retry()));
  return failedJobs.length;
}

/**
 * Close all queue connections gracefully.
 */
async function closeQueues() {
  const closing = [];
  if (_emailQueue) closing.push(_emailQueue.close().catch(() => {}));
  if (_campaignQueue) closing.push(_campaignQueue.close().catch(() => {}));
  if (_bounceQueue) closing.push(_bounceQueue.close().catch(() => {}));
  if (_flowProducer) closing.push(_flowProducer.close().catch(() => {}));
  if (_emailQueueEvents) closing.push(_emailQueueEvents.close().catch(() => {}));
  await Promise.all(closing);
}

module.exports = {
  getEmailQueue,
  getCampaignQueue,
  getBounceQueue,
  getFlowProducer,
  getEmailQueueEvents,
  addEmailJob,
  addEmailBatch,
  addCampaignJob,
  addBounceJob,
  createEmailFlow,
  getQueueStats,
  getJob,
  pauseQueue,
  resumeQueue,
  removeCampaignJobs,
  getFailedJobs,
  retryFailedJobs,
  closeQueues,
  QUEUE_NAMES,
  customBackoffStrategy,
};
