'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

async function salesFormsRoutes(fastify, opts) {
  // Stats requires auth
  fastify.get('/stats', {
    preHandler: authenticate,
    schema: { tags: ['Sales Forms'], summary: 'Form statistics' },
  }, async (request, reply) => {
    const [formsRes, subsRes] = await Promise.all([
      supabase.from('sales_forms').select('id, is_active', { count: 'exact' }),
      supabase.from('sales_form_submissions').select('status', { count: 'exact' }),
    ]);
    const byStatus = {};
    (subsRes.data || []).forEach(s => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
    return reply.send({
      totalForms: formsRes.count || 0,
      activeForms: (formsRes.data || []).filter(f => f.is_active).length,
      totalSubmissions: subsRes.count || 0,
      submissionsByStatus: byStatus,
    });
  });

  // Authenticated CRUD
  fastify.get('/', {
    preHandler: authenticate,
    schema: {
      tags: ['Sales Forms'], summary: 'List forms',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        is_active: { type: 'boolean' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, is_active } = request.query;
    const offset = (page - 1) * limit;
    let query = supabase.from('sales_forms').select('*', { count: 'exact' })
      .range(offset, offset + limit - 1).order('created_at', { ascending: false });
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/:id', {
    preHandler: authenticate,
    schema: { tags: ['Sales Forms'], summary: 'Get form with submission count',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const [formRes, subsCount] = await Promise.all([
      supabase.from('sales_forms').select('*').eq('id', request.params.id).single(),
      supabase.from('sales_form_submissions').select('id', { count: 'exact', head: true }).eq('form_id', request.params.id),
    ]);
    if (formRes.error || !formRes.data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data: { ...formRes.data, submission_count: subsCount.count || 0 } });
  });

  fastify.post('/', {
    preHandler: authenticate,
    schema: {
      tags: ['Sales Forms'], summary: 'Create form',
      body: { type: 'object', required: ['name'],
        properties: {
          name: { type: 'string' }, description: { type: 'string' }, fields_json: { type: 'object' },
          is_active: { type: 'boolean', default: true }, created_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('sales_forms')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    preHandler: authenticate,
    schema: {
      tags: ['Sales Forms'], summary: 'Update form',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: {
        name: { type: 'string' }, description: { type: 'string' }, fields_json: { type: 'object' }, is_active: { type: 'boolean' },
      } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_forms')
      .update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    preHandler: authenticate,
    schema: { tags: ['Sales Forms'], summary: 'Deactivate form',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('sales_forms').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', request.params.id);
    return reply.send({ message: 'Form deactivated' });
  });

  // ─── Submissions ──────────────────────────────────────────────────
  fastify.get('/:id/submissions', {
    preHandler: authenticate,
    schema: {
      tags: ['Sales Forms'], summary: 'List form submissions',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        status: { type: 'string' },
      } },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, status } = request.query;
    const offset = (page - 1) * limit;
    let query = supabase.from('sales_form_submissions').select('*', { count: 'exact' })
      .eq('form_id', request.params.id).range(offset, offset + limit - 1).order('submitted_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/:id/submissions/:submissionId', {
    preHandler: authenticate,
    schema: { tags: ['Sales Forms'], summary: 'Get submission',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'submissionId'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_form_submissions').select('*').eq('id', request.params.submissionId).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // Public endpoint - no auth
  fastify.post('/:id/submissions', {
    schema: {
      tags: ['Sales Forms'], summary: 'Submit form (public)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', required: ['data_json'],
        properties: { data_json: { type: 'object' } },
      },
    },
  }, async (request, reply) => {
    // Verify form exists and is active
    const { data: form } = await supabase.from('sales_forms').select('id, is_active').eq('id', request.params.id).single();
    if (!form) return reply.code(404).send({ error: 'Not Found', message: 'Form not found' });
    if (!form.is_active) return reply.code(400).send({ error: 'Form Inactive', message: 'This form is no longer accepting submissions' });

    const { data, error } = await supabase.from('sales_form_submissions')
      .insert({ id: uuidv4(), form_id: request.params.id, data_json: request.body.data_json, status: 'new', submitted_at: new Date().toISOString() })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id/submissions/:submissionId', {
    preHandler: authenticate,
    schema: {
      tags: ['Sales Forms'], summary: 'Update submission status',
      params: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid' },
      }, required: ['id', 'submissionId'] },
      body: { type: 'object', properties: { status: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_form_submissions')
      .update(request.body).eq('id', request.params.submissionId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });
}

module.exports = salesFormsRoutes;
