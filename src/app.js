'use strict';

require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const swagger = require('@fastify/swagger');
const swaggerUI = require('@fastify/swagger-ui');
const cron = require('node-cron');
const compression = require('./middleware/compression');
const cacheMiddleware = require('./middleware/cache');

const { checkSupabaseHealth } = require('./config/supabase');
const { getOptimizedSupabaseClient } = require('./config/database');
const { checkRedisHealth, getRedisClient, closeRedisConnections } = require('./config/redis');
const { syncBlockListsFromDB } = require('./services/emailService');
const { getProviderHealth } = require('./services/providerService');
const { closeQueues } = require('./services/queueService');

const contactsRoutes = require('./routes/contacts');
const campaignsRoutes = require('./routes/campaigns');
const templatesRoutes = require('./routes/templates');
const analyticsRoutes = require('./routes/analytics');
const webhooksRoutes = require('./routes/webhooks');
const leadsRoutes = require('./routes/leads');
const opportunitiesRoutes = require('./routes/opportunities');
const interactionsRoutes = require('./routes/interactions');
const tasksRoutes = require('./routes/tasks');
const usersRoutes = require('./routes/users');
const workflowsRoutes = require('./routes/workflows');
const callsRoutes = require('./routes/calls');
const emailSendsRoutes = require('./routes/email-sends');
const bulkUploadsRoutes = require('./routes/bulk-uploads');
const attachmentsRoutes = require('./routes/attachments');
const salesFormsRoutes = require('./routes/sales-forms');
const aiRoutes = require('./routes/ai');
const integrationsRoutes = require('./routes/integrations');
const zapierRoutes = require('./routes/zapier');
const emailInboundRoutes = require('./routes/email-inbound');
const integrationsExtraRoutes = require('./routes/integrations-extra');
const settingsRoutes = require('./routes/settings');
const calendarRoutes = require('./routes/calendar');
const authRoutes = require('./routes/auth');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Build and configure the Fastify application.
 * @returns {import('fastify').FastifyInstance}
 */
