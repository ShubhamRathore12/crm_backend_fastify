'use strict';

/**
 * Canonical list of access-controlled modules.
 * Keep in sync with the seed list in supabase/rbac-tasks-products-migration.sql
 * and the frontend lib/permissions.ts MODULES array.
 */
const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'leads', label: 'Leads' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'templates', label: 'Templates' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'calls', label: 'Calls' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'inbox', label: 'Inbox / Email' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'sales_marketing', label: 'Sales & Marketing' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'users', label: 'Users & Teams' },
  { key: 'settings', label: 'Settings' },
  { key: 'access_control', label: 'Access Control' },
];

const MODULE_KEYS = MODULES.map((m) => m.key);

const ACTIONS = ['read', 'write', 'edit', 'delete'];

/**
 * Map an HTTP method to a CRUD action.
 * GET/HEAD -> read, POST -> write (create), PUT/PATCH -> edit, DELETE -> delete.
 * @param {string} method
 * @returns {'read'|'write'|'edit'|'delete'}
 */
function methodToAction(method) {
  switch ((method || '').toUpperCase()) {
    case 'POST':
      return 'write';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'delete';
    default:
      return 'read';
  }
}

module.exports = { MODULES, MODULE_KEYS, ACTIONS, methodToAction };
