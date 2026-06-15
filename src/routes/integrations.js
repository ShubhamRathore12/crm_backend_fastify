'use strict';

const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function integrationsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── Integration Connections ─────────────────────────────────────
  fastify.get('/', {
    schema: { tags: ['Integrations'], summary: 'List integration connections' },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const sql = 'SELECT * FROM integration_connections ORDER BY created_at DESC';
      const result = await db.query(sql);
      return reply.send({ data: result.rows || [] });
    } catch (error) {
      console.error('[Integrations] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Integrations'], summary: 'Get integration',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('integration_connections').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Integrations'], summary: 'Create integration',
      body: { type: 'object', required: ['provider', 'name'],
        properties: {
          provider: { type: 'string' }, name: { type: 'string' },
          config: { type: 'object' }, is_active: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('integration_connections')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    schema: {
      tags: ['Integrations'], summary: 'Update integration',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        name: { type: 'string' }, config: { type: 'object' }, is_active: { type: 'boolean' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('integration_connections')
      .update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Integrations'], summary: 'Deactivate integration',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('integration_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', request.params.id);
    return reply.send({ message: 'Integration deactivated' });
  });

  fastify.put('/:id/activate', {
    schema: { tags: ['Integrations'], summary: 'Activate integration',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('integration_connections')
      .update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.put('/:id/deactivate', {
    schema: { tags: ['Integrations'], summary: 'Deactivate integration',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('integration_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── Field Definitions ───────────────────────────────────────────
  fastify.get('/fields', {
    schema: {
      tags: ['Integrations'], summary: 'List field definitions',
      querystring: { type: 'object', properties: { entity_type: { type: 'string' } } },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const params = [];
      const whereConditions = [];

      if (request.query.entity_type) {
        whereConditions.push(`entity_type = $${params.length + 1}`);
        params.push(request.query.entity_type);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';
      const sql = `SELECT * FROM field_definitions${whereClause} ORDER BY display_order`;

      const result = await db.query(sql, params);
      return reply.send({ data: result.rows || [] });
    } catch (error) {
      console.error('[Integrations] GET /fields error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/fields/entity/:entityType', {
    schema: { tags: ['Integrations'], summary: 'Get fields for entity type',
      params: { type: 'object', properties: { entityType: { type: 'string' } }, required: ['entityType'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('field_definitions')
      .select('*').eq('entity_type', request.params.entityType).order('display_order');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  fastify.get('/fields/:id', {
    schema: { tags: ['Integrations'], summary: 'Get field definition',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('field_definitions').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/fields', {
    schema: {
      tags: ['Integrations'], summary: 'Create field definition',
      body: { type: 'object', required: ['entity_type', 'field_name', 'label', 'field_type'],
        properties: {
          entity_type: { type: 'string' }, field_name: { type: 'string' },
          label: { type: 'string' }, field_type: { type: 'string' },
          options: { type: 'object' }, is_required: { type: 'boolean', default: false },
          is_system: { type: 'boolean', default: false }, display_order: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('field_definitions')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/fields/:id', {
    schema: {
      tags: ['Integrations'], summary: 'Update field definition',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        label: { type: 'string' }, field_type: { type: 'string' },
        options: { type: 'object' }, is_required: { type: 'boolean' }, display_order: { type: 'integer' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('field_definitions')
      .update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/fields/:id', {
    schema: { tags: ['Integrations'], summary: 'Delete field definition',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('field_definitions').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  fastify.put('/fields/reorder', {
    schema: {
      tags: ['Integrations'], summary: 'Reorder field definitions',
      body: {
        type: 'object', required: ['fields'],
        properties: {
          fields: { type: 'array', items: {
            type: 'object', required: ['id', 'display_order'],
            properties: { id: { type: 'string', format: 'uuid' }, display_order: { type: 'integer' } },
          } },
        },
      },
    },
  }, async (request, reply) => {
    const { fields } = request.body;
    const now = new Date().toISOString();
    for (const field of fields) {
      await supabase.from('field_definitions').update({ display_order: field.display_order, updated_at: now }).eq('id', field.id);
    }
    return reply.send({ updated: fields.length });
  });
}

module.exports = integrationsRoutes;
