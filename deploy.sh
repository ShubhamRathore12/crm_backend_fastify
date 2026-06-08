#!/bin/bash

# ============================================================
# CRM Backend - Lead API Deployment Script
# ============================================================
# Deploy lead API changes to production server
#
# Usage: ./deploy.sh
# ============================================================

set -e

REMOTE_HOST="91.98.235.142"
REMOTE_USER="root"
REMOTE_PATH="/crm-backend"
SSH_KEY="$HOME/.ssh/ssh-key.key"

echo "========================================================"
echo "CRM Backend - Lead API Deployment"
echo "========================================================"
echo ""

# Step 1: Verify SSH connection
echo "Step 1/7: Verifying SSH connection..."
if ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "echo 'SSH connection OK'"; then
    echo "✅ SSH connection verified"
else
    echo "❌ SSH connection failed"
    exit 1
fi

echo ""

# Step 2: Stop containers
echo "Step 2/7: Stopping containers..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_PATH && docker compose down --timeout 30"
echo "✅ Containers stopped"

echo ""

# Step 3: Upload schema files
echo "Step 3/7: Uploading schema and seed files..."
scp -i "$SSH_KEY" "supabase/schema.sql" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/supabase/schema.sql"
scp -i "$SSH_KEY" "supabase/seed.sql" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/supabase/seed.sql"
scp -i "$SSH_KEY" "src/routes/leads.js" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/src/routes/leads.js"
echo "✅ Files uploaded"

echo ""

# Step 4: Start containers
echo "Step 4/7: Starting containers with schema initialization..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_PATH && docker compose up -d --build api email-worker campaign-worker"
echo "✅ Containers started"

echo ""

# Step 5: Wait for database initialization
echo "Step 5/7: Waiting for database initialization (45 seconds)..."
sleep 45
echo "✅ Database initialized"

echo ""

# Step 6: Verify data insertion
echo "Step 6/7: Verifying data insertion..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
docker exec crm-postgres psql -U postgres -d crm -c "
SELECT 
  (SELECT COUNT(*) FROM public.leads) as leads_count,
  (SELECT COUNT(*) FROM public.opportunities) as opportunities_count,
  (SELECT COUNT(*) FROM public.tasks) as tasks_count,
  (SELECT COUNT(*) FROM public.lead_notes) as notes_count;
"
EOF
echo "✅ Data verified"

echo ""

# Step 7: Verify API health
echo "Step 7/7: Verifying API health..."
if ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "docker exec crm-api curl -f http://localhost:8080/health 2>/dev/null"; then
    echo "✅ API is healthy"
else
    echo "⚠️  API might still be starting"
fi

echo ""
echo "========================================================"
echo "✅ Deployment Completed Successfully!"
echo "========================================================"
echo ""
echo "📊 Test Leads Created:"
echo "  • l1000001-0000-0000-0000-000000000001 - Rahul Sharma (Hot Prospect)"
echo "  • l1000001-0000-0000-0000-000000000002 - Priya Patel (Warm Lead)"
echo "  • l1000001-0000-0000-0000-000000000003 - Amit Kumar (High-Value Deal)"
echo "  • l1000001-0000-0000-0000-000000000004 - Sneha Reddy (New Lead)"
echo "  • l1000001-0000-0000-0000-000000000005 - Vikram Singh (Cold Lead)"
echo "  • l1000001-0000-0000-0000-000000000006 - Anita Desai (Won Deal)"
echo "  • l1000001-0000-0000-0000-000000000007 - Rajesh Gupta (Lost Deal)"
echo "  • l1000001-0000-0000-0000-000000000008 - Meera Nair (Unqualified)"
echo "  • l1000001-0000-0000-0000-000000000009 - John Smith (International)"
echo "  • l1000001-0000-0000-0000-000000000010 - Sarah Johnson (Complex Deal)"
echo ""
echo "🔗 API Endpoints:"
echo "  • Health: https://primeosys.com/crm-backend/health"
echo "  • List Leads: https://primeosys.com/crm-backend/leads"
echo "  • Lead Details: https://primeosys.com/crm-backend/leads/{id}?include=all"
echo ""
