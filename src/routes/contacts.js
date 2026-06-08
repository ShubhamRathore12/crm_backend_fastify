'use strict';

const { v4: uuidv4 } = require('uuid');
const { getOptimizedSupabaseClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const csvParser = require('../utils/csvParser');

/**
 * Map CSV row to contact record matching Supabase schema.
 */
function csvRowToContact(row) {
  const contact = {
    id: uuidv4(),
    email: (row.email || '').toLowerCase().trim(),
    name: row.name || row.full_name || row.fullname || '',
    mobile: row.mobile || row.phone || row.phone_number || '',
    ucc_code: row.ucc_code || row.ucc || '',
    pan: row.pan || row.pan_number || '',
    address: row.address || '',
    custom_fields: {},
    created_at: new Date().toISOString(),
  };

  const knownFields = new Set([
    'email', 'name', 'full_name', 'fullname', 'mobile', 'phone', 'phone_number',
    'ucc_code', 'ucc', 'pan', 'pan_number', 'address',
  ]);

  for (const [key, value] of Object.entries(row)) {
    if (!knownFields.has(key) && value) {
      contact.custom_fields[key] = value;
    }
  }

  return contact;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function contactsRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Get optimized database client
  const supabase = getOptimizedSupabaseClient();

  // ─── GET / ─── List contacts ───────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Contacts'],
      summary: 'List contacts',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          search: { type: 'string' },
          ucc_code: { type: 'string' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'email', 'name', 'ucc_code'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 50, search, ucc_code, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    const result = await supabase.query('contacts', 'select', {
      query: search ? {
        $or: [
          { email: { $ilike: `%${search}%` } },
          { name: { $ilike: `%${search}%` } },
          { mobile: { $ilike: `%${search}%` } },
          { ucc_code: { $ilike: `%${search}%` } },
          { pan: { $ilike: `%${search}%` } }
        ]
      } : ucc_code ? { ucc_code: { $ilike: `%${ucc_code}%` } } : {},
      select: '*',
      order: { column: sort, ascending: order === 'asc' },
      limit,
      offset,
      cache: true
    });

    if (result.error) {
      return reply.code(500).send({ error: 'Database error', message: result.error.message });
    }

    return reply.send({
      data: result.data || [],
      pagination: {
        total: result.data ? result.data.length : 0,
        page,
        limit,
        pages: Math.ceil((result.data ? result.data.length : 0) / limit),
        hasNext: offset + limit < (result.data ? result.data.length : 0),
        hasPrev: page > 1,
      },
    });
  });

  // ─── GET /:id ─── Single contact ──────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get contact by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.query('contacts', 'select', {
      query: { id: request.params.id },
      select: '*',
      cache: true
    });

    if (error || !data.data || data.data.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    const contact = data.data[0];

    // Fetch related leads
    const { data: leads } = await supabase.query('leads', 'select', {
      query: { contact_id: request.params.id },
      select: 'id, source, status, stage, created_at',
      order: { column: 'created_at', ascending: false },
      cache: true
    });

    // Fetch related interactions
    const { data: interactions } = await supabase.query('interactions', 'select', {
      query: { contact_id: request.params.id },
      select: 'id, channel, subject, status, created_at',
      order: { column: 'created_at', ascending: false },
      limit: 10,
      cache: true
    });

    // Fetch email sends
    const { data: emailSends } = await supabase.query('email_sends', 'select', {
      query: { to_email: contact.email },
      select: 'id, subject, to_email, read_at, created_at',
      order: { column: 'created_at', ascending: false },
      limit: 10,
      cache: true
    });

    return reply.send({
      data: {
        ...contact,
        leads: leads?.data || [],
        interactions: interactions?.data || [],
        email_sends: emailSends?.data || [],
      },
    });
  });

  // ─── POST / ─── Create contact ────────────────────────────────────
  fastify.post('/', {
    schema: {
      tags: ['Contacts'],
      summary: 'Create a contact',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          mobile: { type: 'string' },
          ucc_code: { type: 'string' },
          pan: { type: 'string' },
          address: { type: 'string' },
          custom_fields: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, name, mobile, ucc_code, pan, address, custom_fields = {} } = request.body;

    const normalizedEmail = email.toLowerCase().trim();
    if (!isValidEmail(normalizedEmail)) {
      return reply.code(400).send({ error: 'Validation Error', message: 'Invalid email address' });
    }

    // Check for duplicate
    const { data: existing } = await supabase.query('contacts', 'select', {
      query: { email: normalizedEmail },
      select: 'id, email',
      cache: false
    });

    if (existing?.data && existing.data.length > 0) {
      return reply.code(409).send({ error: 'Conflict', message: 'Contact with this email already exists', data: existing.data[0] });
    }

    const contact = {
      id: uuidv4(),
      email: normalizedEmail,
      name: name || '',
      mobile: mobile || '',
      ucc_code: ucc_code || '',
      pan: pan || '',
      address: address || '',
      custom_fields,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.query('contacts', 'insert', {
      data: contact,
      cache: false
    });

    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.code(201).send({ data: data?.data?.[0] || contact });
  });

  // ─── PUT /:id ─── Update contact ──────────────────────────────────
  fastify.put('/:id', {
    schema: {
      tags: ['Contacts'],
      summary: 'Update a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          mobile: { type: 'string' },
          ucc_code: { type: 'string' },
          pan: { type: 'string' },
          address: { type: 'string' },
          custom_fields: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const updates = { ...request.body };

    if (updates.email) {
      updates.email = updates.email.toLowerCase().trim();
    }

    const { data, error } = await supabase.query('contacts', 'update', {
      id,
      data: updates,
      cache: false
    });

    if (error) {
      if (error.message?.includes('not found')) return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.send({ data: data?.data?.[0] || null });
  });

  // ─── GET /:id/linked-records ─── Check linked leads and opportunities ──
  fastify.get('/:id/linked-records', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get linked leads and opportunities for a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Get linked leads
    const { data: leadsData } = await supabase.query('leads', 'select', {
      query: { contact_id: id },
      select: 'id, source, status, stage, created_at',
      order: { column: 'created_at', ascending: false },
      cache: false
    });

    const leads = leadsData?.data || [];
    const leadIds = leads.map(l => l.id);

    // Get linked opportunities
    let opportunities = [];
    if (leadIds.length > 0) {
      const { data: oppsData } = await supabase.query('opportunities', 'select', {
        query: { lead_id: { $in: leadIds } },
        select: 'id, title, stage, value, currency, created_at',
        order: { column: 'created_at', ascending: false },
        cache: false
      });
      opportunities = oppsData?.data || [];
    }

    return reply.send({
      data: {
        leads: {
          count: leads.length,
          records: leads,
        },
        opportunities: {
          count: opportunities.length,
          records: opportunities,
        },
      },
    });
  });

  // ─── DELETE /:id ───────────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Contacts'],
      summary: 'Delete a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          cascade: { type: 'boolean', default: false, description: 'If true, delete linked leads and opportunities' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { cascade = false } = request.query;

    // Check for linked leads and opportunities
    const { data: linkedLeads } = await supabase.query('leads', 'select', {
      query: { contact_id: id },
      select: 'id',
      cache: false
    });

    const { data: linkedOpps } = await supabase.query('opportunities', 'select', {
      query: { lead_id: { $in: (linkedLeads?.data || []).map(l => l.id) } },
      select: 'id',
      cache: false
    });

    const leadsCount = linkedLeads?.data?.length || 0;
    const oppsCount = linkedOpps?.data?.length || 0;

    // If cascade is false and there are linked records, return error with details
    if (!cascade && (leadsCount > 0 || oppsCount > 0)) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Contact has linked leads and/or opportunities. Set cascade=true to delete them as well.',
        linkedRecords: {
          leads: leadsCount,
          opportunities: oppsCount,
        },
      });
    }

    // If cascade is true, delete linked records first
    if (cascade && (leadsCount > 0 || oppsCount > 0)) {
      // Delete opportunities first
      if (oppsCount > 0) {
        const oppIds = (linkedOpps?.data || []).map(o => o.id);
        for (const oppId of oppIds) {
          await supabase.query('opportunities', 'delete', {
            id: oppId,
            cache: false
          });
        }
      }

      // Delete leads
      if (leadsCount > 0) {
        const leadIds = (linkedLeads?.data || []).map(l => l.id);
        for (const leadId of leadIds) {
          // Delete lead child records first
          await supabase.query('lead_scores', 'delete', {
            query: { lead_id: leadId },
            cache: false
          });
          await supabase.query('lead_history', 'delete', {
            query: { lead_id: leadId },
            cache: false
          });
          await supabase.query('lead_uploads', 'delete', {
            query: { lead_id: leadId },
            cache: false
          });

          // Delete the lead
          await supabase.query('leads', 'delete', {
            id: leadId,
            cache: false
          });
        }
      }
    }

    // Delete the contact
    const { error } = await supabase.query('contacts', 'delete', {
      id,
      cache: false
    });

    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.code(204).send();
  });

  // ─── POST /bulk-import ─── CSV import ─────────────────────────────
  fastify.post('/bulk-import', {
    schema: {
      tags: ['Contacts'],
      summary: 'Bulk import contacts from CSV',
      body: {
        type: 'object',
        required: ['csv'],
        properties: {
          csv: { type: 'string', description: 'CSV content with header row' },
          mode: { type: 'string', enum: ['insert', 'upsert', 'skip_duplicates'], default: 'upsert' },
        },
      },
    },
  }, async (request, reply) => {
    const { csv, mode = 'upsert' } = request.body;

    let rows;
    try {
      rows = await csvParser.parseString(csv);
    } catch (err) {
      return reply.code(400).send({ error: 'CSV Parse Error', message: err.message });
    }

    if (rows.length === 0) {
      return reply.code(400).send({ error: 'Validation Error', message: 'No data rows found in CSV' });
    }

    if (rows.length > 100000) {
      return reply.code(400).send({ error: 'Validation Error', message: 'Maximum 100,000 contacts per import' });
    }

    const contacts = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.email) {
        errors.push({ row: i + 2, error: 'Missing email' });
        continue;
      }

      const contact = csvRowToContact(row);
      if (!isValidEmail(contact.email)) {
        errors.push({ row: i + 2, email: row.email, error: 'Invalid email format' });
        continue;
      }

      contacts.push(contact);
    }

    if (contacts.length === 0) {
      return reply.code(400).send({ error: 'Validation Error', message: 'No valid contacts to import', errors });
    }

    const CHUNK_SIZE = 1000;
    let inserted = 0;

    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE);

      if (mode === 'upsert') {
        const { data, error } = await supabase.query('contacts', 'insert', {
          data: chunk,
          options: { onConflict: 'email' },
          cache: false
        });
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.data?.length || 0;
      } else if (mode === 'insert') {
        const { data, error } = await supabase.query('contacts', 'insert', {
          data: chunk,
          cache: false
        });
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.data?.length || 0;
      } else if (mode === 'skip_duplicates') {
        const { data, error } = await supabase.query('contacts', 'insert', {
          data: chunk,
          options: { onConflict: 'email', ignoreDuplicates: true },
          cache: false
        });
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.data?.length || 0;
      }
    }

    return reply.send({
      message: 'Import complete',
      stats: { total: rows.length, processed: contacts.length, inserted, errors: errors.length },
      errors: errors.slice(0, 100),
    });
  });

  // ─── POST /bulk-delete ────────────────────────────────────────────
  fastify.post('/bulk-delete', {
    schema: {
      tags: ['Contacts'],
      summary: 'Bulk delete contacts',
      body: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 10000 },
        },
      },
    },
  }, async (request, reply) => {
    const { ids } = request.body;
    
    // Batch delete operations
    const deleteOperations = ids.map(id => ({
      table: 'contacts',
      operation: 'delete',
      options: { id }
    }));

    const results = await supabase.batchOperations(deleteOperations);
    
    const deletedCount = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success);

    if (errors.length > 0) {
      return reply.code(500).send({ 
        error: 'Database error', 
        message: `Failed to delete ${errors.length} contacts`,
        details: errors.map(e => e.error || 'Unknown error')
      });
    }

    return reply.send({ deleted: deletedCount });
  });

  // ─── GET /:id/leads ─── Contact's leads ──────────────────────────
  fastify.get('/:id/leads', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get all leads for a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase.query('leads', 'select', {
      query: { contact_id: request.params.id },
      select: '*, lead_scores(score, confidence, prediction)',
      order: { column: 'created_at', ascending: false },
      cache: true
    });

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data?.data || [] });
  });

  // ─── GET /:id/interactions ─── Contact's interactions ─────────────
  fastify.get('/:id/interactions', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get all interactions for a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase.query('interactions', 'select', {
      query: { contact_id: request.params.id },
      select: '*',
      order: { column: 'created_at', ascending: false },
      limit,
      offset,
      cache: true
    });

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data: data?.data || [],
      pagination: { total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  });

  // ─── GET /:id/email-history ─── Contact email sends ───────────────
  fastify.get('/:id/email-history', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get email send history for a contact',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;

    // Get contact email first
    const { data: contact } = await supabase.query('contacts', 'select', {
      query: { id },
      select: 'email',
      cache: true
    });

    if (!contact?.data || contact.data.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    const contactEmail = contact.data[0].email;

    const { data, error, count } = await supabase.query('email_sends', 'select', {
      query: { to_email: contactEmail },
      select: '*',
      order: { column: 'created_at', ascending: false },
      limit,
      offset,
      cache: true
    });

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data: data?.data || [],
      pagination: { total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  });

  // ─── GET /stats ─── Contact statistics ────────────────────────────
  fastify.get('/stats', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get contact statistics',
    },
  }, async (request, reply) => {
    const { data: totalCount } = await supabase.query('contacts', 'count', {
      cache: true
    });

    const { data: recentContacts } = await supabase.query('contacts', 'select', {
      select: 'id, name, email, created_at',
      order: { column: 'created_at', ascending: false },
      limit: 5,
      cache: true
    });

    return reply.send({
      data: {
        total: totalCount?.count || 0,
        recent: recentContacts?.data || [],
      },
    });
  });
}

module.exports = contactsRoutes;
