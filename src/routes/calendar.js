'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { createMeeting } = require('../services/meetService');

/**
 * Calendar event routes (mounted under `/api/v1/calendar`).
 *   GET    /events        list events (optional start/end/type filters)
 *   GET    /events/:id    single event
 *   POST   /events        create an event (optional real Google Meet link)
 *   PUT    /events/:id     update an event
 *   DELETE /events/:id     delete an event
 *
 * When `add_meet_link` is true, a real Google Calendar event with a Meet
 * conference is created (if Google is connected) so the link is joinable and
 * the call is scheduled on Google Calendar.
 */
async function calendarRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);

  // ─── GET /events ────────────────────────────────────────────
  fastify.get('/events', {
    schema: {
      tags: ['Calendar'], summary: 'List calendar events',
      querystring: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          event_type: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { start, end, event_type } = request.query;
    let query = supabase.from('calendar_events').select('*').order('start_time', { ascending: true });
    if (start) query = query.gte('start_time', start);
    if (end) query = query.lte('start_time', end);
    if (event_type) query = query.eq('event_type', event_type);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
  });

  // ─── GET /events/:id ────────────────────────────────────────
  fastify.get('/events/:id', {
    schema: {
      tags: ['Calendar'], summary: 'Get a calendar event',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('calendar_events')
      .select('*').eq('id', request.params.id).single();
    if (error || !data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── POST /events ───────────────────────────────────────────
  fastify.post('/events', {
    schema: {
      tags: ['Calendar'], summary: 'Create a calendar event',
      body: {
        type: 'object', required: ['title', 'start_time'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          event_type: { type: 'string', default: 'event' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          all_day: { type: 'boolean', default: false },
          location: { type: 'string' },
          contact_id: { type: 'string', format: 'uuid' },
          lead_id: { type: 'string', format: 'uuid' },
          assigned_to: { type: 'string', format: 'uuid' },
          attendee_email: { type: 'string' },
          add_meet_link: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { add_meet_link, attendee_email, ...body } = request.body;
    const now = new Date().toISOString();

    let meetLink = null;
    let googleEventId = null;
    let googleHtmlLink = null;

    if (add_meet_link) {
      const meeting = await createMeeting({
        summary: body.title,
        description: body.description || '',
        start: body.start_time,
        end: body.end_time,
        attendees: attendee_email ? [attendee_email] : [],
      });
      meetLink = meeting.link;
      googleEventId = meeting.eventId || null;
      googleHtmlLink = meeting.htmlLink || null;
    }

    const record = {
      id: uuidv4(),
      ...body,
      meet_link: meetLink,
      google_event_id: googleEventId,
      google_html_link: googleHtmlLink,
      status: 'scheduled',
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await supabase.from('calendar_events').insert(record).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(201).send({ data });
  });

  // ─── PUT /events/:id ────────────────────────────────────────
  fastify.put('/events/:id', {
    schema: {
      tags: ['Calendar'], summary: 'Update a calendar event',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          event_type: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          all_day: { type: 'boolean' },
          location: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.from('calendar_events')
      .update({ ...request.body, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    if (!data) return reply.code(404).send({ error: 'Not Found' });
    return reply.send({ data });
  });

  // ─── DELETE /events/:id ─────────────────────────────────────
  fastify.delete('/events/:id', {
    schema: {
      tags: ['Calendar'], summary: 'Delete a calendar event',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', request.params.id);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(204).send();
  });
}

module.exports = calendarRoutes;
