'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');

/**
 * Zapier integration routes.
 * Handles incoming webhooks from Zapier for meetings and emails.
 */
module.exports = function(app) {
  // Catch-all Zapier webhook — logs any event
  app.post('/api/v1/zapier/webhook', async (request, reply) => {
    const { event_type, data, contact_id, user_id } = request.body;

    if (!event_type || !data) {
      return reply.code(400).send({ error: 'event_type and data required' });
    }

    try {
      // Route by event type
      if (event_type === 'meeting_scheduled') {
        await logMeeting(data, contact_id, user_id);
      } else if (event_type === 'email_received' || event_type === 'email_sent') {
        await logEmail(data, contact_id, user_id, event_type);
      }

      reply.code(200).send({ ok: true, event_type });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // Get Zapier integration status
  app.get('/api/v1/zapier/status', { onRequest: [require('../middleware/auth')] }, async (request, reply) => {
    try {
      const user_id = request.user?.id;
      if (!user_id) return reply.code(401).send({ error: 'Unauthorized' });

      // Check if user has Zapier config
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', user_id)
        .eq('provider', 'zapier')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data) {
        return reply.send({
          connected: false,
          provider: 'zapier',
          message: 'Not connected. Install Zapier app to enable.'
        });
      }

      reply.send({
        connected: true,
        provider: 'zapier',
        name: data.name,
        created_at: data.created_at,
        config: {
          email_sync: data.config?.email_sync || false,
          meeting_sync: data.config?.meeting_sync || false,
        }
      });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // Set Zapier integration config
  app.post('/api/v1/zapier/connect', { onRequest: [require('../middleware/auth')] }, async (request, reply) => {
    const { api_key, webhook_url } = request.body;
    const user_id = request.user?.id;

    if (!user_id || !api_key) {
      return reply.code(400).send({ error: 'user_id and api_key required' });
    }

    try {
      const { data, error } = await supabase
        .from('integrations')
        .upsert({
          id: uuidv4(),
          user_id,
          provider: 'zapier',
          name: 'Zapier',
          config: {
            api_key,
            webhook_url: webhook_url || `${process.env.API_BASE || 'http://localhost:8080'}/api/v1/zapier/webhook`,
            email_sync: true,
            meeting_sync: true,
            created_at: new Date().toISOString()
          }
        }, { onConflict: 'user_id,provider' });

      if (error) throw error;

      reply.send({ ok: true, message: 'Zapier connected' });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });

  // Disconnect Zapier
  app.post('/api/v1/zapier/disconnect', { onRequest: [require('../middleware/auth')] }, async (request, reply) => {
    const user_id = request.user?.id;

    if (!user_id) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('user_id', user_id)
        .eq('provider', 'zapier');

      if (error) throw error;

      reply.send({ ok: true, message: 'Zapier disconnected' });
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: err.message });
    }
  });
};

/**
 * Log meeting from Zapier.
 */
async function logMeeting(data, contact_id, user_id) {
  const { supabase } = require('../config/supabase');

  const meeting = {
    id: data.id || `zapier_meeting_${Date.now()}`,
    contact_id: contact_id || data.contact_id,
    title: data.title || 'Meeting scheduled',
    description: `Meeting scheduled: ${data.title || 'Untitled'}
Time: ${data.start_time || 'TBD'}
Attendees: ${data.attendees?.join(', ') || 'TBD'}`,
    scheduled_for: data.start_time,
    source: 'zapier',
    status: 'scheduled',
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('interactions')
    .insert([{
      id: uuidv4(),
      contact_id: meeting.contact_id,
      user_id,
      channel: 'meeting',
      subject: meeting.title,
      description: meeting.description,
      status: meeting.status,
      metadata: { zapier_meeting_id: meeting.id, ...data }
    }]);

  if (error) throw error;
}

/**
 * Log email from Zapier.
 */
async function logEmail(data, contact_id, user_id, event_type) {
  const { supabase } = require('../config/supabase');

  const email = {
    id: data.id || `zapier_email_${Date.now()}`,
    contact_id: contact_id || data.contact_id,
    subject: data.subject,
    body: data.body || data.message,
    from: data.from,
    to: data.to,
    sent_at: data.sent_at || new Date().toISOString(),
    source: 'zapier',
  };

  const { error } = await supabase
    .from('interactions')
    .insert([{
      id: uuidv4(),
      contact_id: email.contact_id,
      user_id,
      channel: 'email',
      subject: email.subject,
      description: email.body,
      status: event_type === 'email_sent' ? 'completed' : 'received',
      metadata: { zapier_email_id: email.id, from: email.from, to: email.to, ...data }
    }]);

  if (error) throw error;
}
