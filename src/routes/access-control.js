'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { requireRole, getEffectivePermissions, invalidatePermissionCache } = require('../middleware/rbac');
const { MODULES, ACTIONS, MODULE_KEYS } = require('../config/modules');

async function accessControlRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /modules ── list of controllable modules + actions (any auth) ──
  fastify.get('/modules', {
    schema: { tags: ['Access Control'], summary: 'List access-controlled modules' },
  }, async (request, reply) => {
    return reply.send({ data: { modules: MODULES, actions: ACTIONS } });
  });

  // ─── GET /me ── current user's effective permissions (any auth) ──────────
  fastify.get('/me', {
    schema: { tags: ['Access Control'], summary: 'Effective permissions for the current user' },
  }, async (request, reply) => {
    const permissions = await getEffectivePermissions(request.user);
    return reply.send({
      data: {
        user_id: request.user.id,
        role: request.user.role,
        is_admin: request.user.role === 'admin',
        permissions,
      },
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Everything below is admin-only.
  // ════════════════════════════════════════════════════════════════════════

  // ─── GET /groups ── groups with their permission matrix ──────────────────
  fastify.get('/groups', {
    preHandler: requireRole('admin'),
    schema: { tags: ['Access Control'], summary: 'List groups with permissions' },
  }, async (request, reply) => {
    const { data: groups, error } = await supabase.from('groups').select('*').order('name');
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    const { data: perms } = await supabase.from('group_permissions').select('*');
    const byGroup = {};
    (perms || []).forEach((p) => {
      (byGroup[p.group_id] = byGroup[p.group_id] || []).push(p);
    });

    // Member counts
    const withData = await Promise.all((groups || []).map(async (g) => {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('group_id', g.id);
      return { ...g, member_count: count || 0, permissions: byGroup[g.id] || [] };
    }));

    return reply.send({ data: withData });
  });

  // ─── POST /groups ── create group ────────────────────────────────────────
  fastify.post('/groups', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Create a group',
      body: {
        type: 'object', required: ['name'],
        properties: { name: { type: 'string' }, description: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('groups')
      .insert({ id, name: request.body.name, description: request.body.description || '', is_system: false, created_at: now, updated_at: now })
      .select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    // Seed read-only rows for every module so the matrix renders fully.
    const rows = MODULE_KEYS.map((module) => ({
      id: uuidv4(), group_id: id, module,
      can_read: false, can_write: false, can_edit: false, can_delete: false,
    }));
    await supabase.from('group_permissions').insert(rows);

    return reply.code(201).send({ data });
  });

  // ─── PUT /groups/:id ── rename / describe ────────────────────────────────
  fastify.put('/groups/:id', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Update a group',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('groups')
      .update({ ...request.body, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    invalidatePermissionCache();
    return reply.send({ data });
  });

  // ─── DELETE /groups/:id ── delete non-system group ───────────────────────
  fastify.delete('/groups/:id', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Delete a group',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data: g } = await supabase.from('groups').select('is_system').eq('id', request.params.id).single();
    if (!g) return reply.code(404).send({ error: 'Not Found' });
    if (g.is_system) return reply.code(400).send({ error: 'Bad Request', message: 'System groups cannot be deleted' });

    await supabase.from('users').update({ group_id: null }).eq('group_id', request.params.id);
    await supabase.from('groups').delete().eq('id', request.params.id);
    invalidatePermissionCache();
    return reply.code(204).send();
  });

  // ─── PUT /groups/:id/permissions ── replace the whole matrix for a group ─
  fastify.put('/groups/:id/permissions', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Set group permissions',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['permissions'],
        properties: {
          permissions: {
            type: 'array',
            items: {
              type: 'object', required: ['module'],
              properties: {
                module: { type: 'string' },
                can_read: { type: 'boolean' }, can_write: { type: 'boolean' },
                can_edit: { type: 'boolean' }, can_delete: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const groupId = request.params.id;
    const now = new Date().toISOString();

    const rows = request.body.permissions
      .filter((p) => MODULE_KEYS.includes(p.module))
      .map((p) => ({
        group_id: groupId, module: p.module,
        can_read: !!p.can_read, can_write: !!p.can_write,
        can_edit: !!p.can_edit, can_delete: !!p.can_delete,
        updated_at: now,
      }));

    const { error } = await supabase.from('group_permissions')
      .upsert(rows, { onConflict: 'group_id,module' });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    invalidatePermissionCache();
    return reply.send({ data: { group_id: groupId, updated: rows.length } });
  });

  // ─── GET /users/:id/permissions ── group + overrides + effective ────────
  fastify.get('/users/:id/permissions', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Get a user permission profile',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const userId = request.params.id;
    const { data: user } = await supabase.from('users')
      .select('id, name, email, role, group_id').eq('id', userId).single();
    if (!user) return reply.code(404).send({ error: 'Not Found' });

    const { data: overrides } = await supabase.from('user_permissions')
      .select('module, can_read, can_write, can_edit, can_delete').eq('user_id', userId);

    const effective = await getEffectivePermissions({ id: user.id, role: user.role });

    return reply.send({ data: { user, overrides: overrides || [], effective } });
  });

  // ─── PUT /users/:id/permissions ── set per-user overrides ───────────────
  fastify.put('/users/:id/permissions', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Set per-user permission overrides',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['overrides'],
        properties: {
          overrides: {
            type: 'array',
            items: {
              type: 'object', required: ['module'],
              properties: {
                module: { type: 'string' },
                can_read: { type: ['boolean', 'null'] }, can_write: { type: ['boolean', 'null'] },
                can_edit: { type: ['boolean', 'null'] }, can_delete: { type: ['boolean', 'null'] },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.params.id;
    const now = new Date().toISOString();

    // An override row where all four flags are null = "no override" → delete it.
    const toUpsert = [];
    const toClear = [];
    for (const p of request.body.overrides) {
      if (!MODULE_KEYS.includes(p.module)) continue;
      const allNull = [p.can_read, p.can_write, p.can_edit, p.can_delete]
        .every((v) => v === null || v === undefined);
      if (allNull) {
        toClear.push(p.module);
      } else {
        toUpsert.push({
          user_id: userId, module: p.module,
          can_read: nz(p.can_read), can_write: nz(p.can_write),
          can_edit: nz(p.can_edit), can_delete: nz(p.can_delete),
          updated_at: now,
        });
      }
    }

    if (toUpsert.length) {
      const { error } = await supabase.from('user_permissions')
        .upsert(toUpsert, { onConflict: 'user_id,module' });
      if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    }
    if (toClear.length) {
      await supabase.from('user_permissions').delete().eq('user_id', userId).in('module', toClear);
    }

    invalidatePermissionCache(userId);
    return reply.send({ data: { user_id: userId, updated: toUpsert.length, cleared: toClear.length } });
  });

  // ─── PUT /users/:id/group ── assign a user to a group ───────────────────
  fastify.put('/users/:id/group', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['Access Control'], summary: 'Assign user to a group',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: { group_id: { type: ['string', 'null'] } } },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('users')
      .update({ group_id: request.body.group_id || null, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select('id, name, email, role, group_id').single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    invalidatePermissionCache(request.params.id);
    return reply.send({ data });
  });
}

function nz(v) {
  return v === null || v === undefined ? null : !!v;
}

module.exports = accessControlRoutes;
