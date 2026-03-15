'use strict';

const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { getProviderHealth } = require('../services/providerService');
const { getQueueStats } = require('../services/queueService');

async function analyticsRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /overview ─── CRM Dashboard ─────────────────────────────
  fastify.get('/overview', {
    schema: {
      tags: ['Analytics'],
      summary: 'CRM overview dashboard stats',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { days = 30 } = request.query;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const [
      contactsResult,
      leadsResult,
      opportunitiesResult,
      tasksResult,
      interactionsResult,
      campaignsResult,
      emailSendsResult,
    ] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('leads').select('status, stage', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('opportunities').select('stage, value', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('tasks').select('status', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('interactions').select('channel, status', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('bulk_email_campaigns').select('status, sent_count, failed_count', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('email_sends').select('id, read_at', { count: 'exact', head: false }).gte('created_at', since),
    ]);

    // Lead stats
    const leadsByStatus = (leadsResult.data || []).reduce((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});
    const leadsByStage = (leadsResult.data || []).reduce((acc, l) => {
      acc[l.stage] = (acc[l.stage] || 0) + 1;
      return acc;
    }, {});

    // Opportunity stats
    const oppsByStage = (opportunitiesResult.data || []).reduce((acc, o) => {
      acc[o.stage] = (acc[o.stage] || 0) + 1;
      return acc;
    }, {});
    const totalPipelineValue = (opportunitiesResult.data || []).reduce((sum, o) => sum + (parseFloat(o.value) || 0), 0);

    // Task stats
    const tasksByStatus = (tasksResult.data || []).reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

    // Interaction stats
    const interactionsByChannel = (interactionsResult.data || []).reduce((acc, i) => {
      acc[i.channel] = (acc[i.channel] || 0) + 1;
      return acc;
    }, {});

    // Campaign stats
    const totalSent = (campaignsResult.data || []).reduce((sum, c) => sum + (c.sent_count || 0), 0);
    const totalFailed = (campaignsResult.data || []).reduce((sum, c) => sum + (c.failed_count || 0), 0);

    // Email open rate
    const emailTotal = emailSendsResult.count || 0;
    const emailRead = (emailSendsResult.data || []).filter(e => e.read_at).length;

    return reply.send({
      period: { days, since },
      contacts: { total: contactsResult.count || 0 },
      leads: {
        total: leadsResult.count || 0,
        byStatus: leadsByStatus,
        byStage: leadsByStage,
      },
      opportunities: {
        total: opportunitiesResult.count || 0,
        byStage: oppsByStage,
        totalPipelineValue,
      },
      tasks: {
        total: tasksResult.count || 0,
        byStatus: tasksByStatus,
      },
      interactions: {
        total: interactionsResult.count || 0,
        byChannel: interactionsByChannel,
      },
      campaigns: {
        total: campaignsResult.count || 0,
        totalSent,
        totalFailed,
      },
      emails: {
        total: emailTotal,
        read: emailRead,
        readRate: emailTotal > 0 ? (emailRead / emailTotal * 100).toFixed(2) + '%' : '0%',
      },
    });
  });

  // ─── GET /leads ─── Lead analytics ────────────────────────────────
  fastify.get('/leads', {
    schema: {
      tags: ['Analytics'],
      summary: 'Lead analytics and conversion stats',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { days = 30 } = request.query;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const [leadsResult, scoresResult, historyResult] = await Promise.all([
      supabase.from('leads').select('id, source, status, stage, assigned_to, created_at').gte('created_at', since),
      supabase.from('lead_scores').select('score, confidence').gte('created_at', since),
      supabase.from('lead_history').select('status, timestamp').gte('timestamp', since),
    ]);

    const leads = leadsResult.data || [];
    const bySource = leads.reduce((acc, l) => { acc[l.source] = (acc[l.source] || 0) + 1; return acc; }, {});
    const byStatus = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});
    const byStage = leads.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {});

    const scores = scoresResult.data || [];
    const avgScore = scores.length > 0 ? (scores.reduce((s, r) => s + parseFloat(r.score || 0), 0) / scores.length).toFixed(2) : 0;
    const avgConfidence = scores.length > 0 ? (scores.reduce((s, r) => s + parseFloat(r.confidence || 0), 0) / scores.length).toFixed(2) : 0;

    return reply.send({
      period: { days, since },
      total: leads.length,
      bySource,
      byStatus,
      byStage,
      scoring: { avgScore, avgConfidence, totalScored: scores.length },
      historyEvents: (historyResult.data || []).length,
    });
  });

  // ─── GET /opportunities ─── Pipeline analytics ───────────────────
  fastify.get('/opportunities', {
    schema: {
      tags: ['Analytics'],
      summary: 'Opportunity pipeline analytics',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { days = 30 } = request.query;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const { data: opps } = await supabase
      .from('opportunities')
      .select('id, stage, value, probability, currency, created_at')
      .gte('created_at', since);

    const opportunities = opps || [];
    const pipeline = {};
    opportunities.forEach(o => {
      if (!pipeline[o.stage]) pipeline[o.stage] = { count: 0, totalValue: 0, avgProbability: 0, probSum: 0 };
      pipeline[o.stage].count++;
      pipeline[o.stage].totalValue += parseFloat(o.value) || 0;
      pipeline[o.stage].probSum += o.probability || 0;
    });

    Object.keys(pipeline).forEach(stage => {
      pipeline[stage].avgProbability = (pipeline[stage].probSum / pipeline[stage].count).toFixed(0);
      delete pipeline[stage].probSum;
    });

    const totalValue = opportunities.reduce((s, o) => s + (parseFloat(o.value) || 0), 0);
    const weightedValue = opportunities.reduce((s, o) => s + (parseFloat(o.value) || 0) * ((o.probability || 0) / 100), 0);

    return reply.send({
      period: { days, since },
      total: opportunities.length,
      totalValue,
      weightedValue: weightedValue.toFixed(2),
      pipeline,
    });
  });

  // ─── GET /campaigns/:id ─── Campaign analytics ───────────────────
  fastify.get('/campaigns/:id', {
    schema: {
      tags: ['Analytics'],
      summary: 'Campaign-level analytics',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const { data: campaign } = await supabase
      .from('bulk_email_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Not Found', message: 'Campaign not found' });

    const { data: recipients } = await supabase
      .from('bulk_email_recipients')
      .select('status, error_message, sent_at, created_at')
      .eq('campaign_id', id);

    const statusCounts = (recipients || []).reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return reply.send({
      campaign: {
        id: campaign.id,
        subject: campaign.subject,
        status: campaign.status,
        total_count: campaign.total_count,
        sent_count: campaign.sent_count,
        failed_count: campaign.failed_count,
        created_at: campaign.created_at,
      },
      recipients: {
        total: (recipients || []).length,
        byStatus: statusCounts,
      },
    });
  });

  // ─── GET /providers ─── Provider health ───────────────────────────
  fastify.get('/providers', {
    schema: {
      tags: ['Analytics'],
      summary: 'Email provider performance stats',
    },
  }, async (request, reply) => {
    try {
      const providerHealth = await getProviderHealth();
      return reply.send({ providers: providerHealth, timestamp: new Date().toISOString() });
    } catch (err) {
      return reply.code(500).send({ error: 'Provider Error', message: err.message });
    }
  });

  // ─── GET /queue ─── Queue stats ──────────────────────────────────
  fastify.get('/queue', {
    schema: {
      tags: ['Analytics'],
      summary: 'Real-time queue statistics',
    },
  }, async (request, reply) => {
    try {
      const [queueStats, providerHealth] = await Promise.all([
        getQueueStats(),
        getProviderHealth(),
      ]);

      return reply.send({
        queues: queueStats,
        providers: providerHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.code(500).send({ error: 'Queue Error', message: err.message });
    }
  });

  // ─── GET /health ─── System health ────────────────────────────────
  fastify.get('/health', {
    schema: {
      tags: ['Analytics'],
      summary: 'System health status',
    },
  }, async (request, reply) => {
    const { checkSupabaseHealth } = require('../config/supabase');
    const { checkRedisHealth } = require('../config/redis');

    const [supabaseOk, redisOk] = await Promise.all([
      checkSupabaseHealth(),
      checkRedisHealth(),
    ]);

    let queueStats = null;
    let providerHealth = null;

    try {
      [queueStats, providerHealth] = await Promise.all([getQueueStats(), getProviderHealth()]);
    } catch (err) {
      request.log.warn({ err }, 'Failed to get queue/provider health');
    }

    const overall = supabaseOk && redisOk ? 'ok' : 'degraded';

    return reply.code(overall === 'ok' ? 200 : 503).send({
      status: overall,
      timestamp: new Date().toISOString(),
      services: {
        supabase: supabaseOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down',
        queues: queueStats ? 'ok' : 'unknown',
        providers: providerHealth?.status || 'unknown',
      },
      queues: queueStats,
      providers: providerHealth,
    });
  });
}

module.exports = analyticsRoutes;
