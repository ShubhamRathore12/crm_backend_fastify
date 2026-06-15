'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function emailSendsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/stats', {
    schema: { tags: ['Email Sends'], summary: 'Email send statistics' },
  }, async (request, reply) => {
    const { data, count } = await supabase.from('email_sends').select('read_at', { count: 'exact' });
    const readCount = (data || []).filter(e => e.read_at).length;
    return reply.send({
      total: count || 0, read: readCount,
      readRate: count > 0 ? (readCount / count * 100).toFixed(2) + '%' : '0%',
    });
  });

  fastify.get('/', {
    schema: {
      tags: ['Email Sends'], summary: 'List email sends',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        entity_type: { type: 'string' }, entity_id: { type: 'string', format: 'uuid' },
        search: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, entity_type, entity_id, search } = request.query;
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
      if (search) {
        whereConditions.push(`(to_email ILIKE $${params.length + 1} OR subject ILIKE $${params.length + 1})`);
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM email_sends${whereClause}`;
      const countResult = await db.query(countQuery, params.slice(0, whereConditions.length));
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data
      const sql = `SELECT * FROM email_sends${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit), hasNext: offset + limit < count, hasPrev: page > 1 }
      });
    } catch (error) {
      console.error('[Email Sends] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Email Sends'], summary: 'Get email send',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('email_sends').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Email Sends'], summary: 'Create email send record',
      body: { type: 'object', required: ['to_email', 'subject'],
        properties: {
          to_email: { type: 'string' }, subject: { type: 'string' },
          entity_type: { type: 'string' }, entity_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('email_sends')
      .insert({ id: uuidv4(), tracking_id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id/read', {
    schema: { tags: ['Email Sends'], summary: 'Mark email as read',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('email_sends')
      .update({ read_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── Meeting Invites ─────────────────────────────────────────────
  fastify.get('/meetings', {
    schema: {
      tags: ['Email Sends'], summary: 'List meeting invites',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        contact_id: { type: 'string', format: 'uuid' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, contact_id } = request.query;
    const offset = (page - 1) * limit;
    let query = supabase.from('meeting_invites').select('*', { count: 'exact' })
      .range(offset, offset + limit - 1).order('created_at', { ascending: false });
    if (contact_id) query = query.eq('contact_id', contact_id);
    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/meetings/:id', {
    schema: { tags: ['Email Sends'], summary: 'Get meeting invite',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('meeting_invites').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/meetings', {
    schema: {
      tags: ['Email Sends'], summary: 'Create meeting invite',
      body: { type: 'object', required: ['contact_id', 'to_email', 'subject'],
        properties: {
          contact_id: { type: 'string', format: 'uuid' }, to_email: { type: 'string' },
          subject: { type: 'string' }, calendly_link: { type: 'string' },
          email_send_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('meeting_invites')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });
}

module.exports = emailSendsRoutes;
