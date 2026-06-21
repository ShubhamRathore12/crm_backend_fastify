'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function interactionsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('interactions'));

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
          search: { type: 'string' },
          contact_id: { type: 'string', format: 'uuid' },
          channel: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          created_after: { type: 'string', format: 'date-time' },
          created_before: { type: 'string', format: 'date-time' },
          sort: { type: 'string', default: 'created_at' },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 50,
      search,
      contact_id,
      channel,
      status,
      priority,
      assigned_to,
      created_after,
      created_before,
      sort = 'created_at',
      order = 'desc',
    } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (search) {
        whereConditions.push(`subject ILIKE $${params.length + 1}`);
        params.push(`%${search}%`);
      }
      if (contact_id) {
        whereConditions.push(`contact_id = $${params.length + 1}`);
        params.push(contact_id);
      }
      if (channel) {
        whereConditions.push(`channel = $${params.length + 1}`);
        params.push(channel);
      }
      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }
      if (priority) {
        whereConditions.push(`priority = $${params.length + 1}`);
        params.push(priority);
      }
      if (assigned_to) {
        whereConditions.push(`assigned_to = $${params.length + 1}`);
        params.push(assigned_to);
      }
      if (created_after) {
        whereConditions.push(`created_at >= $${params.length + 1}`);
        params.push(created_after);
      }
      if (created_before) {
        whereConditions.push(`created_at <= $${params.length + 1}`);
        params.push(created_before);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM interactions${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering (with contact info via JOIN)
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT i.*, c.name as contact_name, c.email as contact_email FROM interactions i LEFT JOIN contacts c ON i.contact_id = c.id${whereClause} ORDER BY i.${sort} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) }
      });
    } catch (error) {
      console.error('[Interactions] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
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
