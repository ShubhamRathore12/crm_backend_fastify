#!/usr/bin/env node
/**
 * Test login endpoint
 */
const https = require('https');

const data = JSON.stringify({
  email: 'admin.user@company.com',
  password: 'password123'
});

const options = {
  hostname: 'primeosys.com',
  port: 443,
  path: '/crm-backend/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  },
  rejectUnauthorized: false // Allow self-signed certs
};

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body:', body);
    
    try {
      const parsed = JSON.parse(body);
      console.log('\nParsed Response:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      // Already logged above
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
  process.exit(1);
});

req.write(data);
req.end();
