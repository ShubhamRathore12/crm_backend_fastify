'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');
const { addCampaignJob, removeCampaignJobs, getJob, QUEUE_NAMES } = require('../services/queueService');

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'dispatched', 'paused', 'cancelled', 'completed', 'failed'];

async function campaignsRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /campaigns
   * List all campaigns with stats.
   */
  fastify.get('/', {
    schema: {
      tags: ['Campaigns'],
      summary: 'List campaigns',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: CAMPAIGN_STATUSES },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'name', 'scheduled_at', 'sent_count'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, status, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM campaigns${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT c.*, t.name as template_name FROM campaigns c LEFT JOIN templates t ON c.template_id = t.id${whereClause} ORDER BY c.${sort} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
      });
    } catch (error) {
      console.error('[Campaigns] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  /**
   * GET /campaigns/:id
   * Get a single campaign with full stats.
   */
  fastify.get('/:id', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Get campaign by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, templates(*)')
      .eq('id', request.params.id)
      .single();

    if (error || !data) {
      return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    // Fetch aggregate email log stats
    const { data: stats } = await supabase
      .from('email_logs')
      .select('status')
      .eq('campaign_id', data.id);

    const statCounts = (stats || []).reduce((acc, log) => {
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    }, {});

    const total = stats?.length || 0;
    const sent = statCounts.sent || 0;

    return reply.send({
      data: {
        ...data,
        stats: {
          total,
          queued: statCounts.queued || 0,
          sent,
          delivered: statCounts.delivered || 0,
          opened: statCounts.opened || 0,
          clicked: statCounts.clicked || 0,
          bounced: statCounts.bounced || 0,
          complained: statCounts.complained || 0,
          skipped: statCounts.skipped || 0,
          failed: statCounts.failed || 0,
          openRate: sent > 0 ? ((statCounts.opened || 0) / sent * 100).toFixed(2) : '0',
          clickRate: sent > 0 ? ((statCounts.clicked || 0) / sent * 100).toFixed(2) : '0',
          bounceRate: sent > 0 ? ((statCounts.bounced || 0) / sent * 100).toFixed(2) : '0',
        },
      },
    });
  });

  /**
   * POST /campaigns
   * Create a new campaign.
   */
  fastify.post('/', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Create a campaign',
      body: {
        type: 'object',
        required: ['name', 'template_id'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          subject: { type: 'string', description: 'Override template subject' },
          template_id: { type: 'string', format: 'uuid' },
          segment_query: {
            type: 'object',
            description: 'Contact segment filter',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              company: { type: 'string' },
              status: { type: 'string' },
              customFields: { type: 'object' },
              contactIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              createdAfter: { type: 'string', format: 'date-time' },
              createdBefore: { type: 'string', format: 'date-time' },
            },
          },
          scheduled_at: { type: 'string', format: 'date-time', description: 'ISO timestamp to schedule send' },
          reply_to: { type: 'string', format: 'email' },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const {
      name,
      subject,
      template_id,
      segment_query = null,
      scheduled_at = null,
      reply_to = null,
      metadata = {},
    } = request.body;

    // Validate template exists
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('id, name, subject')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return reply.code(400).send({ error: 'Validation Error', message: 'Template not found' });
    }

    const campaign = {
      id: uuidv4(),
      name,
      subject: subject || template.subject,
      template_id,
      segment_query,
      status: scheduled_at ? 'scheduled' : 'draft',
      scheduled_at,
      reply_to,
      metadata,
      sent_count: 0,
      queued_count: 0,
      provider_stats: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('campaigns').insert(campaign).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.code(201).send({ data });
  });

  /**
   * PATCH /campaigns/:id
   * Update campaign metadata (only for draft/scheduled campaigns).
   */
  fastify.patch('/:id', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Update a campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          subject: { type: 'string' },
          template_id: { type: 'string', format: 'uuid' },
          segment_query: { type: 'object' },
          scheduled_at: { type: 'string', format: 'date-time' },
          reply_to: { type: 'string', format: 'email' },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Verify campaign is editable
    const { data: existing, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (!['draft', 'scheduled'].includes(existing.status)) {
      return reply.code(409).send({
        error: 'Conflict',
        message: `Cannot edit campaign in ${existing.status} status. Only draft/scheduled campaigns can be edited.`,
      });
    }

    const updates = { ...request.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('campaigns').update(updates).eq('id', id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({ data });
  });

  /**
   * POST /campaigns/:id/send
   * Immediately dispatch campaign to the email queue.
   */
  fastify.post('/:id/send', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Send/dispatch a campaign immediately',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });
    }

    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      return reply.code(409).send({
        error: 'Conflict',
        message: `Campaign is ${campaign.status}. Only draft, scheduled, or paused campaigns can be sent.`,
      });
    }

    // Update status to queued
    await supabase
      .from('campaigns')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Enqueue campaign dispatch job
    const jobId = await addCampaignJob({
      campaignId: campaign.id,
      templateId: campaign.template_id,
      subject: campaign.subject,
      segmentQuery: campaign.segment_query,
      replyTo: campaign.reply_to,
    });

    return reply.code(202).send({
      message: 'Campaign dispatch started',
      campaignId: id,
      jobId,
    });
  });

  /**
   * POST /campaigns/:id/pause
   * Pause an active campaign.
   */
  fastify.post('/:id/pause', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Pause a running campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const { data: campaign } = await supabase.from('campaigns').select('status').eq('id', id).single();
    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    if (!['running', 'dispatched', 'queued'].includes(campaign.status)) {
      return reply.code(409).send({ error: 'Conflict', message: 'Only running campaigns can be paused' });
    }

    await supabase.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', id);

    return reply.send({ message: 'Campaign paused', campaignId: id });
  });

  /**
   * POST /campaigns/:id/resume
   * Resume a paused campaign.
   */
  fastify.post('/:id/resume', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Resume a paused campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single();
    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    if (campaign.status !== 'paused') {
      return reply.code(409).send({ error: 'Conflict', message: 'Only paused campaigns can be resumed' });
    }

    await supabase.from('campaigns').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('id', id);

    // Re-enqueue the campaign dispatch job (it will skip already-sent contacts)
    const jobId = await addCampaignJob({
      campaignId: campaign.id,
      templateId: campaign.template_id,
      subject: campaign.subject,
      segmentQuery: campaign.segment_query,
      replyTo: campaign.reply_to,
      isResume: true,
    });

    return reply.send({ message: 'Campaign resumed', campaignId: id, jobId });
  });

  /**
   * POST /campaigns/:id/cancel
   * Cancel a campaign.
   */
  fastify.post('/:id/cancel', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Cancel a campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const { data: campaign } = await supabase.from('campaigns').select('status').eq('id', id).single();
    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    if (['completed', 'cancelled'].includes(campaign.status)) {
      return reply.code(409).send({ error: 'Conflict', message: `Campaign is already ${campaign.status}` });
    }

    // Remove pending queue jobs
    const removedJobs = await removeCampaignJobs(id).catch(() => 0);

    await supabase
      .from('campaigns')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    return reply.send({ message: 'Campaign cancelled', campaignId: id, removedJobs });
  });

  /**
   * DELETE /campaigns/:id
   * Delete a campaign (only draft/cancelled).
   */
  fastify.delete('/:id', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Delete a campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', request.params.id)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    if (!['draft', 'cancelled'].includes(campaign.status)) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Only draft or cancelled campaigns can be deleted',
      });
    }

    await supabase.from('campaigns').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  /**
   * GET /campaigns/:id/preview
   * Preview campaign email with sample contact data.
   */
  fastify.get('/:id/preview', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Preview campaign email with sample data',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          contact_id: { type: 'string', format: 'uuid', description: 'Use this contact for preview' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { contact_id } = request.query;

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, templates(*)')
      .eq('id', id)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    let variables = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      mobile: '+1-555-0100',
      ucc_code: 'UCC001',
      pan: 'ABCDE1234F',
      address: '123 Main St',
    };

    if (contact_id) {
      const { data: contact } = await supabase.from('contacts').select('*').eq('id', contact_id).single();
      if (contact) {
        variables = {
          name: contact.name || '',
          email: contact.email,
          mobile: contact.mobile || '',
          ucc_code: contact.ucc_code || '',
          pan: contact.pan || '',
          address: contact.address || '',
          ...(contact.custom_fields || {}),
        };
      }
    }

    const { substituteVariables } = require('../services/emailService');
    const html = substituteVariables(campaign.templates?.html_body || '', variables);
    const text = substituteVariables(campaign.templates?.text_body || '', variables);
    const subject = substituteVariables(campaign.subject || campaign.templates?.subject || '', variables);

    return reply.send({ subject, html, text, variables });
  });

  /**
   * GET /campaigns/:id/logs
   * Get email logs for a campaign with pagination.
   */
  fastify.get('/:id/logs', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Get email logs for a campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { page = 1, limit = 100, status } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('email_logs')
      .select('*, contacts(name, email)', { count: 'exact' })
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data,
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  });

  /**
   * POST /campaigns/:id/test-send
   * Send a test email for a campaign to specific addresses.
   */
  fastify.post('/:id/test-send', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Send test email for a campaign',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        required: ['to'],
        properties: {
          to: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 10 },
          variables: { type: 'object', description: 'Override variables for test' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { to, variables: overrideVars = {} } = request.body;

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, templates(*)')
      .eq('id', id)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    const { sendEmail } = require('../services/emailService');
    const results = [];

    const defaultVars = {
      name: 'Test User',
      email: to[0] || 'test@example.com',
      mobile: '+1-555-0100',
      ucc_code: 'UCC_TEST',
      ...overrideVars,
    };

    for (const email of to) {
      try {
        const result = await sendEmail({
          to: email,
          subject: `[TEST] ${campaign.subject || campaign.templates?.subject}`,
          htmlBody: campaign.templates?.html_body || '',
          textBody: campaign.templates?.text_body || '',
          campaignId: campaign.id,
          contactId: null,
          variables: { ...defaultVars, email },
        });
        results.push({ email, success: true, provider: result.provider, messageId: result.messageId });
      } catch (err) {
        results.push({ email, success: false, error: err.message });
      }
    }

    return reply.send({ results });
  });
}

module.exports = campaignsRoutes;
