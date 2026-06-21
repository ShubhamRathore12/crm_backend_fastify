'use strict';

const { supabase } = require('../config/supabase');
const { MODULE_KEYS, methodToAction } = require('../config/modules');

const FULL = { read: true, write: true, edit: true, delete: true };
const NONE = { read: false, write: false, edit: false, delete: false };

// Role-based defaults — used only when a user has no group and no overrides,
// so the system keeps working before any group is assigned.
const ROLE_DEFAULTS = {
  admin: () => ({ ...FULL }),
  manager: () => ({ read: true, write: true, edit: true, delete: false }),
  user: () => ({ read: true, write: true, edit: true, delete: false }),
  agent: () => ({ read: true, write: true, edit: true, delete: false }),
  viewer: () => ({ read: true, write: false, edit: false, delete: false }),
};

// Short-lived cache so we don't hit the DB on every request.
const _cache = new Map(); // userId -> { at, perms }
const CACHE_TTL_MS = 30 * 1000;

function invalidatePermissionCache(userId) {
  if (userId) _cache.delete(userId);
  else _cache.clear();
}

function roleDefault(role) {
  return (ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer)();
}

/**
 * Resolve the effective per-module permissions for a user.
 * Precedence: user override (non-null flag) > group permission > role default.
 * @param {{id:string, role?:string}} user
 * @returns {Promise<Record<string,{read,write,edit,delete}>>}
 */
async function getEffectivePermissions(user) {
  if (!user || !user.id) return buildAll(() => ({ ...NONE }));

  // Admins always get everything.
  if (user.role === 'admin') return buildAll(() => ({ ...FULL }));

  const cached = _cache.get(user.id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.perms;

  const fallback = roleDefault(user.role);
  const perms = buildAll(() => ({ ...fallback }));

  try {
    // Group of the user (column added by the RBAC migration).
    const { data: urow } = await supabase
      .from('users')
      .select('group_id')
      .eq('id', user.id)
      .single();

    const groupId = urow?.group_id || null;

    if (groupId) {
      const { data: gperms } = await supabase
        .from('group_permissions')
        .select('module, can_read, can_write, can_edit, can_delete')
        .eq('group_id', groupId);

      (gperms || []).forEach((p) => {
        perms[p.module] = {
          read: !!p.can_read,
          write: !!p.can_write,
          edit: !!p.can_edit,
          delete: !!p.can_delete,
        };
      });
    }

    // Per-user overrides win where the flag is not null.
    const { data: uperms } = await supabase
      .from('user_permissions')
      .select('module, can_read, can_write, can_edit, can_delete')
      .eq('user_id', user.id);

    (uperms || []).forEach((p) => {
      const base = perms[p.module] || { ...NONE };
      perms[p.module] = {
        read: p.can_read === null || p.can_read === undefined ? base.read : !!p.can_read,
        write: p.can_write === null || p.can_write === undefined ? base.write : !!p.can_write,
        edit: p.can_edit === null || p.can_edit === undefined ? base.edit : !!p.can_edit,
        delete: p.can_delete === null || p.can_delete === undefined ? base.delete : !!p.can_delete,
      };
    });
  } catch (err) {
    // Tables may not exist yet (migration not run) — fall back to role defaults.
    console.warn('[RBAC] permission lookup failed, using role defaults:', err.message);
  }

  _cache.set(user.id, { at: Date.now(), perms });
  return perms;
}

function buildAll(factory) {
  const out = {};
  for (const key of MODULE_KEYS) out[key] = factory();
  return out;
}

/**
 * preHandler factory: enforce that the request's user can perform the
 * method-derived action on `module`. Attaches request.permissions (cached).
 * @param {string} module
 */
function authorize(module) {
  return async function (request, reply) {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }
    if (user.role === 'admin') return; // fast path

    if (!request.permissions) {
      request.permissions = await getEffectivePermissions(user);
    }

    const action = methodToAction(request.method);
    const modulePerms = request.permissions[module] || NONE;

    if (!modulePerms[action]) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `You do not have '${action}' permission on '${module}'.`,
      });
    }
  };
}

/**
 * preHandler factory: require the user to have one of the given roles.
 * @param {...string} roles
 */
function requireRole(...roles) {
  return async function (request, reply) {
    const role = request.user?.role;
    if (!role || !roles.includes(role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires role: ${roles.join(' or ')}`,
      });
    }
  };
}

module.exports = {
  getEffectivePermissions,
  authorize,
  requireRole,
  invalidatePermissionCache,
};
