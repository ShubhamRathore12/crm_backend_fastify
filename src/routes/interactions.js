'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

async function interactionsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /insights ───────────────────────────────────────────────
  fastify.get('/insights', {
    schema: {
      tags: ['Interactions'],
      summary: 'Get conversation insights',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase.from('conversation_insights')
      .select('*', { count: 'exact' }).order('analyzed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  // ─── GET /stats ──────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: { tags: ['Interactions'], summary: 'Interaction statistics' },
  }, async (request, reply) => {
    const { data } = await supabase.from('interactions').select('channel, status, priority');
    const interactions = data || [];

    const byChannel = {}, byStatus = {}, byPriority = {};
    interactions.forEach(i => {
      byChannel[i.channel] = (byChannel[i.channel] || 0) + 1;
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
      byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;
    });

    return reply.send({ total: interactions.length, byChannel, byStatus, byPriority });
  });

  // ─── GET / ─── List interactions ─────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Interactions'],
      summary: 'List interactions',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          contact_id: { type: 'string', format: 'uuid' },
          channel: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          sort: { type: 'string', default: 'created_at' },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, contact_id, channel, status, priority, assigned_to, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('interactions')
      .select('*, contacts(name, email)', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order(sort, { ascending: order === 'asc' });

    if (contact_id) query = query.eq('contact_id', contact_id);
    if (channel) query = query.eq('channel', channel);
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  // ─── GET /:id ────────────────────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Interactions'],
      summary: 'Get interaction with messages, escalations, analysis',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const id = request.params.id;
    const [interactionRes, messagesRes, escalationsRes, analysisRes] = await Promise.all([
      supabase.from('interactions').select('*, contacts(name, email, mobile)').eq('id', id).single(),
      supabase.from('messages').select('*').eq('interaction_id', id).order('created_at', { ascending: true }),
      supabase.from('escalations').select('*').eq('interaction_id', id).order('created_at', { ascending: false }),
      supabase.from('conversation_analyses').select('*').eq('interaction_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

    if (interactionRes.error || !interactionRes.data) {
      return reply.code(404).send({ error: 'Not Found', message: 'Interaction not found' });
    }

    return reply.send({
      data: {
        ...interactionRes.data,
        messages: messagesRes.data || [],
        escalations: escalationsRes.data || [],
        analysis: (analysisRes.data || [])[0] || null,
      },
    });
  });

  // ─── POST / ──────────────────────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Interactions'],
      summary: 'Create interaction',
      body: {
        type: 'object',
        required: ['contact_id', 'channel'],
        properties: {
          contact_id: { type: 'string', format: 'uuid' },
          channel: { type: 'string' },
          subject: { type: 'string' },
          status: { type: 'string', default: 'open' },
          priority: { type: 'string', default: 'normal' },
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('interactions')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── PUT /:id ────────────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Interactions'],
      summary: 'Update interaction',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          channel: { type: 'string' }, subject: { type: 'string' },
          status: { type: 'string' }, priority: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('interactions')
      .update(request.body).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── DELETE /:id ─────────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Interactions'],
      summary: 'Archive interaction',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data: interaction } = await supabase.from('interactions').select('*').eq('id', request.params.id).single();
    if (!interaction) return reply.code(404).send({ error: 'Not Found' });
    await supabase.from('interactions_archive').insert({ ...interaction, archived_at: new Date().toISOString() });
    await supabase.from('interactions').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  // ─── Messages ────────────────────────────────────────────────────
  fastify.get('/:id/messages', {
    schema: { tags: ['Interactions'], summary: 'Get messages for interaction',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('messages')
      .select('*').eq('interaction_id', request.params.id).order('created_at', { ascending: true });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  fastify.post('/:id/messages', {
    schema: {
      tags: ['Interactions'], summary: 'Add message',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['sender', 'content'],
        properties: { sender: { type: 'string' }, content: { type: 'string' }, channel: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('messages')
      .insert({ id: uuidv4(), interaction_id: request.params.id, ...request.body, created_at: new Date().toISOString() })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── Escalations ─────────────────────────────────────────────────
  fastify.get('/:id/escalations', {
    schema: { tags: ['Interactions'], summary: 'Get escalations',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('escalations')
      .select('*').eq('interaction_id', request.params.id).order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  fastify.post('/:id/escalate', {
    schema: {
      tags: ['Interactions'], summary: 'Create escalation',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['level'],
        properties: {
          level: { type: 'integer' }, assigned_to: { type: 'string', format: 'uuid' },
          deadline: { type: 'string', format: 'date-time' }, status: { type: 'string', default: 'pending' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('escalations')
      .insert({ id: uuidv4(), interaction_id: request.params.id, ...request.body, created_at: new Date().toISOString() })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Update interaction priority
    await supabase.from('interactions').update({ priority: 'high' }).eq('id', request.params.id);
    return reply.code(201).send({ data });
  });

  fastify.put('/:id/escalations/:escalationId', {
    schema: {
      tags: ['Interactions'], summary: 'Update escalation',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, escalationId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'escalationId'] },
      body: {
        type: 'object',
        properties: { status: { type: 'string' }, assigned_to: { type: 'string', format: 'uuid' }, deadline: { type: 'string', format: 'date-time' } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('escalations')
      .update(request.body).eq('id', request.params.escalationId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── Analysis ─────────────────────────────────────────────────────
  fastify.get('/:id/analysis', {
    schema: { tags: ['Interactions'], summary: 'Get conversation analysis',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('conversation_analyses')
      .select('*').eq('interaction_id', request.params.id).order('created_at', { ascending: false }).limit(1);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: (data || [])[0] || null });
  });

  fastify.post('/:id/analyze', {
    schema: {
      tags: ['Interactions'], summary: 'Create conversation analysis',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          sentiment: { type: 'number' }, engagement_score: { type: 'number' },
          key_topics: { type: 'object' }, intent_detected: { type: 'string' },
          next_best_action: { type: 'string' }, response_suggestions: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('conversation_analyses')
      .insert({ id: uuidv4(), interaction_id: request.params.id, ...request.body, analyzed_at: now, created_at: now })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });
}

module.exports = interactionsRoutes;
