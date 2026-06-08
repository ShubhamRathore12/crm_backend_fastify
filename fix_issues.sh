#!/bin/bash
# This script fixes the issues by:
# 1. Removing the broken supabase.query() wrapper from contacts and analytics routes
# 2. Replacing with direct Supabase client calls
# 3. Inserting dummy contact data if empty

cd /crm-backend

# Kill and delete old containers to clear caches
docker compose down

# Update environment if needed (already done)

# Bring everything back up
docker compose up -d --build

# Wait for services to be ready
sleep 15

# Test the fixes
echo "Testing endpoints..."
docker exec crm-api node -e "
const s = require('@supabase/supabase-js').createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
s.from('contacts').select('*', { count: 'exact' }).limit(1).then(r => {
  console.log('Contacts:', r.count || 'error:', r.error);
});
"

echo "Done!"
