'use strict';

const crypto = require('crypto');
let bcrypt;
try { bcrypt = require('bcrypt'); } catch { bcrypt = null; }
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const USER_SAFE_COLS = 'id, name, email, role, team_id, status, created_at';

async function usersRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /agents ─────────────────────────────────────────────────
  fastify.get('/agents', {
    schema: { tags: ['Users'], summary: 'List agents (for assignment dropdowns)' },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('users')
      .select(USER_SAFE_COLS).eq('role', 'agent').eq('status', 'active').order('name');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── Teams ────────────────────────────────────────────────────────
  fastify.get('/teams', {
    schema: { tags: ['Users'], summary: 'List all teams' },
  }, async (request, reply) => {
    const { data: teams, error } = await supabase.from('teams').select('*').order('name');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Get member counts
    const teamsWithCounts = await Promise.all((teams || []).map(async (team) => {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
      return { ...team, member_count: count || 0 };
    }));

    return reply.send({ data: teamsWithCounts });
  });

  fastify.get('/teams/:teamId', {
    schema: { tags: ['Users'], summary: 'Get team with members',
      params: { type: 'object', properties: { teamId: { type: 'string', format: 'uuid' } }, required: ['teamId'] } },
  }, async (request, reply) => {
    const { data: team } = await supabase.from('teams').select('*').eq('id', request.params.teamId).single();
    if (!team) return reply.code(404).send({ error: 'Not Found' });

    const { data: members } = await supabase.from('users')
      .select(USER_SAFE_COLS).eq('team_id', request.params.teamId).order('name');

    return reply.send({ data: { ...team, members: members || [] } });
  });

  fastify.post('/teams', {
    schema: {
      tags: ['Users'], summary: 'Create team',
      body: {
        type: 'object', required: ['name'],
        properties: { name: { type: 'string' }, manager_id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('teams')
      .insert({ id: uuidv4(), ...request.body, created_at: new Date().toISOString() }).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/teams/:teamId', {
    schema: {
      tags: ['Users'], summary: 'Update team',
      params: { type: 'object', properties: { teamId: { type: 'string', format: 'uuid' } }, required: ['teamId'] },
      body: {
        type: 'object',
        properties: { name: { type: 'string' }, manager_id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('teams')
      .update(request.body).eq('id', request.params.teamId).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/teams/:teamId', {
    schema: { tags: ['Users'], summary: 'Delete team',
      params: { type: 'object', properties: { teamId: { type: 'string', format: 'uuid' } }, required: ['teamId'] } },
  }, async (request, reply) => {
    // Unassign users from this team first
    await supabase.from('users').update({ team_id: null }).eq('team_id', request.params.teamId);
    await supabase.from('teams').delete().eq('id', request.params.teamId);
    return reply.code(204).send();
  });

  // ─── Users CRUD ──────────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Users'], summary: 'List users',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          role: { type: 'string' }, status: { type: 'string' },
          team_id: { type: 'string', format: 'uuid' }, search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, role, status, team_id, search } = request.query;
    const offset = (page - 1) * limit;

    let query = supabase.from('users').select(USER_SAFE_COLS, { count: 'exact' })
      .range(offset, offset + limit - 1).order('created_at', { ascending: false });

    if (role) query = query.eq('role', role);
    if (status) query = query.eq('status', status);
    if (team_id) query = query.eq('team_id', team_id);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [], pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  });

  fastify.get('/:id', {
    schema: { tags: ['Users'], summary: 'Get user',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('users')
      .select(USER_SAFE_COLS).eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.post('/', {
    schema: {
      tags: ['Users'], summary: 'Create user',
      body: {
        type: 'object', required: ['name', 'email', 'role', 'password'],
        properties: {
          name: { type: 'string' }, email: { type: 'string', format: 'email' },
          role: { type: 'string' }, team_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', default: 'active' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { password, ...rest } = request.body;

    const password_hash = bcrypt
      ? await bcrypt.hash(password, 12)
      : crypto.createHash('sha256').update(password + (process.env.API_KEY_SALT || 'salt')).digest('hex');

    const { data, error } = await supabase.from('users')
      .insert({ id: uuidv4(), ...rest, password_hash, created_at: new Date().toISOString() })
      .select(USER_SAFE_COLS).single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  fastify.put('/:id', {
    schema: {
      tags: ['Users'], summary: 'Update user',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' }, role: { type: 'string' },
          team_id: { type: 'string', format: 'uuid' }, status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('users')
      .update(request.body).eq('id', request.params.id).select(USER_SAFE_COLS).single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  fastify.delete('/:id', {
    schema: { tags: ['Users'], summary: 'Deactivate user',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('users')
      .update({ status: 'inactive' }).eq('id', request.params.id).select(USER_SAFE_COLS).single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data });
  });

  // ─── GET /:id/activity ───────────────────────────────────────────
  fastify.get('/:id/activity', {
    schema: { tags: ['Users'], summary: 'Get user activity summary',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } },
  }, async (request, reply) => {
    const id = request.params.id;
    const [leadsRes, tasksRes, oppsRes, interactionsRes] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', id),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', id),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('assigned_to', id),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('assigned_to', id),
    ]);

    return reply.send({
      data: {
        assigned_leads: leadsRes.count || 0,
        assigned_tasks: tasksRes.count || 0,
        assigned_opportunities: oppsRes.count || 0,
        assigned_interactions: interactionsRes.count || 0,
      },
    });
  });
}

module.exports = usersRoutes;
