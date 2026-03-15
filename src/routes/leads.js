'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

async function leadsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /stats ──────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: { tags: ['Leads'], summary: 'Lead statistics' },
  }, async (request, reply) => {
    const { data: leads } = await supabase.from('leads').select('status, stage, source');

    const byStatus = {}, byStage = {}, bySource = {};
    (leads || []).forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byStage[l.stage] = (byStage[l.stage] || 0) + 1;
      bySource[l.source] = (bySource[l.source] || 0) + 1;
    });

    return reply.send({ total: (leads || []).length, byStatus, byStage, bySource });
  });

  // ─── GET /high-priority ──────────────────────────────────────────
  fastify.get('/high-priority', {
    schema: {
      tags: ['Leads'],
      summary: 'Get high priority leads',
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

    const { data, error, count } = await supabase
      .from('high_priority_leads')
      .select('*', { count: 'exact' })
      .order('score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  // ─── GET /scoring-factors ────────────────────────────────────────
  fastify.get('/scoring-factors', {
    schema: { tags: ['Leads'], summary: 'List scoring factors' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_scoring_factors').select('*').order('weight', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── POST /scoring-factors ───────────────────────────────────────
  fastify.post('/scoring-factors', {
    schema: {
      tags: ['Leads'],
      summary: 'Create scoring factor',
      body: {
        type: 'object',
        required: ['factor_name', 'weight'],
        properties: {
          factor_name: { type: 'string' },
          weight: { type: 'number' },
          is_active: { type: 'boolean', default: true },
          configuration: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_scoring_factors')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── PUT /scoring-factors/:factorId ──────────────────────────────
  fastify.put('/scoring-factors/:factorId', {
    schema: {
      tags: ['Leads'],
      summary: 'Update scoring factor',
      params: { type: 'object', properties: { factorId: { type: 'string', format: 'uuid' } }, required: ['factorId'] },
      body: {
        type: 'object',
        properties: {
          factor_name: { type: 'string' },
          weight: { type: 'number' },
          is_active: { type: 'boolean' },
          configuration: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_scoring_factors')
      .update({ ...request.body, updated_at: new Date().toISOString() })
      .eq('id', request.params.factorId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── POST /bulk-assign ───────────────────────────────────────────
  fastify.post('/bulk-assign', {
    schema: {
      tags: ['Leads'],
      summary: 'Bulk assign leads round-robin',
      body: {
        type: 'object',
        required: ['lead_ids', 'agent_ids'],
        properties: {
          lead_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          agent_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        },
      },
    },
  }, async (request, reply) => {
    const { lead_ids, agent_ids } = request.body;
    const assignments = [];

    for (let i = 0; i < lead_ids.length; i++) {
      const agentId = agent_ids[i % agent_ids.length];
      assignments.push({ leadId: lead_ids[i], agentId });
      await supabase.from('leads').update({ assigned_to: agentId, updated_at: new Date().toISOString() }).eq('id', lead_ids[i]);
    }

    // Update assignment tracking
    if (agent_ids.length > 0) {
      const lastAgent = agent_ids[(lead_ids.length - 1) % agent_ids.length];
      await supabase.from('assignment_tracking').upsert({
        entity_type: 'lead', last_agent_id: lastAgent, updated_at: new Date().toISOString(),
      }, { onConflict: 'entity_type' });
    }

    return reply.send({ assigned: assignments.length, assignments });
  });

  // ─── GET / ─── List leads ────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Leads'],
      summary: 'List leads',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          search: { type: 'string' },
          status: { type: 'string' },
          stage: { type: 'string' },
          source: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'updated_at', 'status', 'stage'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, search, status, stage, source, assigned_to, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('leads')
      .select('*, contacts(name, email, mobile), lead_scores(score, confidence)', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order(sort, { ascending: order === 'asc' });

    if (search) query = query.or(`product.ilike.%${search}%,campaign.ilike.%${search}%`);
    if (status) query = query.eq('status', status);
    if (stage) query = query.eq('stage', stage);
    if (source) query = query.eq('source', source);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data: data || [],
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit), hasNext: offset + limit < count },
    });
  });

  // ─── GET /:id ─── Single lead ────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead by ID',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*, contacts(*), lead_scores(score, confidence, factors, prediction, created_at)')
      .eq('id', request.params.id)
      .single();

    if (error || !lead) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    const { data: history } = await supabase
      .from('lead_history')
      .select('*')
      .eq('lead_id', request.params.id)
      .order('timestamp', { ascending: false })
      .limit(20);

    return reply.send({ data: { ...lead, history: history || [] } });
  });

  // ─── POST / ─── Create lead ──────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Leads'],
      summary: 'Create lead',
      body: {
        type: 'object',
        required: ['contact_id', 'source'],
        properties: {
          contact_id: { type: 'string', format: 'uuid' },
          source: { type: 'string' },
          status: { type: 'string', default: 'new' },
          stage: { type: 'string', default: 'initial' },
          assigned_to: { type: 'string', format: 'uuid' },
          product: { type: 'string' },
          campaign: { type: 'string' },
          custom_fields: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const lead = { id: uuidv4(), ...request.body, created_at: now, updated_at: now };

    const { data, error } = await supabase.from('leads').insert(lead).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Create initial history entry
    await supabase.from('lead_history').insert({
      id: uuidv4(), lead_id: data.id, status: data.status, notes: 'Lead created', timestamp: now,
    });

    return reply.code(201).send({ data });
  });

  // ─── PUT /:id ─── Update lead ────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Update lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          status: { type: 'string' },
          stage: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          product: { type: 'string' },
          campaign: { type: 'string' },
          custom_fields: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const updates = { ...request.body, updated_at: new Date().toISOString() };

    // Get old status for history
    const { data: old } = await supabase.from('leads').select('status').eq('id', id).single();
    if (!old) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Track status change
    if (updates.status && updates.status !== old.status) {
      await supabase.from('lead_history').insert({
        id: uuidv4(), lead_id: id, status: updates.status,
        notes: `Status changed from ${old.status} to ${updates.status}`,
        timestamp: new Date().toISOString(),
      });
    }

    return reply.send({ data });
  });

  // ─── DELETE /:id ─── Archive lead ────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Archive lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;

    const { data: lead, error: fetchErr } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (fetchErr || !lead) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    // Delete child records first (foreign key constraints)
    await supabase.from('call_logs').delete().eq('lead_id', leadId);
    await supabase.from('lead_scores').delete().eq('lead_id', leadId);
    await supabase.from('lead_history').delete().eq('lead_id', leadId);
    await supabase.from('lead_notes').delete().eq('lead_id', leadId);

    // Try to archive, but don't block delete if archive table doesn't exist
    try { await supabase.from('leads_archive').insert({ ...lead, archived_at: new Date().toISOString() }); } catch (_) {}

    const { error: deleteErr } = await supabase.from('leads').delete().eq('id', leadId);
    if (deleteErr) {
      fastify.log.error({ deleteErr, leadId }, 'Failed to delete lead');
      return reply.code(500).send({ error: 'Delete failed', message: deleteErr.message });
    }

    return reply.code(204).send();
  });

  // ─── POST /:id/assign ───────────────────────────────────────────
  fastify.post('/:id/assign', {
    schema: {
      tags: ['Leads'],
      summary: 'Assign lead to agent',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: { agent_id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('leads')
      .update({ assigned_to: request.body.agent_id, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    await supabase.from('lead_history').insert({
      id: uuidv4(), lead_id: request.params.id, status: 'assigned',
      notes: `Assigned to agent ${request.body.agent_id}`, timestamp: new Date().toISOString(),
    });

    return reply.send({ data });
  });

  // ─── GET /:id/history ───────────────────────────────────────────
  fastify.get('/:id/history', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead history',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_history')
      .select('*').eq('lead_id', request.params.id).order('timestamp', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── POST /:id/history ──────────────────────────────────────────
  fastify.post('/:id/history', {
    schema: {
      tags: ['Leads'],
      summary: 'Add history note',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['notes'],
        properties: {
          notes: { type: 'string' },
          status: { type: 'string' },
          changed_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_history')
      .insert({
        id: uuidv4(), lead_id: request.params.id,
        status: request.body.status || 'note',
        notes: request.body.notes,
        changed_by: request.body.changed_by || null,
        timestamp: new Date().toISOString(),
      }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── GET /:id/score ─────────────────────────────────────────────
  fastify.get('/:id/score', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead score',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('lead_scores')
      .select('*').eq('lead_id', request.params.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── PUT /:id/score ─────────────────────────────────────────────
  fastify.put('/:id/score', {
    schema: {
      tags: ['Leads'],
      summary: 'Update lead score',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['score'],
        properties: {
          score: { type: 'number' },
          confidence: { type: 'number' },
          factors: { type: 'object' },
          prediction: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('lead_scores')
      .upsert({
        id: uuidv4(), lead_id: request.params.id, ...request.body,
        created_at: now, updated_at: now,
      }, { onConflict: 'lead_id' }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });
}

module.exports = leadsRoutes;
