const crypto = require('crypto');

const secret = 'your-super-secret-jwt-key-min-32-chars-CHANGE-IN-PRODUCTION';

// Generate service_role JWT (expires in 10 years)
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  iss: 'supabase',
  role: 'service_role',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
};

const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');

const serviceRoleJWT = `${headerB64}.${payloadB64}.${signature}`;
console.log('SERVICE_ROLE_KEY=' + serviceRoleJWT);

// Generate anon JWT
const anonPayload = {
  iss: 'supabase',
  role: 'anon',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
};

const anonPayloadB64 = Buffer.from(JSON.stringify(anonPayload)).toString('base64url');
const anonSignature = crypto.createHmac('sha256', secret).update(`${headerB64}.${anonPayloadB64}`).digest('base64url');
const anonJWT = `${headerB64}.${anonPayloadB64}.${anonSignature}`;
console.log('ANON_KEY=' + anonJWT);
