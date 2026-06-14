#!/usr/bin/env node
/**
 * Generate bcrypt password hash for testing
 * Password: password123
 */
const crypto = require('crypto');

// Since bcrypt is complex, we'll use SHA256 with salt (as fallback in auth.js)
const password = 'password123';
const salt = process.env.API_KEY_SALT || 'c6786222794b7dad63adee9552d6c59c89c1831b7e9404a18a966c3fac92fd51';

const hash = crypto
  .createHash('sha256')
  .update(password + salt)
  .digest('hex');

console.log('Password:', password);
console.log('SHA256 Hash:', hash);
console.log('\nSQL Command:');
console.log(`UPDATE public.users SET password_hash = '${hash}' WHERE email = 'admin@crm.com';`);
console.log(`UPDATE public.users SET password_hash = '${hash}' WHERE email = 'shubham@crm.com';`);
