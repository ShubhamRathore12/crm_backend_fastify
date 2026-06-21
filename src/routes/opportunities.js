'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');
const { getReferenceData, buildSeedOpps } = require('../config/opps-seed');

// Lazily create + seed the LeadSquared-style opportunities store. Idempotent.
let _uiTableReady = false;
async function ensureUiOppsTable(db) {
  if (_uiTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ui_opportunities (
      id          UUID PRIMARY KEY,
      lead_id     UUID,
      name        TEXT,
      owner       TEXT,
      product     TEXT,
      status      TEXT,
      stage       TEXT,
      type        TEXT,
      sort_order  DOUBLE PRECISION NOT NULL DEFAULT 0,
      data        JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS ui_opportunities_lead_id_idx ON ui_opportunities (lead_id)');

  const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM ui_opportunities');
  if ((rows[0]?.count || 0) === 0) {
    const seed = buildSeedOpps();
    for (let i = 0; i < seed.length; i++) {
      const o = seed[i];
      await db.query(
        `INSERT INTO ui_opportunities (id, lead_id, name, owner, product, status, stage, type, sort_order, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT (id) DO NOTHING`,
        [o.id, null, o.name, o.owner, o.broadProduct, o.status, o.stage, o.type, i, JSON.stringify(o)]
      );
    }
  }
  _uiTableReady = true;
}

// Map an Opp object to the indexed columns + JSONB payload.
function uiInsertParams(o) {
  return [o.id, o.lead_id || null, o.name, o.owner, o.broadProduct, o.status, o.stage, o.type];
}

async function opportunitiesRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('opportunities'));

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
          product: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('opportunities')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Record the initial product in history (latest product lives on the row).
    if (data?.product) {
      await supabase.from('opportunity_product_history').insert({
        id: uuidv4(), opportunity_id: data.id, product: data.product,
        changed_by: request.user?.id || null, created_at: now,
      }).then(() => {}).catch(() => {});
    }
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
          product: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    // Capture previous product so we only append history on an actual change.
    let prevProduct = null;
    if (request.body.product !== undefined) {
      const { data: prev } = await supabase.from('opportunities')
        .select('product').eq('id', request.params.id).single();
      prevProduct = prev?.product ?? null;
    }

    const { data, error } = await supabase.from('opportunities')
      .update({ ...request.body, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });

    if (request.body.product !== undefined && request.body.product && request.body.product !== prevProduct) {
      await supabase.from('opportunity_product_history').insert({
        id: uuidv4(), opportunity_id: data.id, product: data.product,
        changed_by: request.user?.id || null, created_at: new Date().toISOString(),
      }).then(() => {}).catch(() => {});
    }
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

  // ─── GET /:id/product-history ── latest-first product change log ─────────
  fastify.get('/:id/product-history', {
    schema: {
      tags: ['Opportunities'],
      summary: 'Product change history for an opportunity (latest first)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('opportunity_product_history')
      .select('id, product, changed_by, created_at')
      .eq('opportunity_id', request.params.id)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ════════════════════════════════════════════════════════════════════════
  // LeadSquared-style UI opportunities (backend-backed; identical UI shape).
  // ════════════════════════════════════════════════════════════════════════

  // ─── GET /reference ── dropdown lists (owners, products, statuses, …) ────
  fastify.get('/reference', {
    // Static lists — cache hard (server LRU/Redis + browser).
    config: { cache: { ttl: 600000 }, cacheControl: 'public, max-age=600' },
    schema: { tags: ['Opportunities'], summary: 'Opportunity reference lists' },
  }, async (request, reply) => {
    return reply.send({ data: getReferenceData() });
  });

  // ─── GET /ui ── list (filters: lead_id, product, owner, status, type, search) ─
  fastify.get('/ui', {
    schema: {
      tags: ['Opportunities'], summary: 'List UI opportunities',
      querystring: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' }, product: { type: 'string' },
          owner: { type: 'string' }, status: { type: 'string' },
          type: { type: 'string' }, search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      await ensureUiOppsTable(db);

      const { lead_id, product, owner, status, type, search } = request.query;
      const params = [];
      const where = [];
      if (lead_id) { where.push(`lead_id = $${params.length + 1}`); params.push(lead_id); }
      if (product) { where.push(`product = $${params.length + 1}`); params.push(product); }
      if (owner) { where.push(`owner = $${params.length + 1}`); params.push(owner); }
      if (status) { where.push(`status = $${params.length + 1}`); params.push(status); }
      if (type) { where.push(`type = $${params.length + 1}`); params.push(type); }
      if (search) { where.push(`name ILIKE $${params.length + 1}`); params.push(`%${search}%`); }

      const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const result = await db.query(
        `SELECT id, data FROM ui_opportunities${clause} ORDER BY sort_order ASC`,
        params
      );
      const data = (result.rows || []).map((r) => ({ ...r.data, id: r.id }));
      return reply.send({ data });
    } catch (error) {
      console.error('[Opportunities] GET /ui error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ─── GET /ui/:id ─────────────────────────────────────────────────────────
  fastify.get('/ui/:id', {
    schema: {
      tags: ['Opportunities'], summary: 'Get a UI opportunity',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const db = getPostgresClient();
    await ensureUiOppsTable(db);
    const result = await db.query('SELECT id, data FROM ui_opportunities WHERE id = $1', [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data: { ...result.rows[0].data, id: result.rows[0].id } });
  });

  // ─── POST /ui ── create (body = full Opp; newest appears first) ──────────
  fastify.post('/ui', {
    schema: {
      tags: ['Opportunities'], summary: 'Create a UI opportunity',
      body: { type: 'object', additionalProperties: true, required: ['name'], properties: { name: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const db = getPostgresClient();
    await ensureUiOppsTable(db);

    const id = request.body.id || uuidv4();
    const opp = { ...request.body, id };
    const [, leadId, name, owner, product, status, stage, type] = uiInsertParams(opp);
    const sortOrder = -Date.now(); // newest first under ORDER BY sort_order ASC

    await db.query(
      `INSERT INTO ui_opportunities (id, lead_id, name, owner, product, status, stage, type, sort_order, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [id, leadId, name, owner, product, status, stage, type, sortOrder, JSON.stringify(opp)]
    );
    return reply.code(201).send({ data: opp });
  });

  // ─── PUT /ui/:id ── update (merge patch into stored Opp) ─────────────────
  fastify.put('/ui/:id', {
    schema: {
      tags: ['Opportunities'], summary: 'Update a UI opportunity',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const db = getPostgresClient();
    await ensureUiOppsTable(db);

    const cur = await db.query('SELECT data FROM ui_opportunities WHERE id = $1', [request.params.id]);
    if (!cur.rows[0]) return reply.code(404).send({ error: 'Not Found' });

    const merged = { ...cur.rows[0].data, ...request.body, id: request.params.id };
    const [, leadId, name, owner, product, status, stage, type] = uiInsertParams(merged);
    await db.query(
      `UPDATE ui_opportunities
         SET lead_id=$2, name=$3, owner=$4, product=$5, status=$6, stage=$7, type=$8, data=$9::jsonb, updated_at=NOW()
       WHERE id=$1`,
      [request.params.id, leadId, name, owner, product, status, stage, type, JSON.stringify(merged)]
    );
    return reply.send({ data: merged });
  });

  // ─── DELETE /ui/:id ──────────────────────────────────────────────────────
  fastify.delete('/ui/:id', {
    schema: {
      tags: ['Opportunities'], summary: 'Delete a UI opportunity',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const db = getPostgresClient();
    await ensureUiOppsTable(db);
    await db.query('DELETE FROM ui_opportunities WHERE id = $1', [request.params.id]);
    return reply.code(204).send();
  });

  // ─── POST /ui/ensure-for-lead ── find-or-create opp for a lead+product ───
  // Used by the Leads screen: clicking a lead's product opens its opportunity.
  fastify.post('/ui/ensure-for-lead', {
    schema: {
      tags: ['Opportunities'], summary: 'Find or create the opportunity for a lead',
      body: {
        type: 'object', required: ['lead_id'],
        properties: {
          lead_id: { type: 'string' },
          name: { type: 'string' }, email: { type: 'string' },
          phone: { type: 'string' }, product: { type: 'string' },
          owner: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const db = getPostgresClient();
    await ensureUiOppsTable(db);
    const { lead_id, name, email, phone, product, owner } = request.body;

    // Prefer an existing opp for this lead (matching product if given).
    const params = [lead_id];
    let q = 'SELECT id, data FROM ui_opportunities WHERE lead_id = $1';
    if (product) { q += ' AND product = $2'; params.push(product); }
    q += ' ORDER BY sort_order ASC LIMIT 1';
    const existing = await db.query(q, params);
    if (existing.rows[0]) {
      return reply.send({ data: { ...existing.rows[0].data, id: existing.rows[0].id }, created: false });
    }

    const ref = getReferenceData();
    const id = uuidv4();
    const now = new Date().toISOString().slice(0, 19);
    const ownerObj = ref.OWNERS.find((o) => o.name === owner) || ref.OWNERS[0];
    const opp = {
      id, name: name || 'New Opportunity',
      status: 'Open - Not Connected', stage: 'Prospect',
      type: 'Product Opportunity', diyFlag: 'No', upsale: 'New',
      createdOn: now, agentAssigned: now, noOfAttempts: 0, noOfConnects: 0,
      ownerUpdate: now.replace('T', ' '), owner: ownerObj.name, ownerEmail: ownerObj.email,
      contactName: name || '', phone: phone || '', email: email || '',
      company: 'Stoxkart', broadProduct: product || ref.BROAD_PRODUCTS[0],
      source: product || 'STX Trading Account', callStatus: '--', talismaId: '--',
      opportunityId: String(16000000 + (Date.now() % 100000)), lead_id,
    };
    await db.query(
      `INSERT INTO ui_opportunities (id, lead_id, name, owner, product, status, stage, type, sort_order, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [id, lead_id, opp.name, opp.owner, opp.broadProduct, opp.status, opp.stage, opp.type, -Date.now(), JSON.stringify(opp)]
    );
    return reply.code(201).send({ data: opp, created: true });
  });
}

module.exports = opportunitiesRoutes;
