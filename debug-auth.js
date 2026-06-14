#!/usr/bin/env node
/**
 * Debug auth hash generation
 */
const crypto = require('crypto');
require('dotenv').config();

const password = 'password123';
const salt = process.env.API_KEY_SALT || 'c6786222794b7dad63adee9552d6c59c89c1831b7e9404a18a966c3fac92fd51';

console.log('Password:', password);
console.log('Salt:', salt);

const hash = crypto
  .createHash('sha256')
  .update(password + salt)
  .digest('hex');

console.log('Computed Hash:', hash);
console.log('Expected Hash: 353c2d5ccaaec48d4436f635e67b785f830c6e11c920903df705fb90880724f8');
console.log('Match:', hash === '353c2d5ccaaec48d4436f635e67b785f830c6e11c920903df705fb90880724f8');
