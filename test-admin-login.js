#!/usr/bin/env node
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
  rejectUnauthorized: false
};

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\n=== LOGIN TEST ===');
    console.log('Status:', res.statusCode);
    
    try {
      const parsed = JSON.parse(body);
      console.log('\nResponse:');
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.token) {
        console.log('\n✅ LOGIN SUCCESSFUL!');
        console.log('Token:', parsed.token.substring(0, 50) + '...');
      } else if (parsed.error) {
        console.log('\n❌ LOGIN FAILED');
        console.log('Error:', parsed.message);
      }
    } catch (e) {
      console.log('Raw body:', body);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
  process.exit(1);
});

console.log('Testing login with:');
console.log('Email: admin.user@company.com');
console.log('Password: password123');

req.write(data);
req.end();
