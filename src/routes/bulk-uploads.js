'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function bulkUploadsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/stats', {
    schema: { tags: ['Bulk Uploads'], summary: 'Upload statistics' },
  }, async (request, reply) => {
    const { data } = await supabase.from('bulk_uploads').select('status, entity_type, total_rows, processed_rows, failed_rows');
    const uploads = data || [];
    const byStatus = {}, byEntity = {};
    uploads.forEach(u => {
      byStatus[u.status] = (byStatus[u.status] || 0) + 1;
      byEntity[u.entity_type] = (byEntity[u.entity_type] || 0) + 1;
    });
    return reply.send({ total: uploads.length, byStatus, byEntity });
  });

  fastify.get('/', {
    schema: {
      tags: ['Bulk Uploads'], summary: 'List uploads',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        entity_type: { type: 'string' }, status: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, entity_type, status } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();
      const params = [];
      const whereConditions = [];

      if (entity_type) {
        whereConditions.push(`entity_type = $${params.length + 1}`);
        params.push(entity_type);
      }
      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM bulk_uploads${whereClause}`;
      const countResult = await db.query(countQuery, params.slice(0, whereConditions.length));
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data
      const sql = `SELECT * FROM bulk_uploads${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit), hasNext: offset + limit < count, hasPrev: page > 1 }
      });
    } catch (error) {
      console.error('[Bulk Uploads] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Bulk Uploads'], summary: 'Get upload details',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('bulk_uploads').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Bulk Uploads'], summary: 'Create upload record',
      body: { type: 'object', required: ['file_name', 'entity_type'],
        properties: {
          file_name: { type: 'string' }, entity_type: { type: 'string' },
          status: { type: 'string', default: 'pending' }, total_rows: { type: 'integer' },
          created_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('bulk_uploads')
      .insert({ id: uuidv4(), ...request.body, processed_rows: 0, failed_rows: 0, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    schema: {
      tags: ['Bulk Uploads'], summary: 'Update upload progress',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        status: { type: 'string' }, processed_rows: { type: 'integer' }, failed_rows: { type: 'integer' },
        error_log: { type: 'string' }, completed_at: { type: 'string', format: 'date-time' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('bulk_uploads').update(request.body).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Bulk Uploads'], summary: 'Delete upload record',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('bulk_uploads').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });
}

module.exports = bulkUploadsRoutes;
