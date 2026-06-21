'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');
const { notifyTaskAssigned } = require('../services/notificationService');

async function tasksRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('tasks'));

  // ─── GET /stats ──────────────────────────────────────────────────
  fastify.get('/stats', {
    schema: { tags: ['Tasks'], summary: 'Task statistics' },
  }, async (request, reply) => {
    const { data } = await supabase.from('tasks').select('status, priority, due_date');
    const tasks = data || [];
    const now = new Date();

    const byStatus = {}, byPriority = {};
    let overdueCount = 0;
    tasks.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      if (t.due_date && new Date(t.due_date) < now && t.status !== 'completed') overdueCount++;
    });

    return reply.send({ total: tasks.length, byStatus, byPriority, overdueCount });
  });

  // ─── GET /overdue ────────────────────────────────────────────────
  fastify.get('/overdue', {
    schema: { tags: ['Tasks'], summary: 'Get overdue tasks' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('tasks').select('*')
      .lt('due_date', new Date().toISOString()).neq('status', 'completed')
      .order('due_date', { ascending: true });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── Sales Marketing Tasks: Board ────────────────────────────────
  fastify.get('/sales-marketing/board', {
    schema: { tags: ['Tasks'], summary: 'Kanban board view for sales/marketing tasks' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_marketing_tasks').select('*').order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    const board = {};
    (data || []).forEach(t => {
      if (!board[t.status]) board[t.status] = [];
      board[t.status].push(t);
    });

    return reply.send({ board });
  });

  // ─── Sales Marketing Tasks CRUD ──────────────────────────────────
  fastify.get('/sales-marketing', {
    schema: {
      tags: ['Tasks'], summary: 'List sales/marketing tasks',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          status: { type: 'string' }, category: { type: 'string' },
          department: { type: 'string' }, priority: { type: 'string' },
          assignee_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, status, category, department, priority, assignee_id } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('sales_marketing_tasks').select('*', { count: 'exact' })
      .range(offset, offset + limit - 1).order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (department) query = query.eq('department', department);
    if (priority) query = query.eq('priority', priority);
    if (assignee_id) query = query.eq('assignee_id', assignee_id);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/sales-marketing/:id', {
    schema: { tags: ['Tasks'], summary: 'Get sales/marketing task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_marketing_tasks').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/sales-marketing', {
    schema: {
      tags: ['Tasks'], summary: 'Create sales/marketing task',
      body: {
        type: 'object', required: ['title'],
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          status: { type: 'string', default: 'todo' }, priority: { type: 'string', default: 'medium' },
          assignee_id: { type: 'string', format: 'uuid' }, tags: { type: 'array', items: { type: 'string' } },
          start_date: { type: 'string', format: 'date' }, end_date: { type: 'string', format: 'date' },
          estimated_hours: { type: 'number' }, category: { type: 'string' },
          department: { type: 'string' }, parent_task_id: { type: 'string', format: 'uuid' },
          created_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('sales_marketing_tasks')
      .insert({ id: uuidv4(), ...request.body, created_at: now, updated_at: now }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (data?.assignee_id) {
      notifyTaskAssigned({ id: data.id, assignee_id: data.assignee_id, title: data.title, description: data.description, due_date: data.end_date, priority: data.priority });
    }
    return reply.code(201).send({ data });
  });

  fastify.put('/sales-marketing/:id', {
    schema: {
      tags: ['Tasks'], summary: 'Update sales/marketing task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          status: { type: 'string' }, priority: { type: 'string' },
          assignee_id: { type: 'string', format: 'uuid' }, tags: { type: 'array', items: { type: 'string' } },
          start_date: { type: 'string', format: 'date' }, end_date: { type: 'string', format: 'date' },
          estimated_hours: { type: 'number' }, effort_hours: { type: 'number' },
          category: { type: 'string' }, department: { type: 'string' },
          updated_by: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('sales_marketing_tasks')
      .update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    if (request.body.assignee_id) {
      notifyTaskAssigned({ id: data.id, assignee_id: data.assignee_id, title: data.title, description: data.description, due_date: data.end_date, priority: data.priority });
    }
    return reply.send({ data });
  });

  fastify.delete('/sales-marketing/:id', {
    schema: { tags: ['Tasks'], summary: 'Delete sales/marketing task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('sales_marketing_tasks').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  // ─── General Tasks CRUD ──────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Tasks'], summary: 'List tasks',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          status: { type: 'string' }, priority: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          entity_type: { type: 'string' }, entity_id: { type: 'string', format: 'uuid' },
          sort: { type: 'string', default: 'created_at' },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, status, priority, assigned_to, entity_type, entity_id, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }
      if (priority) {
        whereConditions.push(`priority = $${params.length + 1}`);
        params.push(priority);
      }
      if (assigned_to) {
        whereConditions.push(`assigned_to = $${params.length + 1}`);
        params.push(assigned_to);
      }
      if (entity_type) {
        whereConditions.push(`entity_type = $${params.length + 1}`);
        params.push(entity_type);
      }
      if (entity_id) {
        whereConditions.push(`entity_id = $${params.length + 1}`);
        params.push(entity_id);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM tasks${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT * FROM tasks${whereClause} ORDER BY ${sort} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) }
      });
    } catch (error) {
      console.error('[Tasks] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:id', {
    schema: { tags: ['Tasks'], summary: 'Get task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('tasks').select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Tasks'], summary: 'Create task',
      body: {
        type: 'object', required: ['title'],
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          entity_id: { type: 'string', format: 'uuid' }, entity_type: { type: 'string' },
          status: { type: 'string', default: 'pending' }, priority: { type: 'string', default: 'medium' },
          due_date: { type: 'string', format: 'date-time' }, tenant_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('tasks')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (data?.assigned_to) notifyTaskAssigned(data);
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    schema: {
      tags: ['Tasks'], summary: 'Update task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          assigned_to: { type: 'string', format: 'uuid' },
          status: { type: 'string' }, priority: { type: 'string' },
          due_date: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('tasks')
      .update(request.body).eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    if (request.body.assigned_to) notifyTaskAssigned(data);
    return reply.send({ data });
  });

  fastify.put('/:id/complete', {
    schema: { tags: ['Tasks'], summary: 'Mark task completed',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Tasks'], summary: 'Delete task',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    await supabase.from('tasks').delete().eq('id', request.params.id);
    return reply.code(204).send();
  });

  fastify.post('/bulk-assign', {
    schema: {
      tags: ['Tasks'], summary: 'Bulk assign tasks',
      body: {
        type: 'object', required: ['task_ids', 'assigned_to'],
        properties: {
          task_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          assigned_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { task_ids, assigned_to } = request.body;
    const { error } = await supabase.from('tasks').update({ assigned_to }).in('id', task_ids);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Notify the new assignee once per task (fire-and-forget).
    const { data: assignedTasks } = await supabase.from('tasks').select('*').in('id', task_ids);
    (assignedTasks || []).forEach((t) => notifyTaskAssigned(t));

    return reply.send({ updated: task_ids.length });
  });
}

module.exports = tasksRoutes;
