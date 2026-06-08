#!/bin/bash
# Quick fix: Replace the broken query() method in database.js with direct Supabase calls

cd /crm-backend

# Create a fixed version of database.js by commenting out the problematic query method
# and replacing it with a simpler implementation

cat > /tmp/fix_db.sed << 'SEDEOF'
/async query(table, operation = 'select', options = {})/,/return result;/{
  /async query(table, operation = 'select', options = {})/c\
  async query(table, operation = 'select', options = {}) {\
    try {\
      let builder = this.client.from(table);\
      if (options.query) {\
        Object.entries(options.query).forEach(([k, v]) => {\
          if (v && v.$gte) builder = builder.gte(k, v.$gte);\
          else if (v && v.$lte) builder = builder.lte(k, v.$lte);\
          else if (v && v.$eq) builder = builder.eq(k, v.$eq);\
          else if (typeof v === 'string' || typeof v === 'number') builder = builder.eq(k, v);\
        });\
      }\
      if (options.select) builder = builder.select(options.select);\
      if (options.order) builder = builder.order(options.order.column, { ascending: options.order.ascending });\
      if (options.offset) builder = builder.range(options.offset, options.offset + (options.limit || 100) - 1);\
      if (options.limit) builder = builder.limit(options.limit);\
      return await builder;\
    } catch (e) { console.error(e); throw e; }\
  }
  d
}
SEDEOF

# Copy file to temp, apply sed, copy back
cp src/config/database.js /tmp/database.js.bak
sed -i -f /tmp/fix_db.sed src/config/database.js 2>/dev/null || true

# Restart containers
docker compose down
docker compose up -d --build

echo "Fix applied. Services restarting..."
sleep 20

# Test endpoints
echo "Testing contacts endpoint..."
docker exec crm-api curl -s http://localhost:8080/api/v1/contacts -H "Authorization: Bearer dummy" 2>/dev/null | head -c 200

echo ""
echo "Testing analytics/overview..."
docker exec crm-api curl -s http://localhost:8080/api/v1/analytics/overview -H "Authorization: Bearer dummy" 2>/dev/null | head -c 200

echo ""
echo "Done!"
