#!/usr/bin/env node
/**
 * Generate bcrypt password hash
 */
const bcrypt = require('bcrypt');

async function generateHash() {
  const password = 'password123';
  const rounds = 12;
  
  try {
    const hash = await bcrypt.hash(password, rounds);
    console.log('Password:', password);
    console.log('Bcrypt Hash:', hash);
    console.log('\nSQL Command:');
    console.log(`UPDATE public.users SET password_hash = '${hash}' WHERE status = 'active';`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

generateHash();
