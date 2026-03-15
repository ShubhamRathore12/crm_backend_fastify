'use strict';

const crypto = require('crypto');
let bcrypt;
try { bcrypt = require('bcrypt'); } catch { bcrypt = null; }
const { supabase } = require('../config/supabase');
const { generateApiKey, authenticate } = require('../middleware/auth');

const COOKIE_NAME = 'crm_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a signed JWT token.
 */
function generateToken(payload) {
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  };

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Set JWT as httpOnly cookie on the response.
 */
function setTokenCookie(reply, token) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

async function authRoutes(fastify, opts) {

  // ─── POST /login ─── Login & set cookie ───────────────────────────
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email/password - sets JWT cookie',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, password_hash, role, team_id, status')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Account is inactive' });
    }

    // Verify password (supports bcrypt or sha256 hashes)
    if (user.password_hash) {
      let passwordValid = false;

      if (user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
        // Bcrypt hash
        if (bcrypt) {
          passwordValid = await bcrypt.compare(password, user.password_hash);
        }
      } else {
        // SHA256 hash fallback
        const sha256Hash = crypto
          .createHash('sha256')
          .update(password + (process.env.API_KEY_SALT || 'salt'))
          .digest('hex');
        passwordValid = (sha256Hash === user.password_hash);
      }

      if (!passwordValid) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
      }
    }

    // Generate JWT
    const token = generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team_id: user.team_id,
    });

    // Set httpOnly cookie
    setTokenCookie(reply, token);

    return reply.send({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
      },
    });
  });

  // ─── POST /register ─── Register & set cookie ────────────────────
  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user - sets JWT cookie',
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', default: 'agent' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, password, role = 'agent' } = request.body;
    const normalizedEmail = email.toLowerCase().trim();

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email already registered' });
    }

    const passwordHash = bcrypt
      ? await bcrypt.hash(password, 12)
      : crypto.createHash('sha256').update(password + (process.env.API_KEY_SALT || 'salt')).digest('hex');

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select('id, name, email, role, team_id, status, created_at')
      .single();

    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    const token = generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team_id: user.team_id,
    });

    setTokenCookie(reply, token);

    return reply.code(201).send({ message: 'Registration successful', token, user });
  });

  // ─── POST /logout ─── Clear cookie ───────────────────────────────
  fastify.post('/logout', {
    schema: { tags: ['Auth'], summary: 'Logout - clears JWT cookie' },
  }, async (request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // ─── GET /me ─── Current user info ────────────────────────────────
  fastify.get('/me', {
    preHandler: authenticate,
    schema: { tags: ['Auth'], summary: 'Get current authenticated user' },
  }, async (request, reply) => {
    return reply.send({ user: request.user });
  });

  // ─── POST /api-key ─── Generate API key ──────────────────────────
  fastify.post('/api-key', {
    preHandler: authenticate,
    schema: {
      tags: ['Auth'],
      summary: 'Generate a new API key',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          scopes: { type: 'array', items: { type: 'string' }, default: ['*'] },
        },
      },
    },
  }, async (request, reply) => {
    const { name, scopes = ['*'] } = request.body;
    const { key, hash } = generateApiKey();

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        account_id: request.user.id,
        name,
        key_hash: hash,
        scopes,
        active: true,
        created_at: new Date().toISOString(),
      })
      .select('id, name, scopes, created_at')
      .single();

    if (error) {
      return reply.code(500).send({ error: 'Database error', message: error.message });
    }

    return reply.code(201).send({
      message: 'API key created. Save this key - it cannot be shown again.',
      api_key: key,
      details: data,
    });
  });

  // ─── GET /dev-token ─── Dev only ─────────────────────────────────
  fastify.get('/dev-token', {
    schema: { tags: ['Auth'], summary: 'Generate dev token + set cookie (dev only)' },
  }, async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send({ error: 'Not Found' });
    }

    const token = generateToken({
      sub: 'dev-user-001',
      email: 'dev@crm.local',
      name: 'Dev User',
      role: 'admin',
    });

    setTokenCookie(reply, token);

    return reply.send({
      message: 'Dev token generated and cookie set',
      token,
      cookie: COOKIE_NAME,
      expiresIn: '7d',
    });
  });
}

module.exports = authRoutes;
