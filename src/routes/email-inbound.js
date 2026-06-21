'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { createMeeting } = require('../services/meetService');

/**
 * Inbox / Outbox routes.
 *
 * Backs the frontend `/email-inbound/*` API:
 *   GET  /list           -> inbox threads (latest message preview)
 *   GET  /outbox         -> outbound / sent threads
 *   GET  /:id            -> single thread with full message history
 *   POST /send           -> compose & send a new outbound email (creates a thread)
 *   POST /:id/reply      -> reply within an existing thread
 *   POST /:id/meet       -> create a Google Meet (real link + calendar event) and send it
 *   PUT  /:id/status     -> update thread status (read / archive / close)
 *
 * Meet links are created through the Google Calendar API when connected, so
 * the recipient gets a joinable link and the call lands on Google Calendar.
 */
async function emailInboundRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('inbox'));

  const DEFAULT_FROM_NAME = process.env.MAILBOX_FROM_NAME || 'Sushil Pradhan';
  const DEFAULT_FROM_EMAIL = process.env.MAILBOX_FROM_EMAIL || 'sushilpradhan@primeosys.com';

  // ─── Helpers ────────────────────────────────────────────────
  async function latestMessageMap(emailIds) {
    if (!emailIds.length) return {};
    const { data } = await supabase
      .from('inbound_email_messages')
      .select('email_id, content, created_at')
      .in('email_id', emailIds)
      .order('created_at', { ascending: false });
    const map = {};
    for (const m of data || []) {
      if (!map[m.email_id]) map[m.email_id] = m.content;
    }
    return map;
  }

  function toInboundEmail(row, preview) {
    return {
      id: row.id,
      contact_id: row.contact_id || null,
      contact_name: row.contact_name || null,
      contact_email: row.contact_email || null,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      assigned_to: row.assigned_to || null,
      latest_message: preview || null,
      created_at: row.created_at,
    };
  }

  async function listFolder(folders, reply) {
    const { data, error } = await supabase
      .from('inbound_emails')
      .select('*')
      .in('folder', folders)
      .order('last_activity_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    const rows = data || [];
    const previews = await latestMessageMap(rows.map((r) => r.id));
    return reply.send(rows.map((r) => toInboundEmail(r, previews[r.id])));
  }

  // ─── GET /list  (inbox) ─────────────────────────────────────
  fastify.get('/list', {
    schema: { tags: ['Inbox'], summary: 'List inbox threads' },
  }, async (request, reply) => {
    return listFolder(['inbox'], reply);
  });

  // ─── GET /outbox  (outbox + sent) ───────────────────────────
  fastify.get('/outbox', {
    schema: { tags: ['Inbox'], summary: 'List outbox / sent threads' },
  }, async (request, reply) => {
    return listFolder(['outbox', 'sent'], reply);
  });

  // ─── GET /:id  (thread detail) ──────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Inbox'], summary: 'Get thread with messages',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const id = request.params.id;
    const { data: email, error } = await supabase
      .from('inbound_emails').select('*').eq('id', id).single();
    if (error || !email) return reply.code(404).send({ error: 'Not Found', message: 'Thread not found' });

    const { data: messages } = await supabase
      .from('inbound_email_messages')
      .select('*')
      .eq('email_id', id)
      .order('created_at', { ascending: true });

    return reply.send({
      id: email.id,
      contact_id: email.contact_id || null,
      subject: email.subject,
      status: email.status,
      messages: (messages || []).map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content + (m.meet_link ? `\n\nGoogle Meet: ${m.meet_link}` : ''),
        created_at: m.created_at,
      })),
    });
  });

  // ─── POST /send  (compose new outbound email) ───────────────
  fastify.post('/send', {
    schema: {
      tags: ['Inbox'], summary: 'Compose & send a new email (outbox)',
      body: {
        type: 'object', required: ['to_email', 'body'],
        properties: {
          to_email: { type: 'string' },
          to_name: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          contact_id: { type: 'string', format: 'uuid' },
          include_meet_link: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { to_email, to_name, subject, body, contact_id, include_meet_link } = request.body;
    const now = new Date().toISOString();
    const emailId = uuidv4();

    let meetLink = null;
    let googleEventId = null;
    if (include_meet_link) {
      const meeting = await createMeeting({
        summary: subject || 'CRM Meeting',
        description: body,
        attendees: [to_email],
      });
      meetLink = meeting.link;
      googleEventId = meeting.eventId || null;
    }

    const { error: e1 } = await supabase.from('inbound_emails').insert({
      id: emailId,
      contact_id: contact_id || null,
      contact_name: to_name || to_email,
      contact_email: to_email,
      subject: subject || '(no subject)',
      status: 'replied',
      priority: 'normal',
      folder: 'sent',
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    });
    if (e1) return reply.code(500).send({ error: 'Database error', message: e1.message });

    const { data: message, error: e2 } = await supabase.from('inbound_email_messages').insert({
      id: uuidv4(),
      email_id: emailId,
      sender: DEFAULT_FROM_NAME,
      sender_email: DEFAULT_FROM_EMAIL,
      direction: 'outbound',
      content: body,
      meet_link: meetLink,
      google_event_id: googleEventId,
      created_at: now,
    }).select().single();
    if (e2) return reply.code(500).send({ error: 'Database error', message: e2.message });

    await deliver({ to_email, subject: subject || '(no subject)', body, meetLink, contact_id });

    return reply.code(201).send({
      ok: true,
      id: emailId,
      message_id: message.id,
      meet_link: meetLink,
      message: 'Email sent',
    });
  });

  // ─── POST /:id/reply  (reply in thread) ─────────────────────
  fastify.post('/:id/reply', {
    schema: {
      tags: ['Inbox'], summary: 'Reply to a thread',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['body'],
        properties: {
          body: { type: 'string' },
          include_meet_link: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const id = request.params.id;
    const { body, include_meet_link } = request.body;
    const now = new Date().toISOString();

    const { data: email, error } = await supabase
      .from('inbound_emails').select('*').eq('id', id).single();
    if (error || !email) return reply.code(404).send({ error: 'Not Found', message: 'Thread not found' });

    let meetLink = null;
    let googleEventId = null;
    if (include_meet_link) {
      const meeting = await createMeeting({
        summary: email.subject,
        description: body,
        attendees: [email.contact_email],
      });
      meetLink = meeting.link;
      googleEventId = meeting.eventId || null;
    }

    const { data: message, error: e2 } = await supabase.from('inbound_email_messages').insert({
      id: uuidv4(),
      email_id: id,
      sender: DEFAULT_FROM_NAME,
      sender_email: DEFAULT_FROM_EMAIL,
      direction: 'outbound',
      content: body,
      meet_link: meetLink,
      google_event_id: googleEventId,
      created_at: now,
    }).select().single();
    if (e2) return reply.code(500).send({ error: 'Database error', message: e2.message });

    await supabase.from('inbound_emails')
      .update({ status: 'replied', last_activity_at: now, updated_at: now })
      .eq('id', id);

    await deliver({
      to_email: email.contact_email, subject: `Re: ${email.subject}`,
      body, meetLink, contact_id: email.contact_id,
    });

    return reply.code(201).send({ ok: true, message_id: message.id, meet_link: meetLink, message: 'Reply sent' });
  });

  // ─── POST /:id/meet  (create & send a Google Meet link) ─────
  fastify.post('/:id/meet', {
    schema: {
      tags: ['Inbox'], summary: 'Create a Google Meet and send it into a thread',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: { type: 'object', properties: { note: { type: 'string' }, start_time: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = request.params.id;
    const note = request.body?.note ||
      'I have set up a Google Meet for our call. Please use the link below to join.';
    const now = new Date().toISOString();

    const { data: email, error } = await supabase
      .from('inbound_emails').select('*').eq('id', id).single();
    if (error || !email) return reply.code(404).send({ error: 'Not Found', message: 'Thread not found' });

    const meeting = await createMeeting({
      summary: email.subject,
      description: note,
      start: request.body?.start_time,
      attendees: [email.contact_email],
    });
    const meetLink = meeting.link;

    const { data: message, error: e2 } = await supabase.from('inbound_email_messages').insert({
      id: uuidv4(),
      email_id: id,
      sender: DEFAULT_FROM_NAME,
      sender_email: DEFAULT_FROM_EMAIL,
      direction: 'outbound',
      content: note,
      meet_link: meetLink,
      google_event_id: meeting.eventId || null,
      created_at: now,
    }).select().single();
    if (e2) return reply.code(500).send({ error: 'Database error', message: e2.message });

    await supabase.from('inbound_emails')
      .update({ status: 'replied', last_activity_at: now, updated_at: now }).eq('id', id);

    await deliver({
      to_email: email.contact_email, subject: `Meeting invite: ${email.subject}`,
      body: `${note}\n\nGoogle Meet: ${meetLink}`, meetLink, contact_id: email.contact_id,
    });

    return reply.send({
      ok: true,
      message_id: message.id,
      meet_link: meetLink,
      real: meeting.real,
      event_link: meeting.htmlLink || null,
      message: meeting.real ? 'Google Meet scheduled on Google Calendar' : 'Google Meet link sent',
    });
  });

  // ─── PUT /:id/status ────────────────────────────────────────
  fastify.put('/:id/status', {
    schema: {
      tags: ['Inbox'], summary: 'Update thread status',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object', required: ['status'],
        properties: { status: { type: 'string', enum: ['new', 'open', 'replied', 'closed', 'archived'] } },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('inbound_emails')
      .update({ status: request.body.status, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ ok: true, data });
  });

  /**
   * Best-effort delivery. Records an email_sends row and enqueues the message
   * when the email queue is available. Never throws.
   */
  async function deliver({ to_email, subject, body, meetLink, contact_id }) {
    if (!to_email) return;
    const trackingId = uuidv4();
    try {
      await supabase.from('email_sends').insert({
        id: uuidv4(),
        tracking_id: trackingId,
        to_email,
        subject,
        entity_type: contact_id ? 'contact' : null,
        entity_id: contact_id || null,
        status: 'queued',
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.warn({ err: err.message }, 'email_sends insert skipped');
    }

    try {
      const { addEmailJob } = require('../services/queueService');
      const html = `<p>${(body || '').replace(/\n/g, '<br/>')}</p>` +
        (meetLink ? `<p><a href="${meetLink}">Join Google Meet</a></p>` : '');
      await addEmailJob({
        to: to_email,
        subject,
        html,
        trackingId,
      });
    } catch (err) {
      fastify.log.info({ to_email }, 'Outbox message persisted (queue unavailable)');
    }
  }
}

module.exports = emailInboundRoutes;
