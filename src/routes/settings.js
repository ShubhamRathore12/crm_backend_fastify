'use strict';

const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');

// Lazily ensure the app_settings key-value table exists. Idempotent.
let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

async function settingsRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', {
    schema: { tags: ['Integrations'], summary: 'List all app settings' },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      await ensureTable(db);
      const result = await db.query('SELECT key, value FROM app_settings');
      const map = {};
      for (const row of result.rows || []) map[row.key] = row.value;
      return reply.send({ data: map });
    } catch (error) {
      console.error('[Settings] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.get('/:key', {
    schema: {
      tags: ['Integrations'], summary: 'Get a settings group',
      params: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      await ensureTable(db);
      const result = await db.query('SELECT value FROM app_settings WHERE key = $1', [request.params.key]);
      return reply.send({ data: result.rows[0] ? result.rows[0].value : null });
    } catch (error) {
      console.error('[Settings] GET /:key error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  fastify.put('/:key', {
    schema: {
      tags: ['Integrations'], summary: 'Create or update a settings group',
      params: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
      body: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'object', additionalProperties: true } },
      },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      await ensureTable(db);
      const value = request.body.value || {};
      const result = await db.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING value`,
        [request.params.key, JSON.stringify(value)]
      );
      return reply.send({ data: result.rows[0].value });
    } catch (error) {
      console.error('[Settings] PUT /:key error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });
}

module.exports = settingsRoutes;
