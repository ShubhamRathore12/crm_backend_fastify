'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { createMeeting } = require('../services/meetService');
// Lazy-loaded so a missing googleapis install can never crash app startup.
function gcal() { return require('../services/googleCalendarService'); }

/**
 * Additional integration action endpoints, mounted on the `/integrations`
 * prefix:
 *   POST /meeting-invite     send a meeting invite with a real Google Meet link
 *   POST /google/meet        create a standalone Google Meet (+ calendar event)
 *   GET  /google/status      Google Calendar connection status
 *   GET  /google/auth-url    start the OAuth connect flow
 *   POST /google/connect     finish OAuth (exchange code -> store refresh token)
 *   POST /google/disconnect  remove the Google connection
 *   POST /calendly/link      resolve the configured Calendly link
 *   POST /slack/notify       post a message to the configured Slack webhook
 */
async function integrationsExtraRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('integrations'));

  // â”€â”€â”€ POST /meeting-invite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/meeting-invite', {
    schema: {
      tags: ['Integrations'], summary: 'Send a meeting invite with a Google Meet link',
      body: {
        type: 'object', required: ['to_email', 'subject'],
        properties: {
          to_email: { type: 'string' },
          contact_id: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          calendly_link: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { to_email, contact_id, subject, body, calendly_link, start_time, end_time } = request.body;

    const meeting = await createMeeting({
      summary: subject,
      description: body || 'You are invited to a meeting.',
      start: start_time,
      end: end_time,
      attendees: [to_email],
    });
    const meetLink = meeting.link;
    const trackingId = uuidv4();
    const inviteId = uuidv4();
    const now = new Date().toISOString();

    try {
      await supabase.from('email_sends').insert({
        id: uuidv4(),
        tracking_id: trackingId,
        to_email,
        subject,
        entity_type: contact_id ? 'contact' : null,
        entity_id: contact_id || null,
        status: 'queued',
        created_at: now,
      });
    } catch (err) {
      fastify.log.warn({ err: err.message }, 'meeting-invite: email_sends insert skipped');
    }

    try {
      await supabase.from('meeting_invites').insert({
        id: inviteId,
        contact_id: contact_id || null,
        to_email,
        subject,
        calendly_link: calendly_link || meetLink,
        created_at: now,
      });
    } catch (err) {
      fastify.log.warn({ err: err.message }, 'meeting-invite: meeting_invites insert skipped');
    }

    try {
      const { addEmailJob } = require('../services/queueService');
      const html = `<p>${(body || 'You are invited to a meeting.').replace(/\n/g, '<br/>')}</p>` +
        `<p><a href="${meetLink}">Join Google Meet</a></p>` +
        (calendly_link ? `<p>Or pick a time: <a href="${calendly_link}">${calendly_link}</a></p>` : '');
      await addEmailJob({ to: to_email, subject, html, trackingId });
    } catch (err) {
      fastify.log.info({ to_email }, 'meeting-invite persisted (queue unavailable)');
    }

    return reply.send({
      ok: true,
      invite_id: inviteId,
      tracking_id: trackingId,
      meet_link: meetLink,
      real: meeting.real,
      event_link: meeting.htmlLink || null,
      message: meeting.real ? 'Meeting scheduled on Google Calendar' : 'Meeting invite sent',
    });
  });

  // â”€â”€â”€ POST /google/meet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/google/meet', {
    schema: {
      tags: ['Integrations'], summary: 'Create a Google Meet (+ calendar event)',
      body: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          attendee_email: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { summary, start_time, end_time, attendee_email } = request.body || {};
    const meeting = await createMeeting({
      summary: summary || 'CRM Meeting',
      start: start_time,
      end: end_time,
      attendees: attendee_email ? [attendee_email] : [],
    });
    return reply.send({
      link: meeting.link,
      real: meeting.real,
      event_link: meeting.htmlLink || null,
      event_id: meeting.eventId || null,
    });
  });

  // â”€â”€â”€ GET /google/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/google/status', {
    schema: { tags: ['Integrations'], summary: 'Google Calendar connection status' },
  }, async (request, reply) => {
    const status = await gcal().getStatus();
    return reply.send({
      provider: 'google',
      connected: status.configured,
      mode: status.mode,
      oauth_available: gcal().hasOAuthEnv(),
    });
  });

  // â”€â”€â”€ GET /google/auth-url â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/google/auth-url', {
    schema: {
      tags: ['Integrations'], summary: 'Get Google OAuth consent URL',
      querystring: { type: 'object', properties: { redirect_uri: { type: 'string' } } },
    },
  }, async (request, reply) => {
    try {
      const url = gcal().getAuthUrl(request.query.redirect_uri);
      return reply.send({ url });
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // â”€â”€â”€ POST /google/connect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/google/connect', {
    schema: {
      tags: ['Integrations'], summary: 'Complete Google OAuth (store refresh token)',
      body: {
        type: 'object', required: ['code'],
        properties: { code: { type: 'string' }, redirect_uri: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    try {
      const tokens = await gcal().exchangeCode(request.body.code, request.body.redirect_uri);
      if (!tokens.refresh_token) {
        return reply.code(400).send({
          error: 'No refresh token returned. Revoke prior access and retry with prompt=consent.',
        });
      }
      const now = new Date().toISOString();
      await supabase.from('integration_connections')
        .update({ is_active: false, updated_at: now }).eq('provider', 'google');
      await supabase.from('integration_connections').insert({
        id: uuidv4(),
        provider: 'google',
        name: 'Google Calendar',
        is_active: true,
        config: {
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
          connected_at: now,
        },
        created_at: now,
        updated_at: now,
      });
      return reply.send({ ok: true, connected: true });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  // â”€â”€â”€ POST /google/disconnect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/google/disconnect', {
    schema: { tags: ['Integrations'], summary: 'Disconnect Google Calendar' },
  }, async (request, reply) => {
    await supabase.from('integration_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('provider', 'google');
    return reply.send({ ok: true });
  });

  // â”€â”€â”€ POST /calendly/link â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/calendly/link', {
    schema: {
      tags: ['Integrations'], summary: 'Get the configured Calendly link',
      body: { type: 'object', properties: { contact_email: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { data } = await supabase.from('integration_connections')
      .select('config').eq('provider', 'calendly').eq('is_active', true).limit(1);
    const link = (data || [])[0]?.config?.scheduling_link ||
      process.env.CALENDLY_LINK || 'https://calendly.com/your-team/intro';
    return reply.send({ link });
  });

  // â”€â”€â”€ POST /slack/notify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/slack/notify', {
    schema: {
      tags: ['Integrations'], summary: 'Post a message to Slack',
      body: {
        type: 'object', required: ['message'],
        properties: { message: { type: 'string' }, channel: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { message, channel } = request.body;
    const { data } = await supabase.from('integration_connections')
      .select('config').eq('provider', 'slack').eq('is_active', true).limit(1);
    const webhookUrl = (data || [])[0]?.config?.webhook_url || process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return reply.code(400).send({ error: 'Slack not configured', ok: false });
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: channel ? `[${channel}] ${message}` : message }),
      });
      return reply.send({ ok: res.ok });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });
}

module.exports = integrationsExtraRoutes;
