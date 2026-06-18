'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

/**
 * Zapier integration routes.
 *
 * Mounted under the `/api/v1/zapier` prefix, so all paths here are RELATIVE.
 *   POST /webhook      (public)  incoming events from Zapier
 *   GET  /status       (auth)    connection status
 *   POST /connect      (auth)    save api key + sync config
 *   POST /disconnect   (auth)    remove connection
 *
 * Connections are stored in the shared `integration_connections` table
 * (provider = 'zapier') so they also appear under Settings > Integrations.
 */
module.exports = function zapierRoutes(app, opts, done) {
  // ─── Incoming webhook (no auth — Zapier posts here) ─────────
  app.post('/webhook', async (request, reply) => {
    const { event_type, data, contact_id, user_id } = request.body || {};

    if (!event_type || !data) {
      return reply.code(400).send({ error: 'event_type and data required' });
    }

    try {
      if (event_type === 'meeting_scheduled') {
        await logEvent('meeting', data, contact_id, user_id, 'received');
      } else if (event_type === 'email_received') {
        await logEvent('email', data, contact_id, user_id, 'received');
      } else if (event_type === 'email_sent') {
        await logEvent('email', data, contact_id, user_id, 'completed');
      }
      reply.code(200).send({ ok: true, event_type });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // ─── Status ─────────────────────────────────────────────────
  app.get('/status', { onRequest: [authenticate] }, async (request, reply) => {
    try {
      const { data, error } = await supabase
        .from('integration_connections')
        .select('*')
        .eq('provider', 'zapier')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const conn = (data || [])[0];

      if (!conn) {
        return reply.send({
          connected: false,
          provider: 'zapier',
          message: 'Not connected. Add your Zapier API key to enable syncing.',
        });
      }

      reply.send({
        connected: true,
        provider: 'zapier',
        name: conn.name || 'Zapier',
        created_at: conn.created_at,
        config: {
          email_sync: conn.config?.email_sync !== false,
          meeting_sync: conn.config?.meeting_sync !== false,
        },
      });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // ─── Connect ────────────────────────────────────────────────
  app.post('/connect', { onRequest: [authenticate] }, async (request, reply) => {
    const { api_key, webhook_url, email_sync, meeting_sync } = request.body || {};
    if (!api_key) return reply.code(400).send({ error: 'api_key required' });

    try {
      const now = new Date().toISOString();
      // Deactivate any prior zapier connections, then insert a fresh one.
      await supabase.from('integration_connections')
        .update({ is_active: false, updated_at: now }).eq('provider', 'zapier');

      const { data, error } = await supabase.from('integration_connections').insert({
        id: uuidv4(),
        provider: 'zapier',
        name: 'Zapier',
        is_active: true,
        config: {
          api_key,
          webhook_url: webhook_url ||
            `${process.env.API_BASE_URL || 'http://localhost:8080'}/api/v1/zapier/webhook`,
          email_sync: email_sync !== false,
          meeting_sync: meeting_sync !== false,
        },
        created_at: now,
        updated_at: now,
      }).select().single();

      if (error) throw error;
      reply.send({ ok: true, message: 'Zapier connected', id: data.id });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // ─── Disconnect ─────────────────────────────────────────────
  app.post('/disconnect', { onRequest: [authenticate] }, async (request, reply) => {
    try {
      const { error } = await supabase.from('integration_connections')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('provider', 'zapier');
      if (error) throw error;
      reply.send({ ok: true, message: 'Zapier disconnected' });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  done();
};

/**
 * Persist a Zapier-sourced event as an interaction (best-effort).
 */
async function logEvent(channel, data, contact_id, user_id, status) {
  const subject = data.title || data.subject || (channel === 'meeting' ? 'Meeting scheduled' : 'Email');
  const description = channel === 'meeting'
    ? `Meeting: ${data.title || 'Untitled'}\nTime: ${data.start_time || 'TBD'}\nAttendees: ${(data.attendees || []).join(', ') || 'TBD'}`
    : (data.body || data.message || '');

  await supabase.from('interactions').insert([{
    id: uuidv4(),
    contact_id: contact_id || data.contact_id || null,
    channel,
    subject,
    description,
    status,
    metadata: { source: 'zapier', user_id, ...data },
    created_at: new Date().toISOString(),
  }]);
}
