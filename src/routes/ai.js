'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

async function aiRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── AI Configuration ────────────────────────────────────────────
  fastify.get('/config', {
    schema: { tags: ['AI'], summary: 'List AI configurations' },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const sql = 'SELECT * FROM ai_configuration ORDER BY feature_name ASC';
      const result = await db.query(sql);
      return reply.send({ data: result.rows || [] });
    } catch (error) {
      console.error('[AI] GET /config error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/config/:id', {
    schema: { tags: ['AI'], summary: 'Get AI config',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('ai_configuration').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/config', {
    schema: {
      tags: ['AI'], summary: 'Create AI config',
      body: { type: 'object', required: ['feature_name'],
        properties: {
          feature_name: { type: 'string' }, is_enabled: { type: 'boolean', default: false },
          configuration: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('ai_configuration')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/config/:id', {
    schema: {
      tags: ['AI'], summary: 'Update AI config',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        feature_name: { type: 'string' }, is_enabled: { type: 'boolean' }, configuration: { type: 'object' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('ai_configuration')
      .update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── Sales Predictions ───────────────────────────────────────────
  fastify.get('/predictions', {
    schema: {
      tags: ['AI'], summary: 'List sales predictions',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;
    try {
      const db = getPostgresClient();

      // Get total count
      const countResult = await db.query('SELECT COUNT(*) as count FROM sales_predictions');
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const sql = 'SELECT * FROM sales_predictions ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      const result = await db.query(sql, [limit, offset]);

      return reply.send({
        data: result.rows || [],
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit),
          hasNext: offset + limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error('[AI] GET /predictions error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/predictions/latest', {
    schema: { tags: ['AI'], summary: 'Get latest prediction' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_predictions')
      .select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  fastify.post('/predictions', {
    schema: {
      tags: ['AI'], summary: 'Create prediction',
      body: { type: 'object', required: ['period_days', 'predicted_revenue'],
        properties: {
          period_days: { type: 'integer' }, predicted_revenue: { type: 'number' },
          predicted_deals: { type: 'integer' }, confidence: { type: 'number' },
          factors: { type: 'object' }, model_version: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_predictions')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── Model Retraining Logs ───────────────────────────────────────
  fastify.get('/models/logs', {
    schema: {
      tags: ['AI'], summary: 'List model retraining logs',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        model_type: { type: 'string' }, status: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, model_type, status } = request.query;
    const offset = (page - 1) * limit;
    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (model_type) {
        whereConditions.push(`model_type = $${params.length + 1}`);
        params.push(model_type);
      }
      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM model_retraining_logs${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const sql = `SELECT * FROM model_retraining_logs${whereClause} ORDER BY started_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit),
          hasNext: offset + limit < count,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error('[AI] GET /models/logs error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/models/logs/:id', {
    schema: { tags: ['AI'], summary: 'Get retraining log',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('model_retraining_logs').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/models/retrain', {
    schema: {
      tags: ['AI'], summary: 'Create retraining log entry',
      body: { type: 'object', required: ['model_type'],
        properties: {
          model_type: { type: 'string' }, status: { type: 'string', default: 'started' },
          model_version: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('model_retraining_logs')
      .insert({ id: uuidv4(), ...request.body, started_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/models/logs/:id', {
    schema: {
      tags: ['AI'], summary: 'Update retraining log',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        status: { type: 'string' }, completed_at: { type: 'string', format: 'date-time' },
        error_message: { type: 'string' }, metrics: { type: 'object' }, model_version: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('model_retraining_logs')
      .update(request.body).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── AI Performance Metrics ──────────────────────────────────────
  fastify.get('/performance', {
    schema: { tags: ['AI'], summary: 'Get AI performance metrics (view)' },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const sql = 'SELECT * FROM ai_performance_metrics';
      const result = await db.query(sql);
      return reply.send({ data: result.rows || [] });
    } catch (error) {
      console.error('[AI] GET /performance error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });
}

module.exports = aiRoutes;
