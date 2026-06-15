'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
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
          search: { type: 'string' },
          stage: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          lead_id: { type: 'string', format: 'uuid' },
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          min_probability: { type: 'integer', minimum: 0, maximum: 100 },
          max_probability: { type: 'integer', minimum: 0, maximum: 100 },
          created_after: { type: 'string', format: 'date-time' },
          created_before: { type: 'string', format: 'date-time' },
          expected_close_after: { type: 'string', format: 'date-time' },
          expected_close_before: { type: 'string', format: 'date-time' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'value', 'probability', 'expected_closed_at'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 50,
      search,
      stage,
      assigned_to,
      lead_id,
      min_value,
      max_value,
      min_probability,
      max_probability,
      created_after,
      created_before,
      expected_close_after,
      expected_close_before,
      sort = 'created_at',
      order = 'desc',
    } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (search) {
        whereConditions.push(`(title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`);
        params.push(`%${search}%`, `%${search}%`);
      }
      if (stage) {
        whereConditions.push(`stage = $${params.length + 1}`);
        params.push(stage);
      }
      if (assigned_to) {
        whereConditions.push(`assigned_to = $${params.length + 1}`);
        params.push(assigned_to);
      }
      if (lead_id) {
        whereConditions.push(`lead_id = $${params.length + 1}`);
        params.push(lead_id);
      }
      if (min_value) {
        whereConditions.push(`value >= $${params.length + 1}`);
        params.push(min_value);
      }
      if (max_value) {
        whereConditions.push(`value <= $${params.length + 1}`);
        params.push(max_value);
      }
      if (min_probability) {
        whereConditions.push(`probability >= $${params.length + 1}`);
        params.push(min_probability);
      }
      if (max_probability) {
        whereConditions.push(`probability <= $${params.length + 1}`);
        params.push(max_probability);
      }
      if (created_after) {
        whereConditions.push(`created_at >= $${params.length + 1}`);
        params.push(created_after);
      }
      if (created_before) {
        whereConditions.push(`created_at <= $${params.length + 1}`);
        params.push(created_before);
      }
      if (expected_close_after) {
        whereConditions.push(`expected_closed_at >= $${params.length + 1}`);
        params.push(expected_close_after);
      }
      if (expected_close_before) {
        whereConditions.push(`expected_closed_at <= $${params.length + 1}`);
        params.push(expected_close_before);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM opportunities${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT o.*, l.contact_id, l.source, l.status FROM opportunities o LEFT JOIN leads l ON o.lead_id = l.id${whereClause} ORDER BY o.${sort} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) }
      });
    } catch (error) {
      console.error('[Opportunities] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
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
