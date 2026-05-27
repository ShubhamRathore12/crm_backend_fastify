'use strict';

require('dotenv').config();

const { Worker, MetricsTime } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { createRedisConnection } = require('../config/redis');
const { QUEUE_NAMES, CAMPAIGN_WORKER_OPTIONS, customBackoffStrategy } = require('../config/queues');
const { QUEUE_CONFIG } = require('../config/providers');
const { supabase, paginateQuery } = require('../config/supabase');
const { addEmailBatch, createEmailFlow } = require('../services/queueService');
const { createEmailLog } = require('../services/emailService');

const BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE || '500', 10);

console.log(`[CampaignWorker] Starting with batch size: ${BATCH_SIZE}`);

/**
 * Fetch template by ID.
 * @param {string} templateId
 * @returns {Promise<Object>}
 */
async function fetchTemplate(templateId) {
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, subject, html_body, text_body, variables')
    .eq('id', templateId)
    .single();

  if (error || !data) {
    throw new Error(`Template ${templateId} not found: ${error?.message}`);
  }
  return data;
}

/**
 * Update campaign status and stats in Supabase.
 * @param {string} campaignId
 * @param {Object} updates
 */
async function updateCampaign(campaignId, updates) {
  const { error } = await supabase
    .from('campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  if (error) console.error(`[CampaignWorker] Failed to update campaign ${campaignId}:`, error.message);
}

/**
 * Build Supabase contacts query from segment query definition.
 * @param {Object} segmentQuery - Segment filter definition
 * @returns {Function} Query builder function
 */
function buildContactsQuery(segmentQuery) {
  return (offset, limit) => {
    let query = supabase
      .from('contacts')
      .select('id, email, first_name, last_name, company, phone, custom_fields', { count: 'exact' })
      .eq('status', 'active')
      .not('email', 'is', null)
      .range(offset, offset + limit - 1);

    if (!segmentQuery) return query;

    // Apply tag filters
    if (segmentQuery.tags && segmentQuery.tags.length > 0) {
      query = query.overlaps('tags', segmentQuery.tags);
    }

    // Apply company filter
    if (segmentQuery.company) {
      query = query.ilike('company', `%${segmentQuery.company}%`);
    }

    // Apply custom field filters
    if (segmentQuery.customFields) {
      for (const [key, value] of Object.entries(segmentQuery.customFields)) {
        query = query.eq(`custom_fields->>${key}`, value);
      }
    }

    // Apply created_at range
    if (segmentQuery.createdAfter) {
      query = query.gte('created_at', segmentQuery.createdAfter);
    }
    if (segmentQuery.createdBefore) {
      query = query.lte('created_at', segmentQuery.createdBefore);
    }

    // Apply explicit contact ID list
    if (segmentQuery.contactIds && segmentQuery.contactIds.length > 0) {
      query = query.in('id', segmentQuery.contactIds);
    }

    return query;
  };
}

/**
 * Process a campaign dispatch job.
 * Fetches contacts in batches and enqueues individual email jobs.
 *
 * @param {import('bullmq').Job} job
 */
async function processCampaignJob(job) {
  const { campaignId, templateId, subject: campaignSubject, segmentQuery } = job.data;

  job.log(`Starting campaign dispatch: ${campaignId}`);
  await job.updateProgress(5);

  // Mark campaign as running
  await updateCampaign(campaignId, {
    status: 'running',
    started_at: new Date().toISOString(),
    sent_count: 0,
    queued_count: 0,
  });

  // Fetch template
  let template;
  try {
    template = await fetchTemplate(templateId);
  } catch (err) {
    await updateCampaign(campaignId, { status: 'failed', error_message: err.message });
    throw err;
  }

  const subject = campaignSubject || template.subject;
  const htmlBody = template.html_body;
  const textBody = template.text_body;

  await job.updateProgress(10);

  // Paginate through contacts and enqueue batches
  const queryFn = buildContactsQuery(segmentQuery);
  let totalQueued = 0;
  let batchIndex = 0;
  let totalContacts = 0;

  try {
    const contactPages = paginateQuery(queryFn, BATCH_SIZE);

    for await (const contactsBatch of contactPages) {
      // Check if campaign was paused or cancelled
      const { data: campaignStatus } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (campaignStatus?.status === 'paused') {
        job.log('Campaign paused — stopping dispatch');
        await updateCampaign(campaignId, { status: 'paused', queued_count: totalQueued });
        return { status: 'paused', queued: totalQueued };
      }

      if (campaignStatus?.status === 'cancelled') {
        job.log('Campaign cancelled — stopping dispatch');
        return { status: 'cancelled', queued: totalQueued };
      }

      totalContacts += contactsBatch.length;

      // Prepare email log records and job data for this batch
      const emailJobs = [];
      const emailLogInserts = [];

      for (const contact of contactsBatch) {
        const emailLogId = uuidv4();

        // Build per-contact variable substitution context
        const variables = {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          email: contact.email,
          company: contact.company || '',
          phone: contact.phone || '',
          ...(contact.custom_fields || {}),
        };

        emailJobs.push({
          to: contact.email,
          subject,
          htmlBody,
          textBody,
          campaignId,
          contactId: contact.id,
          variables,
          emailLogId,
        });

        emailLogInserts.push({
          id: emailLogId,
          campaign_id: campaignId,
          contact_id: contact.id,
          email: contact.email,
          status: 'queued',
          created_at: new Date().toISOString(),
        });
      }

      // Batch insert email logs
      if (emailLogInserts.length > 0) {
        const { error: logError } = await supabase
          .from('email_logs')
          .insert(emailLogInserts);
        if (logError) {
          console.error(`[CampaignWorker] Failed to insert email logs for batch ${batchIndex}:`, logError.message);
        }
      }

      // Enqueue email jobs batch
      await addEmailBatch(emailJobs, campaignId);

      totalQueued += emailJobs.length;
      batchIndex++;

      // Update campaign progress
      await updateCampaign(campaignId, { queued_count: totalQueued });

      const progressPct = Math.min(95, 10 + Math.floor((totalQueued / Math.max(totalContacts, 1)) * 85));
      await job.updateProgress(progressPct);

      job.log(`Batch ${batchIndex} queued: ${emailJobs.length} emails. Total queued: ${totalQueued}`);

      // Small delay between batches to avoid overwhelming the queue
      if (contactsBatch.length === BATCH_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    await job.updateProgress(100);

    // Mark campaign as dispatched (not completed — completion is when all emails are sent)
    await updateCampaign(campaignId, {
      status: 'dispatched',
      queued_count: totalQueued,
      dispatch_completed_at: new Date().toISOString(),
    });

    job.log(`Campaign ${campaignId} fully dispatched: ${totalQueued} emails queued in ${batchIndex} batches`);

    return {
      status: 'dispatched',
      campaignId,
      totalQueued,
      batches: batchIndex,
    };
  } catch (err) {
    console.error(`[CampaignWorker] Campaign ${campaignId} failed:`, err.message);
    await updateCampaign(campaignId, {
      status: 'failed',
      error_message: err.message,
      queued_count: totalQueued,
    });
    throw err;
  }
}

/**
 * Create and start the campaign worker.
 */
const worker = new Worker(QUEUE_NAMES.CAMPAIGN, processCampaignJob, {
  connection: createRedisConnection('campaign-worker', { maxRetriesPerRequest: null }),
  concurrency: CAMPAIGN_WORKER_OPTIONS.concurrency,
  settings: {
    backoffStrategy: customBackoffStrategy,
  },
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK,
  },
});

worker.on('completed', (job, result) => {
  console.log(`[CampaignWorker] Job ${job.id} completed:`, JSON.stringify(result));
});

worker.on('failed', (job, err) => {
  console.error(`[CampaignWorker] Job ${job.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[CampaignWorker] Worker error:', err);
});

worker.on('progress', (job, progress) => {
  console.log(`[CampaignWorker] Campaign ${job.data.campaignId} progress: ${progress}%`);
});

// Graceful shutdown
async function shutdown() {
  console.log('[CampaignWorker] Shutting down gracefully...');
  await worker.close();
  console.log('[CampaignWorker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[CampaignWorker] Uncaught exception:', err);
  shutdown().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[CampaignWorker] Unhandled rejection:', reason);
});

console.log(`[CampaignWorker] Ready. Listening on queue: ${QUEUE_NAMES.CAMPAIGN}`);

module.exports = { worker };
