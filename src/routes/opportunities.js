'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

async function opportunitiesRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /pipeline ───────────────────────────────────────────────
  fastify.get('/pipeline', {
    schema: { tags: ['Opportunities'], summary: 'Pipeline view grouped by stage' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('opportunities').select('id, stage, value, probability, currency');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    const pipeline = {};
    (data || []).forEach(o => {
      if (!pipeline[o.stage]) pipeline[o.stage] = { stage: o.stage, count: 0, totalValue: 0, weightedValue: 0 };
      pipeline[o.stage].count++;
      pipeline[o.stage].totalValue += parseFloat(o.value) || 0;
      pipeline[o.stage].weightedValue += (parseFloat(o.value) || 0) * ((o.probability || 0) / 100);
    });

    const stages = Object.values(pipeline);
    const summary = {
      totalDeals: (data || []).length,
      totalValue: stages.reduce((s, p) => s + p.totalValue, 0),
      weightedValue: stages.reduce((s, p) => s + p.weightedValue, 0),
    };

    return reply.send({ pipeline: stages, summary });
  });

  // ─── GET /stats ──────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: { tags: ['Opportunities'], summary: 'Opportunity statistics' },
  }, async (request, reply) => {
    const { data } = await supabase.from('opportunities').select('stage, value, probability');
    const opps = data || [];

    const byStage = {};
    opps.forEach(o => { byStage[o.stage] = (byStage[o.stage] || 0) + 1; });

    const totalValue = opps.reduce((s, o) => s + (parseFloat(o.value) || 0), 0);
    const avgValue = opps.length > 0 ? totalValue / opps.length : 0;
    const closedWon = byStage['closed_won'] || 0;
    const closedLost = byStage['closed_lost'] || 0;
    const winRate = (closedWon + closedLost) > 0 ? (closedWon / (closedWon + closedLost) * 100).toFixed(2) : '0';

    return reply.send({
      total: opps.length, totalValue, avgValue: avgValue.toFixed(2), winRate: winRate + '%', byStage,
    });
  });

  // ─── GET / ─── List opportunities ────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Opportunities'],
      summary: 'List opportunities',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          stage: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          lead_id: { type: 'string', format: 'uuid' },
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'value', 'probability', 'expected_closed_at'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, stage, assigned_to, lead_id, min_value, max_value, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('opportunities')
      .select('*, leads(contact_id, source, status)', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order(sort, { ascending: order === 'asc' });

    if (stage) query = query.eq('stage', stage);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);
    if (lead_id) query = query.eq('lead_id', lead_id);
    if (min_value) query = query.gte('value', min_value);
    if (max_value) query = query.lte('value', max_value);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  // ─── GET /:id ────────────────────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Get opportunity by ID',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('opportunities')
      .select('*, leads(*, contacts(name, email, mobile))').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found', message: 'Opportunity not found' });
    return reply.send({ data });
  });

  // ─── POST / ──────────────────────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Create opportunity',
      body: {
        type: 'object',
        required: ['lead_id', 'title', 'value'],
        properties: {
          lead_id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          value: { type: 'number' },
          currency: { type: 'string', default: 'INR' },
          stage: { type: 'string', default: 'qualification' },
          probability: { type: 'integer', minimum: 0, maximum: 100, default: 10 },
          expected_closed_at: { type: 'string', format: 'date-time' },
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('opportunities')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── PUT /:id ────────────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Update opportunity',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          value: { type: 'number' },
          currency: { type: 'string' },
          stage: { type: 'string' },
          probability: { type: 'integer' },
          expected_closed_at: { type: 'string', format: 'date-time' },
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('opportunities')
      .update({ ...request.body, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── DELETE /:id ─────────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Archive opportunity',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data: opp } = await supabase.from('opportunities').select('*').eq('id', request.params.id).single();
    if (!opp) return reply.code(404).send({ error: 'Not Found' });

    await supabase.from('opportunities_archive').insert({ ...opp, archived_at: new Date().toISOString() });
    await supabase.from('opportunities').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  // ─── POST /bulk-update-stage ─────────────────────────────────────
  fastify.post('/bulk-update-stage', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Bulk move opportunities to new stage',
      body: {
        type: 'object',
        required: ['ids', 'stage'],
        properties: {
          ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          stage: { type: 'string' },
          probability: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const { ids, stage, probability } = request.body;
    const updates = { stage, updated_at: new Date().toISOString() };
    if (probability !== undefined) updates.probability = probability;

    const { error, count } = await supabase.from('opportunities')
      .update(updates).in('id', ids);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ updated: ids.length, stage });
  });
}

module.exports = opportunitiesRoutes;
