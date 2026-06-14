#!/bin/sh

# Create login JSON payload
cat > /tmp/login.json << 'EOF'
{"email":"admin@crm.com","password":"Admin@123"}
EOF

# Test login endpoint
echo "Testing login endpoint..."
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d @/tmp/login.json \
  -s | jq . || cat /tmp/login.json | curl -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d @- -s

echo ""
echo "Test complete!"
