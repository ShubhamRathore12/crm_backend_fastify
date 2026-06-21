'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { getPostgresClient } = require('../config/postgres');
const { authenticate } = require('../middleware/auth');
const { substituteVariables } = require('../services/emailService');

/**
 * Extract variable names from a template string.
 * Finds all {{variableName}} patterns.
 * @param {string} content
 * @returns {string[]}
 */
function extractVariables(content) {
  if (!content) return [];
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set();
  for (const match of matches) {
    vars.add(match[1]);
  }
  return [...vars];
}

/**
 * Validate that a template has required fields.
 * @param {Object} template
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTemplate(template) {
  const errors = [];

  if (!template.name?.trim()) errors.push('Template name is required');
  if (!template.html_body?.trim() && !template.text_body?.trim()) {
    errors.push('Template must have html_body or text_body');
  }

  return { valid: errors.length === 0, errors };
}

async function templatesRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', require('../middleware/rbac').authorize('templates'));

  /**
   * GET /templates
   * List all templates.
   */
  fastify.get('/', {
    schema: {
      tags: ['Templates'],
      summary: 'List email templates',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          sort: { type: 'string', default: 'created_at', enum: ['created_at', 'name', 'updated_at'] },
          order: { type: 'string', default: 'desc', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, search, sort = 'created_at', order = 'desc' } = request.query;
    const offset = (page - 1) * limit;

    try {
      const db = getPostgresClient();

      // Build WHERE clause
      const params = [];
      let whereConditions = [];

      if (search) {
        whereConditions.push(`(name ILIKE $${params.length + 1} OR subject ILIKE $${params.length + 1})`);
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM templates${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const count = countResult.rows[0]?.count || 0;

      // Get paginated data with ordering
      const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT id, name, subject, variables, created_at, updated_at FROM templates${whereClause} ORDER BY ${sort} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      return reply.send({
        data: result.rows || [],
        pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
      });
    } catch (error) {
      console.error('[Templates] GET / error:', error);
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }
  });

  /**
   * GET /templates/:id
   * Get a template by ID including full body.
   */
  fastify.get('/:id', {
    schema: {
      tags: ['Templates'],
      summary: 'Get template by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', request.params.id)
      .single();

    if (error || !data) {
      return reply.code(404).send({ error: 'Not Found', message: 'Template not found' });
    }
    return reply.send({ data });
  });

  /**
   * POST /templates
   * Create a new email template.
   */
  fastify.post('/', {
    schema: {
      tags: ['Templates'],
      summary: 'Create an email template',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          subject: { type: 'string', maxLength: 998, description: 'Default email subject (supports {{variables}})' },
          html_body: { type: 'string', description: 'HTML email body with {{variable}} placeholders' },
          text_body: { type: 'string', description: 'Plain text email body' },
          metadata: { type: 'object', description: 'Custom metadata' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, subject = '', html_body = '', text_body = '', metadata = {} } = request.body;

    const validation = validateTemplate({ name, html_body, text_body });
    if (!validation.valid) {
      return reply.code(400).send({ error: 'Validation Error', errors: validation.errors });
    }

    // Extract variables from all content
    const allContent = `${subject} ${html_body} ${text_body}`;
    const variables = extractVariables(allContent);

    const template = {
      id: uuidv4(),
      name: name.trim(),
      subject,
      html_body,
      text_body,
      variables,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('templates').insert(template).select().single();
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });

    return reply.code(201).send({ data });
  });

  /**
   * PATCH /templates/:id
   * Update a template.
   */
  fastify.patch('/:id', {
    schema: {
      tags: ['Templates'],
      summary: 'Update a template',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          subject: { type: 'string', maxLength: 998 },
          html_body: { type: 'string' },
          text_body: { type: 'string' },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, subject, html_body, text_body, metadata } = request.body;

    // Build update object (only include provided fields)
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (subject !== undefined) updates.subject = subject;
    if (html_body !== undefined) updates.html_body = html_body;
    if (text_body !== undefined) updates.text_body = text_body;
    if (metadata !== undefined) updates.metadata = metadata;

    // Re-extract variables if content changed
    if (html_body !== undefined || text_body !== undefined || subject !== undefined) {
      const { data: existing } = await supabase.from('templates').select('subject, html_body, text_body').eq('id', id).single();
      const allContent = [
        subject ?? existing?.subject ?? '',
        html_body ?? existing?.html_body ?? '',
        text_body ?? existing?.text_body ?? '',
      ].join(' ');
      updates.variables = extractVariables(allContent);
    }

    const { data, error } = await supabase.from('templates').update(updates).eq('id', id).select().single();
    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send({ error: 'Not Found', message: 'Template not found' });
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.send({ data });
  });

  /**
   * DELETE /templates/:id
   * Delete a template (only if not used by active campaigns).
   */
  fastify.delete('/:id', {
    schema: {
      tags: ['Templates'],
      summary: 'Delete a template',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Check if template is used by any non-cancelled campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('template_id', id)
      .not('status', 'in', '("cancelled","draft")');

    if (campaigns && campaigns.length > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Template is used by active campaigns and cannot be deleted',
        campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
      });
    }

    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) return reply.code(500).send({ error: 'Database error', message: error.message });
    return reply.code(204).send();
  });

  /**
   * POST /templates/:id/preview
   * Render a template with variable substitution and return the result.
   */
  fastify.post('/:id/preview', {
    schema: {
      tags: ['Templates'],
      summary: 'Preview template with variable substitution',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          variables: {
            type: 'object',
            description: 'Variable values to substitute',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { variables = {} } = request.body || {};

    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !template) {
      return reply.code(404).send({ error: 'Not Found', message: 'Template not found' });
    }

    // Fill in sample values for any missing variables
    const sampleValues = {
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
      email: 'john.doe@example.com',
      company: 'Acme Corp',
      phone: '+1-555-0100',
      unsubscribe_url: 'https://example.com/unsubscribe?token=sample',
      ...variables,
    };

    const renderedSubject = substituteVariables(template.subject || '', sampleValues);
    const renderedHtml = substituteVariables(template.html_body || '', sampleValues);
    const renderedText = substituteVariables(template.text_body || '', sampleValues);

    // Check for unresolved variables
    const unresolvedVars = [];
    const allContent = `${renderedSubject} ${renderedHtml} ${renderedText}`;
    const remaining = allContent.matchAll(/\{\{(\w+)\}\}/g);
    for (const match of remaining) {
      if (!unresolvedVars.includes(match[1])) unresolvedVars.push(match[1]);
    }

    return reply.send({
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      variables: template.variables,
      providedVariables: Object.keys(variables),
      unresolvedVariables: unresolvedVars,
      warnings: unresolvedVars.length > 0
        ? [`${unresolvedVars.length} variable(s) not provided: ${unresolvedVars.join(', ')}`]
        : [],
    });
  });

  /**
   * POST /templates/:id/duplicate
   * Duplicate a template.
   */
  fastify.post('/:id/duplicate', {
    schema: {
      tags: ['Templates'],
      summary: 'Duplicate a template',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name for the duplicate (defaults to "Copy of <original name>")' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { name } = request.body || {};

    const { data: original, error } = await supabase.from('templates').select('*').eq('id', id).single();
    if (error || !original) {
      return reply.code(404).send({ error: 'Not Found', message: 'Template not found' });
    }

    const duplicate = {
      ...original,
      id: uuidv4(),
      name: name || `Copy of ${original.name}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error: insertError } = await supabase.from('templates').insert(duplicate).select().single();
    if (insertError) return reply.code(500).send({ error: 'Database error', message: insertError.message });

    return reply.code(201).send({ data });
  });
}

module.exports = templatesRoutes;
