'use strict';

const { randomUUID } = require('crypto');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');
const { STANDARD_360, bankAccount } = require('../data/ticket-workspace-seed');

const AVATAR_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-sky-500', 'bg-orange-500', 'bg-cyan-500'];

// Routes for the Interactions / Tickets 3-pane workspace.
// Serves rich ticket objects (conversation, accounts, customer 360) from the
// ticket_workspace JSONB table seeded by scripts/seed-ticket-workspace.js.
async function ticketWorkspaceRoutes(fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('tickets'));

  // ─── GET / ─── list tickets (returns full rich objects) ───────────
  fastify.get('/', {
    schema: {
      tags: ['Interactions'],
      summary: 'List workspace tickets (rich omni-channel)',
      querystring: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { channel, status, priority, search } = request.query;
    try {
      const db = getPostgresClient();
      const params = [];
      const where = [];
      if (channel)  { where.push(`channel = $${params.length + 1}`);  params.push(channel); }
      if (status)   { where.push(`status = $${params.length + 1}`);   params.push(status); }
      if (priority) { where.push(`priority = $${params.length + 1}`); params.push(priority); }
      if (search)   { where.push(`(data->>'subject' ILIKE $${params.length + 1} OR data->'customer'->>'name' ILIKE $${params.length + 1})`); params.push(`%${search}%`); }
      const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';

      const sql = `SELECT data FROM public.ticket_workspace${whereClause} ORDER BY created_at DESC`;
      const result = await db.query(sql, params);
      return reply.send({ data: result.rows.map((r) => r.data) });
    } catch (error) {
      request.log.error({ err: error }, '[ticket-workspace] list failed');
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ─── POST / ─── create a new ticket ────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Interactions'],
      summary: 'Create a workspace ticket',
      body: {
        type: 'object',
        required: ['customerName', 'subject', 'channel'],
        properties: {
          customerName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          location: { type: 'string' },
          classification: { type: 'string' },
          channel: { type: 'string' },
          priority: { type: 'string' },
          subject: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const b = request.body || {};
      const now = new Date();
      const id = 'tw_' + randomUUID().slice(0, 8);
      const ticketNo = String(Date.now()).slice(-12);
      const phone = b.phone || '';
      const phoneMasked = phone ? '******' + phone.slice(-4) : '';
      const email = b.email || '';
      const emailMasked = email ? '******' + email.slice(Math.max(0, email.length - 12)) : '';
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      const messages = [];
      if (b.message) {
        messages.push({
          id: 'm1', direction: 'inbound', author: b.customerName,
          authorEmail: emailMasked || undefined, channel: b.channel,
          body: b.message, timestamp: now.toISOString(),
        });
      }

      const ticket = {
        id, ticketNo, subject: b.subject,
        preview: (b.message || b.subject).slice(0, 80),
        channel: b.channel, status: 'open', subStatus: 'New',
        priority: b.priority || 'medium',
        customer: {
          name: b.customerName, email, emailMasked, phone, phoneMasked,
          location: b.location || '—', customerCode: phone || email,
          classification: b.classification || 'Bronze', avatarColor: color,
        },
        assignedTo: null,
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
        slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
        firstResponseMins: null, tags: [], unread: true,
        aiSummary: `New ${b.channel} ticket from ${b.customerName}. ${b.message ? 'Initial message captured — review and respond within SLA.' : 'Awaiting first message.'}`,
        sentiment: 'neutral',
        messages,
        accounts: [bankAccount({ accountNo: ticketNo.slice(-4) })],
        customer360: STANDARD_360,
      };

      await db.query(
        `INSERT INTO public.ticket_workspace (id, ticket_no, channel, status, priority, data, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())`,
        [id, ticketNo, ticket.channel, ticket.status, ticket.priority, JSON.stringify(ticket), ticket.createdAt]
      );
      return reply.code(201).send({ data: ticket });
    } catch (error) {
      request.log.error({ err: error }, '[ticket-workspace] create failed');
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ─── PUT /:id ─── patch ticket (assignee, status, priority, …) ─────
  fastify.put('/:id', {
    schema: {
      tags: ['Interactions'],
      summary: 'Update a workspace ticket (merges into JSONB data)',
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          assignedTo: {},                       // object | null
          status: { type: 'string' },
          subStatus: { type: 'string' },
          priority: { type: 'string' },
          unread: { type: 'boolean' },
        },
        additionalProperties: true,
      },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const patch = request.body || {};

      // Merge the patch into the JSONB `data` column (top-level key merge),
      // and keep the denormalised filter columns in sync.
      const result = await db.query(
        `UPDATE public.ticket_workspace
            SET data = data || $2::jsonb,
                status   = COALESCE($3, status),
                priority = COALESCE($4, priority),
                updated_at = NOW()
          WHERE id = $1
          RETURNING data`,
        [
          request.params.id,
          JSON.stringify(patch),
          patch.status ?? null,
          patch.priority ?? null,
        ]
      );
      if (!result.rows.length) return reply.code(404).send({ error: 'Not Found' });
      return reply.send({ data: result.rows[0].data });
    } catch (error) {
      request.log.error({ err: error }, '[ticket-workspace] update failed');
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  // ─── GET /:id ─── single ticket ───────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Interactions'],
      summary: 'Get a workspace ticket',
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    try {
      const db = getPostgresClient();
      const result = await db.query('SELECT data FROM public.ticket_workspace WHERE id = $1', [request.params.id]);
      if (!result.rows.length) return reply.code(404).send({ error: 'Not Found' });
      return reply.send({ data: result.rows[0].data });
    } catch (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });
}

module.exports = ticketWorkspaceRoutes;
