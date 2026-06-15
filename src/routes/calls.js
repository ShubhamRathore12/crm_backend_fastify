'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function callsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/stats', {
    schema: { tags: ['Calls'], summary: 'Call statistics' },
  }, async (request, reply) => {
    const { data } = await supabase.from('call_logs').select('direction, status, duration_seconds');
    const calls = data || [];
    const byDirection = {}, byStatus = {};
    let totalDuration = 0;
    calls.forEach(c => {
      byDirection[c.direction] = (byDirection[c.direction] || 0) + 1;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      totalDuration += c.duration_seconds || 0;
    });
    return reply.send({
      total: calls.length, byDirection, byStatus,
      avgDuration: calls.length > 0 ? (totalDuration / calls.length).toFixed(0) : 0,
      totalDuration,
    });
  });

  fastify.get('/agent/:agentId', {
    schema: { tags: ['Calls'], summary: 'Get calls for agent',
      params: { type: 'object', properties: { agentId: { type: 'string', format: 'uuid' } }, required: ['agentId'] },
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;
    const { data, error, count } = await supabase.from('call_logs')
      .select('*', { count: 'exact' }).eq('agent_id', request.params.agentId)
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/', {
    schema: {
      tags: ['Calls'], summary: 'List call logs',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        direction: { type: 'string' }, status: { type: 'string' },
        agent_id: { type: 'string', format: 'uuid' }, contact_id: { type: 'string', format: 'uuid' },
        lead_id: { type: 'string', format: 'uuid' }, from_date: { type: 'string' }, to_date: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, direction, status, agent_id, contact_id, lead_id, from_date, to_date } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();
      const params = [];
      const whereConditions = [];

      if (direction) {
        whereConditions.push(`direction = $${params.length + 1}`);
        params.push(direction);
      }
      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }
      if (agent_id) {
        whereConditions.push(`agent_id = $${params.length + 1}`);
        params.push(agent_id);
      }
      if (contact_id) {
        whereConditions.push(`contact_id = $${params.length + 1}`);
        params.push(contact_id);
      }
      if (lead_id) {
        whereConditions.push(`lead_id = $${params.length + 1}`);
        params.push(lead_id);
      }
      if (from_date) {
        whereConditions.push(`created_at >= $${params.length + 1}`);
        params.push(from_date);
      }
      if (to_date) {
        whereConditions.push(`created_at <= $${params.length + 1}`);
        params.push(to_date);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM call_logs${whereClause}`;
      const countResult = await db.query(countQuery, params.slice(0, whereConditions.length));
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data
      const sql = `SELECT * FROM call_logs${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit), hasNext: offset + limit < count, hasPrev: page > 1 }
      });
    } catch (error) {
      console.error('[Calls] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Calls'], summary: 'Get call log',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('call_logs').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Calls'], summary: 'Create call log',
      body: { type: 'object', required: ['direction', 'status'],
        properties: {
          call_id: { type: 'string' }, direction: { type: 'string' },
          from_number: { type: 'string' }, to_number: { type: 'string' },
          duration_seconds: { type: 'integer' }, status: { type: 'string' },
          agent_id: { type: 'string', format: 'uuid' }, contact_id: { type: 'string', format: 'uuid' },
          lead_id: { type: 'string', format: 'uuid' }, recording_url: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('call_logs')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    schema: { tags: ['Calls'], summary: 'Update call log',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        duration_seconds: { type: 'integer' }, status: { type: 'string' }, recording_url: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('call_logs').update(request.body).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Calls'], summary: 'Delete call log',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('call_logs').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });
}

module.exports = callsRoutes;
