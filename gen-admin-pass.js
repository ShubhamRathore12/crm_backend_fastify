#!/usr/bin/env node
const crypto = require('crypto');

// Generate SHA256 hash for admin password
const password = 'Admin@123';
const salt = 'c6786222794b7dad63adee9552d6c59c89c1831b7e9404a18a966c3fac92fd51';

const hash = crypto
  .createHash('sha256')
  .update(password + salt)
  .digest('hex');

console.log('=== ADMIN PASSWORD CONFIGURATION ===');
console.log('Email: admin@crm.com');
console.log('Password: Admin@123');
console.log('Hash Type: SHA256');
console.log('Hash: ' + hash);
console.log('\nSQL Command:');
console.log(`UPDATE public.users SET password_hash = '${hash}' WHERE email = 'admin@crm.com';`);
