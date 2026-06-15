'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function workflowsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /stats ──────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: { tags: ['Workflows'], summary: 'Workflow statistics (from view)' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_stats').select('*');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── GET / ───────────────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Workflows'], summary: 'List workflows',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          category: { type: 'string' }, active: { type: 'boolean' }, trigger: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, category, active, trigger } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (category) {
        whereConditions.push(`category = $${params.length + 1}`);
        params.push(category);
      }
      if (active !== undefined) {
        whereConditions.push(`active = $${params.length + 1}`);
        params.push(active);
      }
      if (trigger) {
        whereConditions.push(`trigger = $${params.length + 1}`);
        params.push(trigger);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM workflows${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const sql = `SELECT * FROM workflows${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) }
      });
    } catch (error) {
      console.error('[Workflows] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ─── GET /:id ────────────────────────────────────────────────────
  fastify.get('/:id', {
    schema: { tags: ['Workflows'], summary: 'Get workflow with triggers and schedules',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const id = request.params.id;
    const [wfRes, triggersRes, schedulesRes] = await Promise.all([
      supabase.from('workflows').select('*').eq('id', id).single(),
      supabase.from('workflow_triggers').select('*').eq('workflow_id', id),
      supabase.from('workflow_schedules').select('*').eq('workflow_id', id),
    ]);
    if (wfRes.error || !wfRes.data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data: { ...wfRes.data, triggers: triggersRes.data || [], schedules: schedulesRes.data || [] } });
  });

  // ─── POST / ──────────────────────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Workflows'], summary: 'Create workflow',
      body: {
        type: 'object', required: ['name', 'trigger'],
        properties: {
          name: { type: 'string' }, trigger: { type: 'string' },
          definition_json: { type: 'object' }, active: { type: 'boolean', default: false },
          category: { type: 'string' }, priority: { type: 'string' },
          description: { type: 'string' }, tenant_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflows')
      .insert({ id: uuidv4(), ...request.body, version: 1, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── PUT /:id ────────────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Workflows'], summary: 'Update workflow (increments version)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' }, trigger: { type: 'string' },
          definition_json: { type: 'object' }, category: { type: 'string' },
          priority: { type: 'string' }, description: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data: existing } = await supabase.from('workflows').select('version').eq('id', request.params.id).single();
    if (!existing) return reply.code(404).send({ error: 'Not Found' });

    const { data, error } = await supabase.from('workflows')
      .update({ ...request.body, version: (existing.version || 0) + 1 })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── Activate/Deactivate ─────────────────────────────────────────
  fastify.put('/:id/activate', {
    schema: { tags: ['Workflows'], summary: 'Activate workflow',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflows').update({ active: true }).eq('id', request.params.id).select().single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.put('/:id/deactivate', {
    schema: { tags: ['Workflows'], summary: 'Deactivate workflow',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflows').update({ active: false }).eq('id', request.params.id).select().single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Workflows'], summary: 'Delete workflow',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('workflows').update({ active: false }).eq('id', request.params.id);
    return reply.send({ message: 'Workflow deactivated' });
  });

  // ─── Runs ─────────────────────────────────────────────────────────
  fastify.get('/:id/runs', {
    schema: {
      tags: ['Workflows'], summary: 'List workflow runs',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, status } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('workflow_runs').select('*', { count: 'exact' })
      .eq('workflow_id', request.params.id).range(offset, offset + limit - 1)
      .order('started_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/:id/runs/:runId', {
    schema: { tags: ['Workflows'], summary: 'Get run with node executions',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, runId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'runId'] } },
  }, async (request, reply) => {
    const [runRes, nodesRes] = await Promise.all([
      supabase.from('workflow_runs').select('*').eq('id', request.params.runId).single(),
      supabase.from('workflow_node_executions').select('*').eq('workflow_run_id', request.params.runId).order('executed_at'),
    ]);
    if (runRes.error || !runRes.data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data: { ...runRes.data, node_executions: nodesRes.data || [] } });
  });

  fastify.post('/:id/trigger', {
    schema: {
      tags: ['Workflows'], summary: 'Manually trigger workflow',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', format: 'uuid' }, entity_type: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_runs').insert({
      id: uuidv4(), workflow_id: request.params.id,
      entity_id: request.body.entity_id || null, entity_type: request.body.entity_type || null,
      status: 'pending', started_at: new Date().toISOString(),
    }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── Triggers CRUD ───────────────────────────────────────────────
  fastify.get('/:id/triggers', {
    schema: { tags: ['Workflows'], summary: 'Get triggers',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data } = await supabase.from('workflow_triggers').select('*').eq('workflow_id', request.params.id);
    return reply.send({ data: data || [] });
  });

  fastify.post('/:id/triggers', {
    schema: {
      tags: ['Workflows'], summary: 'Create trigger',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['trigger_type'],
        properties: { trigger_type: { type: 'string' }, trigger_config: { type: 'object' }, active: { type: 'boolean', default: true } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_triggers').insert({
      id: uuidv4(), workflow_id: request.params.id, ...request.body, created_at: new Date().toISOString(),
    }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id/triggers/:triggerId', {
    schema: { tags: ['Workflows'], summary: 'Update trigger',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, triggerId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'triggerId'] },
      body: { type: 'object', properties: { trigger_type: { type: 'string' }, trigger_config: { type: 'object' }, active: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_triggers').update(request.body).eq('id', request.params.triggerId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  fastify.delete('/:id/triggers/:triggerId', {
    schema: { tags: ['Workflows'], summary: 'Delete trigger',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, triggerId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'triggerId'] } },
  }, async (request, reply) => {
    await supabase.from('workflow_triggers').delete().eq('id', request.params.triggerId);
    return reply.code(204).send();
  });

  // ─── Schedules CRUD ──────────────────────────────────────────────
  fastify.get('/:id/schedules', {
    schema: { tags: ['Workflows'], summary: 'Get schedules',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data } = await supabase.from('workflow_schedules').select('*').eq('workflow_id', request.params.id);
    return reply.send({ data: data || [] });
  });

  fastify.post('/:id/schedules', {
    schema: {
      tags: ['Workflows'], summary: 'Create schedule',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['schedule_type'],
        properties: {
          schedule_type: { type: 'string' }, schedule_config: { type: 'object' },
          next_run: { type: 'string', format: 'date-time' }, active: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_schedules').insert({
      id: uuidv4(), workflow_id: request.params.id, ...request.body, created_at: new Date().toISOString(),
    }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id/schedules/:scheduleId', {
    schema: { tags: ['Workflows'], summary: 'Update schedule',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, scheduleId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'scheduleId'] },
      body: { type: 'object', properties: {
        schedule_type: { type: 'string' }, schedule_config: { type: 'object' },
        next_run: { type: 'string', format: 'date-time' }, active: { type: 'boolean' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('workflow_schedules').update(request.body).eq('id', request.params.scheduleId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  fastify.delete('/:id/schedules/:scheduleId', {
    schema: { tags: ['Workflows'], summary: 'Delete schedule',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, scheduleId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'scheduleId'] } },
  }, async (request, reply) => {
    await supabase.from('workflow_schedules').delete().eq('id', request.params.scheduleId);
    return reply.code(204).send();
  });
}

module.exports = workflowsRoutes;
