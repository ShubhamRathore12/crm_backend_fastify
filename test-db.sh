#!/bin/sh

# Test database connection
echo "Testing database connection from container..."
echo "DB_HOST: ${DB_HOST}"
echo "DB_PORT: ${DB_PORT}"
echo "DB_NAME: ${DB_NAME}"
echo "DB_USER: ${DB_USER}"

# Test with nc if available
if command -v nc >/dev/null 2>&1; then
  echo "Testing port connectivity..."
  nc -zv crm-postgres 5432
fi

# Test Node.js can connect
echo ""
echo "Testing with Node.js..."
node -e "
const { PostgresClient } = require('./src/config/postgres');
const client = new PostgresClient();
client.healthCheck().then(result => {
  console.log('Health check result:', JSON.stringify(result, null, 2));
  process.exit(result.healthy ? 0 : 1);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
"