async function buildApp() {
  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      ...(process.env.LOG_PRETTY === 'true'
        ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
          },
        }
        : {}),
    },
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 1048576, // 1MB
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['kind', 'modifier'],
        coerceTypes: true,
        removeAdditional: true,
        useDefaults: true,
      },
    },
  });

  // =========================================================================
  // DEBUG: Log all requests
  // =========================================================================
  app.addHook('preHandler', async (request, reply) => {
    request.log.info({ 
      url: request.url, 
      method: request.method,
      body: request.body 
    }, 'PRE-HANDLER HOOK');
  });

  // =========================================================================
  // Plugins
  // =========================================================================

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allow inline styles for Swagger UI
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Cookies (for JWT auth)
  await app.register(cookie, {
    secret: process.env.JWT_SECRET,
  });

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'], // Development defaults
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Accept', 'Accept-Language', 'Content-Language'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'Content-Length'],
    credentials: true,
    maxAge: 86400,
    preflightContinue: false,
  });

  // Compression (gzip/brotli)
  await app.register(compression);

  // Cache middleware
  await cacheMiddleware.setup(app);

  // Rate limiting (per IP) - use Redis if available, fallback to in-memory
  const redisClient = getRedisClient();
  await app.register(rateLimit, {
    global: true,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    ...(redisClient ? { redis: redisClient } : {}),
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for']?.split(',')[0].trim() ||
        request.headers['x-real-ip'] ||
        request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
    allowList: ['/health', '/ready', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/dev-token'],
  });

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'CRM Backend API',
        description: 'High-throughput CRM with 1M+ email sending via BullMQ + multi-provider rotation',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'support@yourcompany.com',
        },
      },
      host: process.env.API_BASE_URL?.replace('https://', '').replace('http://', '') || `localhost:${PORT}`,
      schemes: [process.env.NODE_ENV === 'production' ? 'https' : 'http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        cookieAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Cookie',
          description: 'JWT stored in httpOnly cookie "crm_token". Auto-set on login.',
        },
        bearerAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Bearer JWT token. Format: "Bearer <token>". Get token from POST /api/v1/auth/login',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for service-to-service. Format: "crm_<key>". Generate via POST /api/v1/auth/api-key',
        },
      },
      security: [{ cookieAuth: [] }, { bearerAuth: [] }, { apiKey: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication - Login, Register, Logout, JWT tokens & API keys' },
        { name: 'Contacts', description: 'Contact management (ucc_code, name, mobile, email, pan, address)' },
        { name: 'Leads', description: 'Lead management, scoring, assignment & history tracking' },
        { name: 'Opportunities', description: 'Deal pipeline management & stage tracking' },
        { name: 'Interactions', description: 'Customer interactions, messages, escalations & AI analysis' },
        { name: 'Tasks', description: 'General tasks & sales/marketing tasks with kanban board' },
        { name: 'Users', description: 'User & team management with activity tracking' },
        { name: 'Campaigns', description: 'Email campaign management with Redis queue (10L+ emails)' },
        { name: 'Templates', description: 'Email template management with variable substitution' },
        { name: 'Email Sends', description: 'Email send tracking, read receipts & meeting invites' },
        { name: 'Workflows', description: 'Workflow automation, triggers, schedules & run tracking' },
        { name: 'AI', description: 'AI configuration, sales predictions, model retraining & performance' },
        { name: 'Calls', description: 'Call log management with agent tracking & stats' },
        { name: 'Bulk Uploads', description: 'Bulk data upload progress tracking' },
        { name: 'Attachments', description: 'File attachment management for any entity' },
        { name: 'Sales Forms', description: 'Sales form builder with public submission endpoint' },
        { name: 'Integrations', description: 'Integration connections & custom field definitions' },
        { name: 'Analytics', description: 'CRM dashboard, lead/opportunity/campaign analytics & system health' },
        { name: 'Webhooks', description: 'Provider webhook endpoints (SES, SendGrid, Mailgun)' },
        { name: 'Health', description: 'Liveness & readiness probes' },
      ],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });

  // =========================================================================
  // Routes
  // =========================================================================

  // Auth routes (no prefix - public endpoints)
  app.register(authRoutes, { prefix: '/api/v1/auth' });

  // API routes (v1)
  app.register(async (v1) => {
    // Core CRM
    v1.register(contactsRoutes, { prefix: '/contacts' });
    v1.register(leadsRoutes, { prefix: '/leads' });
    v1.register(opportunitiesRoutes, { prefix: '/opportunities' });
    v1.register(interactionsRoutes, { prefix: '/interactions' });
    v1.register(tasksRoutes, { prefix: '/tasks' });
    v1.register(usersRoutes, { prefix: '/users' });

    // Email & Campaigns
    v1.register(campaignsRoutes, { prefix: '/campaigns' });
    v1.register(templatesRoutes, { prefix: '/templates' });
    v1.register(emailSendsRoutes, { prefix: '/email-sends' });

    // Automation & AI
    v1.register(workflowsRoutes, { prefix: '/workflows' });
    v1.register(aiRoutes, { prefix: '/ai' });

    // Communication
    v1.register(callsRoutes, { prefix: '/calls' });

    // Utilities
    v1.register(bulkUploadsRoutes, { prefix: '/bulk-uploads' });
    v1.register(attachmentsRoutes, { prefix: '/attachments' });
    v1.register(salesFormsRoutes, { prefix: '/sales-forms' });
    v1.register(integrationsRoutes, { prefix: '/integrations' });
    v1.register(integrationsExtraRoutes, { prefix: '/integrations' });
    v1.register(settingsRoutes, { prefix: '/settings' });
    v1.register(emailInboundRoutes, { prefix: '/email-inbound' });
    v1.register(calendarRoutes, { prefix: '/calendar' });
    v1.register(zapierRoutes, { prefix: '/zapier' });

    // Analytics
    v1.register(analyticsRoutes, { prefix: '/analytics' });
  }, { prefix: '/api/v1' });

  // Webhook routes (no auth, rely on signature verification)
  app.register(webhooksRoutes, { prefix: '/webhooks' });

  // Tracking routes (no auth)
  app.register(webhooksRoutes, { prefix: '' }); // mounts /track/open, /track/click, /unsubscribe

  // =========================================================================
  // Health & Readiness
  // =========================================================================

  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      description: 'Simple health check â€” always returns 200 if app is running',
    },
  }, async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' };
  });

  app.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe',
      description: 'Returns 200 only if all dependencies are available',
    },
  }, async (request, reply) => {
    const [supabaseOk, redisOk] = await Promise.all([
      checkSupabaseHealth(),
      checkRedisHealth(),
    ]);

    const ready = supabaseOk && redisOk;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      dependencies: {
        supabase: supabaseOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down',
      },
    });
  });

  // =========================================================================
  // Error handler
  // =========================================================================

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error, path: request.url, method: request.method }, 'Request error');

    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.validation.map((v) => ({
          field: v.instancePath || v.params?.missingProperty || 'unknown',
          message: v.message,
        })),
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
      });
    }

    return reply.code(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return app;
}

/**
 * Setup cron jobs for maintenance tasks.
 * @param {import('fastify').FastifyInstance} app
 */
