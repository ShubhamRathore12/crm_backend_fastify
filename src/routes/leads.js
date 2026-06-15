'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

async function leadsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ────────────────────────────────────────────────────────────────
  // GET /leads - List all leads with pagination, filtering, sorting
  // ────────────────────────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Leads'],
      summary: 'List all leads',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost', 'cold'] },
          stage: { type: 'string' },
          source: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'name', 'company', 'lead_score', 'updated_at'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, search, status, stage, source, assigned_to, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (search) {
        whereConditions.push(`(c.first_name ILIKE $${params.length + 1} OR c.last_name ILIKE $${params.length + 1} OR c.email ILIKE $${params.length + 1} OR c.company ILIKE $${params.length + 1} OR c.phone ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }
      if (status) {
        whereConditions.push(`l.status = $${params.length + 1}`);
        params.push(status);
      }
      if (stage) {
        whereConditions.push(`l.stage = $${params.length + 1}`);
        params.push(stage);
      }
      if (source) {
        whereConditions.push(`l.source = $${params.length + 1}`);
        params.push(source);
      }
      if (assigned_to) {
        whereConditions.push(`l.assigned_to = $${params.length + 1}`);
        params.push(assigned_to);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sortField = sort === 'created_at' ? 'l.created_at' : sort === 'stage' ? 'l.stage' : sort === 'source' ? 'l.source' : 'l.created_at';
      const sql = `SELECT l.id, l.contact_id, l.source, l.stage, l.status, l.assigned_to, l.created_at, l.updated_at, c.first_name, c.last_name, c.email, c.company, c.phone FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id${whereClause} ORDER BY ${sortField} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) }
      });
    } catch (error) {
      console.error('[Leads] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/stats - Get lead statistics (MUST come before /:id)
  // ────────────────────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead statistics overview',
    },
  }, async (request, reply) => {
    const { data } = await supabase.from('leads').select('status, stage, source, lead_score');
    const leads = data || [];

    const byStatus = {}, byStage = {}, bySource = {};
    let totalScore = 0;

    leads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byStage[l.stage] = (byStage[l.stage] || 0) + 1;
      bySource[l.source] = (bySource[l.source] || 0) + 1;
      totalScore += l.lead_score || 0;
    });

    const avgScore = leads.length > 0 ? (totalScore / leads.length).toFixed(2) : 0;

    return reply.send({
      total: leads.length,
      by_status: byStatus,
      by_stage: byStage,
      by_source: bySource,
      average_score: parseFloat(avgScore),
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id - Get single lead with full details
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead by ID with full details',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            description: 'Comma-separated list of relations to include (history,opportunities,tasks,emails,interactions,scores,all)',
            default: 'scores,opportunities,tasks'
          },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const includeParam = request.query.include || 'scores,opportunities,tasks';
    const includeAll = includeParam.includes('all');
    const includes = {
      history: includeAll || includeParam.includes('history'),
      opportunities: includeAll || includeParam.includes('opportunities'),
      tasks: includeAll || includeParam.includes('tasks'),
      emails: includeAll || includeParam.includes('emails'),
      interactions: includeAll || includeParam.includes('interactions'),
      scores: includeAll || includeParam.includes('scores'),
      assigned_user: true,
    };

    // Fetch lead with basic info
    const { data: lead, error } = await supabase
      .from('leads')
      .select(`
        id, name, email, phone, company, source, stage, status, created_at, updated_at,
        assigned_to, lead_score, description, linkedin_url, website, industry, employee_count
      `)
      .eq('id', leadId)
      .single();

    if (error || !lead) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    const response = { data: lead };

    // Parallel fetching for all requested includes
    const promises = [];

    // Fetch lead scores if requested
    if (includes.scores) {
      promises.push(
        supabase
          .from('lead_scores')
          .select('id, score, confidence, factors, prediction, created_at')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => ({ key: 'current_score', data: (data && data[0]) || null }))
      );
    }

    // Fetch related opportunities if requested
    if (includes.opportunities) {
      promises.push(
        supabase
          .from('opportunities')
          .select('id, title, type, assigned_to, status, stage, value, probability, expected_closed_at, created_at')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .then(({ data }) => ({ key: 'opportunities', data: data || [] }))
      );
    }

    // Fetch related tasks if requested
    if (includes.tasks) {
      promises.push(
        supabase
          .from('tasks')
          .select('id, subject, due_date, priority, status, assigned_to, created_at')
          .eq('entity_type', 'lead')
          .eq('entity_id', leadId)
          .order('due_date', { ascending: true })
          .limit(50)
          .then(({ data }) => ({ key: 'tasks', data: data || [] }))
      );
    }

    // Fetch related emails if requested
    if (includes.emails) {
      promises.push(
        supabase
          .from('email_sends')
          .select('id, subject, created_at, to_email, read_at, status')
          .eq('entity_type', 'lead')
          .eq('entity_id', leadId)
          .order('created_at', { ascending: false })
          .limit(50)
          .then(({ data }) => ({ key: 'emails', data: data || [] }))
      );
    }

    // Fetch related interactions if requested
    if (includes.interactions) {
      promises.push(
        supabase
          .from('interactions')
          .select('id, channel, subject, status, priority, assigned_to, created_at, last_activity_at')
          .eq('lead_id', leadId)
          .order('last_activity_at', { ascending: false })
          .limit(50)
          .then(({ data }) => ({ key: 'interactions', data: data || [] }))
      );
    }

    // Fetch history if requested
    if (includes.history) {
      promises.push(
        supabase
          .from('lead_history')
          .select('id, action, field_changed, old_value, new_value, timestamp, changed_by')
          .eq('lead_id', leadId)
          .order('timestamp', { ascending: false })
          .limit(100)
          .then(({ data }) => ({ key: 'history', data: data || [] }))
      );
    }

    // Fetch assigned user if exists
    if (lead.assigned_to) {
      promises.push(
        supabase
          .from('users')
          .select('id, name, email, avatar_url')
          .eq('id', lead.assigned_to)
          .single()
          .then(({ data }) => ({ key: 'assigned_user', data: data || null }))
          .catch(() => ({ key: 'assigned_user', data: null }))
      );
    }

    // Wait for all parallel requests
    if (promises.length > 0) {
      const results = await Promise.all(promises);
      results.forEach(({ key, data }) => {
        response.data[key] = data;
      });
    }

    return reply.send(response);
  });

  // ────────────────────────────────────────────────────────────────
  // POST /leads - Create new lead
  // ────────────────────────────────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Leads'],
      summary: 'Create new lead',
      body: {
        type: 'object',
        required: ['name', 'email', 'company'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          company: { type: 'string' },
          source: { type: 'string' },
          stage: { type: 'string', default: 'new' },
          status: { type: 'string', default: 'new', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost', 'cold'] },
          assigned_to: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
          linkedin_url: { type: 'string' },
          website: { type: 'string' },
          industry: { type: 'string' },
          employee_count: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, phone, company, source, stage = 'new', status = 'new', assigned_to, description, linkedin_url, website, industry, employee_count } = request.body;

    const leadId = uuidv4();
    const { data, error } = await supabase
      .from('leads')
      .insert([
        {
          id: leadId,
          name,
          email,
          phone: phone || '',
          company,
          source: source || 'manual',
          stage,
          status,
          assigned_to: assigned_to || null,
          lead_score: 0,
          description: description || '',
          linkedin_url: linkedin_url || '',
          website: website || '',
          industry: industry || '',
          employee_count: employee_count || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Creation failed', message: error.message });
    return reply.code(201).send({ data });
  });

  // ────────────────────────────────────────────────────────────────
  // PUT /leads/:id - Update lead
  // ────────────────────────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Update lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          company: { type: 'string' },
          source: { type: 'string' },
          stage: { type: 'string' },
          status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost', 'cold'] },
          assigned_to: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
          linkedin_url: { type: 'string' },
          website: { type: 'string' },
          industry: { type: 'string' },
          employee_count: { type: 'string' },
          lead_score: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const updates = request.body;

    const { data, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Update failed', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not found', message: 'Lead not found' });

    return reply.send({ data });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /leads/:id - Delete lead
  // ────────────────────────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Leads'],
      summary: 'Delete lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;

    const { error } = await supabase.from('leads').delete().eq('id', leadId);

    if (error) return reply.code(400).send({ error: 'Deletion failed', message: error.message });
    return reply.code(204).send();
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/opportunities - Get opportunities for a lead
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/opportunities', {
    schema: {
      tags: ['Leads'],
      summary: 'Get opportunities for lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('opportunities')
      .select('*', { count: 'exact' })
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) } });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/tasks - Get tasks for a lead
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/tasks', {
    schema: {
      tags: ['Leads'],
      summary: 'Get tasks for lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20, status } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('tasks').select('*', { count: 'exact' })
      .eq('entity_type', 'lead')
      .eq('entity_id', leadId);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('due_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) } });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/emails - Get emails for a lead
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/emails', {
    schema: {
      tags: ['Leads'],
      summary: 'Get emails for lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('email_sends')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'lead')
      .eq('entity_id', leadId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) } });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/interactions - Get interactions for a lead
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/interactions', {
    schema: {
      tags: ['Leads'],
      summary: 'Get interactions for lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          channel: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20, channel } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('interactions').select('*', { count: 'exact' }).eq('lead_id', leadId);

    if (channel) query = query.eq('channel', channel);

    const { data, error, count } = await query
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) } });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/history - Get lead history
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/history', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead status/stage history',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          action: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20, action } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('lead_history').select('*', { count: 'exact' }).eq('lead_id', leadId);

    if (action) query = query.eq('action', action);

    const { data, error, count } = await query
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) } });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /leads/:id/assign - Assign lead to user
  // ────────────────────────────────────────────────────────────────
  fastify.post('/:id/assign', {
    schema: {
      tags: ['Leads'],
      summary: 'Assign lead to user',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['assigned_to'],
        properties: {
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { assigned_to } = request.body;

    const { data, error } = await supabase
      .from('leads')
      .update({ assigned_to, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Assignment failed', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not found', message: 'Lead not found' });

    return reply.send({ data });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/timeline - Get lead activity timeline
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/timeline', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead activity timeline (unified view of all activities)',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { limit = 50, offset = 0 } = request.query;

    // Fetch history items
    const { data: historyData } = await supabase
      .from('lead_history')
      .select('id, action, field_changed, old_value, new_value, timestamp, changed_by')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Map to timeline format
    const timeline = (historyData || []).map(item => ({
      id: item.id,
      type: 'status_change',
      action: item.action,
      field: item.field_changed,
      old_value: item.old_value,
      new_value: item.new_value,
      timestamp: item.timestamp,
      changed_by: item.changed_by,
    }));

    return reply.send({
      data: timeline,
      pagination: { limit, offset, hasMore: (historyData || []).length >= limit },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/summary - Get lead summary for detail view
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/summary', {
    schema: {
      tags: ['Leads'],
      summary: 'Get lead summary with key metrics',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;

    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, email, phone, company, source, stage, status, lead_score')
      .eq('id', leadId)
      .single();

    if (!lead) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    // Get counts for related items
    const [oppsCount, tasksCount, emailsCount, interactionsCount] = await Promise.all([
      supabase.from('opportunities').select('id', { count: 'exact' }).eq('lead_id', leadId).then(r => r.count || 0),
      supabase.from('tasks').select('id', { count: 'exact' }).eq('entity_id', leadId).eq('entity_type', 'lead').then(r => r.count || 0),
      supabase.from('email_sends').select('id', { count: 'exact' }).eq('entity_id', leadId).eq('entity_type', 'lead').then(r => r.count || 0),
      supabase.from('interactions').select('id', { count: 'exact' }).eq('lead_id', leadId).then(r => r.count || 0),
    ]);

    return reply.send({
      data: {
        ...lead,
        metrics: {
          opportunities_count: oppsCount,
          tasks_count: tasksCount,
          emails_count: emailsCount,
          interactions_count: interactionsCount,
        },
      },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /leads/:id/update-status - Update lead status with history
  // ────────────────────────────────────────────────────────────────
  fastify.post('/:id/update-status', {
    schema: {
      tags: ['Leads'],
      summary: 'Update lead status and record in history',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost', 'cold'] },
          stage: { type: 'string' },
          reason: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { status, stage, reason, notes } = request.body;
    const userId = request.user?.id;

    // Fetch current lead
    const { data: currentLead } = await supabase
      .from('leads')
      .select('status, stage')
      .eq('id', leadId)
      .single();

    if (!currentLead) return reply.code(404).send({ error: 'Not found', message: 'Lead not found' });

    // Update lead
    const updates = { status, updated_at: new Date().toISOString() };
    if (stage) updates.stage = stage;

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Update failed', message: error.message });

    // Record in history
    const historyId = uuidv4();
    await supabase.from('lead_history').insert({
      id: historyId,
      lead_id: leadId,
      action: 'status_updated',
      field_changed: 'status',
      old_value: currentLead.status,
      new_value: status,
      reason,
      notes,
      timestamp: new Date().toISOString(),
      changed_by: userId || null,
    });

    return reply.send({ data: updatedLead });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /leads/:id/add-note - Add note to lead
  // ────────────────────────────────────────────────────────────────
  fastify.post('/:id/add-note', {
    schema: {
      tags: ['Leads'],
      summary: 'Add a note to a lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['general', 'internal', 'follow_up'], default: 'general' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { content, type = 'general' } = request.body;
    const userId = request.user?.id;

    const noteId = uuidv4();
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({
        id: noteId,
        lead_id: leadId,
        content,
        type,
        created_by: userId || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Note creation failed', message: error.message });

    return reply.code(201).send({ data });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/notes - Get lead notes
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/notes', {
    schema: {
      tags: ['Leads'],
      summary: 'Get notes for a lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          type: { type: 'string', enum: ['general', 'internal', 'follow_up'] },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { page = 1, limit = 20, type } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('lead_notes').select('*', { count: 'exact' }).eq('lead_id', leadId);

    if (type) query = query.eq('type', type);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({
      data: data || [],
      pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /leads/:id/next-steps - Get recommended next steps
  // ────────────────────────────────────────────────────────────────
  fastify.get('/:id/next-steps', {
    schema: {
      tags: ['Leads'],
      summary: 'Get recommended next steps for a lead',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;

    const { data: lead } = await supabase
      .from('leads')
      .select('status, stage, lead_score, last_contacted_at')
      .eq('id', leadId)
      .single();

    if (!lead) return reply.code(404).send({ error: 'Not Found', message: 'Lead not found' });

    // Get open tasks
    const { data: openTasks } = await supabase
      .from('tasks')
      .select('id, subject, due_date, priority')
      .eq('entity_id', leadId)
      .eq('entity_type', 'lead')
      .eq('status', 'open')
      .order('due_date', { ascending: true })
      .limit(5);

    // Recommended actions based on lead status
    const recommendations = [];

    if (lead.status === 'new') {
      recommendations.push({
        id: 'initial_contact',
        title: 'Send initial outreach',
        description: 'Reach out to the lead with a personalized message',
        priority: 'high',
        action_type: 'email',
      });
    }

    if (lead.status === 'contacted' && lead.lead_score < 50) {
      recommendations.push({
        id: 'qualification_call',
        title: 'Schedule qualification call',
        description: 'Determine if this lead is a good fit for your product',
        priority: 'medium',
        action_type: 'call',
      });
    }

    if (lead.status === 'qualified' && lead.lead_score > 70) {
      recommendations.push({
        id: 'demo_offer',
        title: 'Offer a product demo',
        description: 'Show the lead your product in action',
        priority: 'high',
        action_type: 'meeting',
      });
    }

    if (openTasks && openTasks.length === 0 && lead.status === 'contacted') {
      recommendations.push({
        id: 'follow_up_task',
        title: 'Create follow-up task',
        description: 'Ensure consistent follow-up with this lead',
        priority: 'medium',
        action_type: 'task',
      });
    }

    return reply.send({
      data: {
        open_tasks: openTasks || [],
        recommendations,
      },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /leads/:id/qualify - Mark lead as qualified
  // ────────────────────────────────────────────────────────────────
  fastify.post('/:id/qualify', {
    schema: {
      tags: ['Leads'],
      summary: 'Mark lead as qualified or unqualified',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['qualified', 'unqualified'] },
          reason: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const leadId = request.params.id;
    const { status = 'qualified', reason } = request.body;

    const { data, error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select()
      .single();

    if (error) return reply.code(400).send({ error: 'Update failed', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not found', message: 'Lead not found' });

    return reply.send({ data });
  });
}

module.exports = leadsRoutes;
