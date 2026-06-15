'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function attachmentsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/entity/:entityType/:entityId', {
    schema: {
      tags: ['Attachments'], summary: 'Get attachments for entity',
      params: { type: 'object', properties: {
        entityType: { type: 'string' }, entityId: { type: 'string', format: 'uuid' },
      }, required: ['entityType', 'entityId'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('attachments')
      .select('*').eq('entity_type', request.params.entityType)
      .eq('entity_id', request.params.entityId).order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  fastify.get('/', {
    schema: {
      tags: ['Attachments'], summary: 'List attachments',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        entity_type: { type: 'string' }, entity_id: { type: 'string', format: 'uuid' },
        uploaded_by: { type: 'string', format: 'uuid' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, entity_type, entity_id, uploaded_by } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();
      const params = [];
      const whereConditions = [];

      if (entity_type) {
        whereConditions.push(`entity_type = $${params.length + 1}`);
        params.push(entity_type);
      }
      if (entity_id) {
        whereConditions.push(`entity_id = $${params.length + 1}`);
        params.push(entity_id);
      }
      if (uploaded_by) {
        whereConditions.push(`uploaded_by = $${params.length + 1}`);
        params.push(uploaded_by);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM attachments${whereClause}`;
      const countResult = await db.query(countQuery, params.slice(0, whereConditions.length));
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data
      const sql = `SELECT * FROM attachments${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit), hasNext: offset + limit < count, hasPrev: page > 1 }
      });
    } catch (error) {
      console.error('[Attachments] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Attachments'], summary: 'Get attachment',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('attachments').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Attachments'], summary: 'Create attachment record',
      body: { type: 'object', required: ['file_name', 'file_path', 'entity_type', 'entity_id'],
        properties: {
          file_name: { type: 'string' }, file_type: { type: 'string' }, file_size: { type: 'integer' },
          file_path: { type: 'string' }, entity_type: { type: 'string' },
          entity_id: { type: 'string', format: 'uuid' }, uploaded_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('attachments')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Attachments'], summary: 'Delete attachment',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('attachments').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });
}

module.exports = attachmentsRoutes;
