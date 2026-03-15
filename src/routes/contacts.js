'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

/**
 * Parse simple CSV text into array of objects.
 */
function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += char; }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

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

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order(sort, { ascending: order === 'asc' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%,mobile.ilike.%${search}%,ucc_code.ilike.%${search}%,pan.ilike.%${search}%`);
    }
    if (ucc_code) query = query.ilike('ucc_code', `%${ucc_code}%`);

    const { data, error, count } = await query;
    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.send({
      data,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
        hasNext: offset + limit < count,
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
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', request.params.id)
      .single();

    if (error || !data) {
      return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    // Fetch related leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, source, status, stage, created_at')
      .eq('contact_id', request.params.id)
      .order('created_at', { ascending: false });

    // Fetch related interactions
    const { data: interactions } = await supabase
      .from('interactions')
      .select('id, channel, subject, status, created_at')
      .eq('contact_id', request.params.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch email sends
    const { data: emailSends } = await supabase
      .from('email_sends')
      .select('id, subject, to_email, read_at, created_at')
      .eq('to_email', data.email)
      .order('created_at', { ascending: false })
      .limit(10);

    return reply.send({
      data: {
        ...data,
        leads: leads || [],
        interactions: interactions || [],
        email_sends: emailSends || [],
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
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Contact with this email already exists', data: existing });
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

    const { data, error } = await supabase.from('contacts').insert(contact).select().single();
    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.code(201).send({ data });
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

    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.send({ data });
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
    },
  }, async (request, reply) => {
    const { error } = await supabase.from('contacts').delete().eq('id', request.params.id);
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
      rows = parseCSV(csv);
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
        const { data, error } = await supabase
          .from('contacts')
          .upsert(chunk, { onConflict: 'email', ignoreDuplicates: false })
          .select('id');
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.length || 0;
      } else if (mode === 'insert') {
        const { data, error } = await supabase.from('contacts').insert(chunk).select('id');
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.length || 0;
      } else if (mode === 'skip_duplicates') {
        const { data, error } = await supabase
          .from('contacts')
          .upsert(chunk, { onConflict: 'email', ignoreDuplicates: true })
          .select('id');
        if (error) { errors.push({ chunk: Math.floor(i / CHUNK_SIZE), error: error.message }); continue; }
        inserted += data?.length || 0;
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
    const { error, count } = await supabase.from('contacts').delete({ count: 'exact' }).in('id', ids);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ deleted: count });
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
    const { data, error } = await supabase
      .from('leads')
      .select('*, lead_scores(score, confidence, prediction)')
      .eq('contact_id', request.params.id)
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.send({ data: data || [] });
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

    const { data, error, count } = await supabase
      .from('interactions')
      .select('*', { count: 'exact' })
      .eq('contact_id', request.params.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data: data || [],
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
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
    const { data: contact } = await supabase
      .from('contacts')
      .select('email')
      .eq('id', id)
      .single();

    if (!contact) {
      return reply.code(404).send({ error: 'Not Found', message: 'Contact not found' });
    }

    const { data, error, count } = await supabase
      .from('email_sends')
      .select('*', { count: 'exact' })
      .eq('to_email', contact.email)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.send({
      data: data || [],
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  });

  // ─── GET /stats ─── Contact statistics ────────────────────────────
  fastify.get('/stats', {
    schema: {
      tags: ['Contacts'],
      summary: 'Get contact statistics',
    },
  }, async (request, reply) => {
    const { count: totalCount } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true });

    const { data: recentContacts } = await supabase
      .from('contacts')
      .select('id, name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    return reply.send({
      data: {
        total: totalCount || 0,
        recent: recentContacts || [],
      },
    });
  });
}

module.exports = contactsRoutes;