function setupCronJobs(app) {
  // Sync block lists from DB to Redis every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    app.log.info('Cron: Syncing block lists from database');
    try {
      await syncBlockListsFromDB();
    } catch (err) {
      app.log.error({ err }, 'Cron: Block list sync failed');
    }
  });

  // Update campaign completion status every 5 minutes - OPTIMIZED
  cron.schedule('*/5 * * * *', async () => {
    try {
      const supabase = getOptimizedSupabaseClient();

      // Single query to find campaigns ready for completion
      const { data: campaigns } = await supabase.query('campaigns', 'select', {
        query: { status: 'dispatched' },
        select: 'id, queued_count',
        cache: false,
      });

      if (!campaigns.data || campaigns.data.length === 0) return;

      // Batch check queued counts
      const campaignIds = campaigns.data.map(c => c.id);
      
      // Single query to get queued counts for all campaigns
      const { data: queuedCounts } = await supabase.query('email_logs', 'select', {
        query: { 
          campaign_id: { $in: campaignIds },
          status: 'queued'
        },
        select: 'campaign_id',
        cache: false,
      });

      // Count queued emails per campaign
      const queuedByCampaign = {};
      if (queuedCounts.data) {
        queuedCounts.data.forEach(log => {
          queuedByCampaign[log.campaign_id] = (queuedByCampaign[log.campaign_id] || 0) + 1;
        });
      }

      // Single query to get sent counts for campaigns with no queued emails
      const campaignsToComplete = campaigns.data.filter(c => !queuedByCampaign[c.id]);
      if (campaignsToComplete.length === 0) return;

      const completeIds = campaignsToComplete.map(c => c.id);
      
      // Get sent counts in batch
      const { data: sentStats } = await supabase.query('email_logs', 'select', {
        query: { 
          campaign_id: { $in: completeIds },
          status: { $in: ['sent', 'delivered', 'opened', 'clicked'] }
        },
        select: 'campaign_id, status',
        cache: false,
      });

      // Count sent emails per campaign
      const sentByCampaign = {};
      if (sentStats.data) {
        sentStats.data.forEach(log => {
          sentByCampaign[log.campaign_id] = (sentByCampaign[log.campaign_id] || 0) + 1;
        });
      }

      // Batch update all completed campaigns
      const updateOperations = campaignsToComplete.map(campaign => ({
        table: 'campaigns',
        operation: 'update',
        options: {
          id: campaign.id,
          data: {
            status: 'completed',
            sent_count: sentByCampaign[campaign.id] || 0,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }
      }));

      await supabase.batchOperations(updateOperations);
      
      app.log.info({ 
        completed: campaignsToComplete.length,
        campaignIds: campaignsToComplete.map(c => c.id) 
      }, 'Campaigns marked as completed');
    } catch (err) {
      app.log.error({ err }, 'Cron: Campaign completion check failed');
    }
  });

  // Provider stats cleanup: clear day-old rate limit counters (Redis TTL handles this automatically)
  // Log provider health every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const health = await getProviderHealth();
      app.log.info({ health }, 'Hourly provider health report');
    } catch (err) {
      app.log.error({ err }, 'Cron: Provider health check failed');
    }
  });

  // Scheduled campaign dispatch: check every minute
  cron.schedule('* * * * *', async () => {
    try {
      const { supabase } = require('./config/supabase');
      const { addCampaignJob } = require('./services/queueService');

      const now = new Date().toISOString();
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, template_id, subject, segment_query, reply_to')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now);

      for (const campaign of campaigns || []) {
        app.log.info({ campaignId: campaign.id }, 'Dispatching scheduled campaign');
        await supabase.from('campaigns').update({
          status: 'queued',
          updated_at: new Date().toISOString(),
        }).eq('id', campaign.id);

        await addCampaignJob({
          campaignId: campaign.id,
          templateId: campaign.template_id,
          subject: campaign.subject,
          segmentQuery: campaign.segment_query,
          replyTo: campaign.reply_to,
        });
      }
    } catch (err) {
      app.log.error({ err }, 'Cron: Scheduled campaign dispatch failed');
    }
  });

  app.log.info('Cron jobs scheduled');
}

/**
 * Main entry point.
 */
async function main() {
  let app;
  try {
    app = await buildApp();

    // Wait for Fastify to be ready
    await app.ready();

    // Sync block lists from DB on startup
    app.log.info('Syncing block lists from database...');
    await syncBlockListsFromDB().catch((err) => {
      app.log.warn({ err }, 'Failed to sync block lists on startup (continuing)');
    });

    // Setup cron jobs
    setupCronJobs(app);

    // Start listening
    await app.listen({ port: PORT, host: HOST });

    app.log.info(`CRM Backend started on http://${HOST}:${PORT}`);
    app.log.info(`API Docs: http://${HOST}:${PORT}/docs`);
    app.log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    app.log.info({ signal }, 'Shutting down...');
    try {
      await app.close();
      await closeQueues();
      await closeRedisConnections();
      app.log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Unhandled promise rejection');
  });

  return app;
}

// Only auto-start when run directly
if (require.main === module) {
  main();
}

module.exports = { buildApp, main };
