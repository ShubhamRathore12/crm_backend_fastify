'use strict';

const crypto = require('crypto');
const { supabase } = require('../config/supabase');

/**
 * Verify a JWT token issued by Supabase Auth.
 * Returns the decoded payload or throws.
 * @param {string} token
 * @returns {Promise<Object>} decoded payload
 */
/**
 * Verify a custom JWT token (HS256 signed).
 * @param {string} token
 * @returns {Object} decoded payload
 */
function verifyCustomJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid token format');

  const [headerB64, payloadB64, signature] = parts;
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expected) throw new Error('invalid signature');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token expired');
  }

  return payload;
}

async function verifySupabaseJWT(token) {
  try {
    // First try custom JWT verification
    try {
      const payload = verifyCustomJWT(token);
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        team_id: payload.team_id,
      };
    } catch {
      // Fall through to Supabase verification
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error(error?.message || 'Invalid token');
    }
    return data.user;
  } catch (err) {
    throw new Error(`JWT verification failed: ${err.message}`);
  }
}

/**
 * Hash an API key for storage comparison.
 * @param {string} key
 * @returns {string}
 */
function hashApiKey(key) {
  const salt = process.env.API_KEY_SALT || 'default-salt';
  return crypto.createHmac('sha256', salt).update(key).digest('hex');
}

/**
 * Verify an API key against the database.
 * @param {string} key
 * @returns {Promise<Object|null>} user/account data or null
 */
async function verifyApiKey(key) {
  if (!key || !key.startsWith('crm_')) {
    return null;
  }
  const hashed = hashApiKey(key);
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, account_id, name, scopes, last_used_at')
    .eq('key_hash', hashed)
    .eq('active', true)
    .single();

  if (error || !data) return null;

  // Update last used timestamp (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {});

  return data;
}

/**
 * Fastify preHandler hook for authentication.
 * Checks in order: Cookie → Bearer header → API key header.
 */
async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKeyQuery = request.query?.api_key;
    const cookieToken = request.cookies?.crm_token;

    // Skip auth in development if env flag set
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
      request.user = { id: 'dev-user', role: 'admin', scopes: ['*'] };
      return;
    }

    // 1. Try JWT from cookie
    if (cookieToken) {
      const user = await verifySupabaseJWT(cookieToken);
      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        team_id: user.team_id,
        scopes: ['*'],
        authType: 'cookie',
      };
      return;
    }

    // 2. Try Bearer JWT from header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await verifySupabaseJWT(token);
      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        team_id: user.team_id,
        scopes: ['*'],
        authType: 'jwt',
      };
      return;
    }

    // 3. Try API key
    const apiKey = apiKeyHeader || apiKeyQuery;
    if (apiKey) {
      const keyData = await verifyApiKey(apiKey);
      if (!keyData) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key',
        });
      }
      request.user = {
        id: keyData.account_id,
        keyId: keyData.id,
        keyName: keyData.name,
        scopes: keyData.scopes || ['*'],
        authType: 'api_key',
      };
      return;
    }

    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required. Login at POST /api/v1/auth/login to get a cookie, or provide Bearer token / x-api-key header.',
    });
  } catch (err) {
    request.log.error({ err }, 'Authentication error');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: err.message,
    });
  }
}

/**
 * Require specific scope middleware factory.
 * @param {string|string[]} requiredScopes
 * @returns {Function} Fastify preHandler
 */
function requireScope(...requiredScopes) {
  return async function (request, reply) {
    const userScopes = request.user?.scopes || [];
    if (userScopes.includes('*')) return; // admin wildcard

    const hasScope = requiredScopes.every((scope) => userScopes.includes(scope));
    if (!hasScope) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Required scopes: ${requiredScopes.join(', ')}`,
      });
    }
  };
}

/**
 * Optional auth — attaches user if token present but doesn't block if absent.
 */
async function optionalAuth(request, reply) {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers['x-api-key'];

  if (!authHeader && !apiKeyHeader) return;

  try {
    await authenticate(request, reply);
  } catch {
    // Silently continue without user
  }
}

/**
 * Generate a new API key.
 * @returns {{ key: string, hash: string }}
 */
function generateApiKey() {
  const random = crypto.randomBytes(32).toString('hex');
  const key = `crm_${random}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Webhook signature verification for provider webhooks.
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean}
 */
function verifyWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(`sha256=${expected}`, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

module.exports = {
  authenticate,
  optionalAuth,
  requireScope,
  verifyWebhookSignature,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
};
