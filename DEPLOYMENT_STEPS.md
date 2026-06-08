# Lead API Deployment Steps

## Overview
This document outlines the exact steps to deploy the Lead Details API changes to production.

**Server IP:** 91.98.235.142  
**App Path:** `/crm-backend`  
**SSH Key:** `C:\Users\Shubham\.ssh\ssh-key.key`

---

## Step 1: Verify Local Changes

All changes are in these files:
- `supabase/schema.sql` - ✅ Database schema with lead tables
- `supabase/seed.sql` - ✅ Dummy data (10 test leads with full details)
- `src/routes/leads.js` - ✅ Complete lead API endpoints
- `LEAD_API_DOCUMENTATION.md` - ✅ Full API documentation
- `TESTING_LEAD_API.md` - ✅ Testing guide

---

## Step 2: Connect to Server

```bash
# Open PowerShell and SSH into the server
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
```

---

## Step 3: Navigate to Project Directory

```bash
cd /crm-backend
```

---

## Step 4: Pull Latest Code (if using git)

```bash
# Option A: If using git
git pull origin main

# Option B: If not using git, copy files from local machine
# Skip to Step 5
```

---

## Step 5: Stop Containers

```bash
docker compose down
```

---

## Step 6: Apply Schema and Seed Data

The docker-compose.yml is configured to automatically run:
- `supabase/schema.sql` (1st - creates tables)
- `supabase/seed.sql` (2nd - inserts dummy data)

These run as init scripts when PostgreSQL starts. Since we've updated both files, simply restarting will apply them.

---

## Step 7: Start Containers with Fresh Database

```bash
# Start all containers (PostgreSQL will run init scripts automatically)
docker compose up -d --build

# Wait 30 seconds for PostgreSQL to initialize and seed data
sleep 30
```

---

## Step 8: Verify Database Schema and Data

```bash
# Connect to PostgreSQL container
docker exec -it crm-postgres psql -U postgres -d crm

# Run these queries to verify:
SELECT COUNT(*) FROM public.users;        -- Should show 5 users
SELECT COUNT(*) FROM public.leads;        -- Should show 10 leads
SELECT COUNT(*) FROM public.lead_scores;  -- Should show 6 records
SELECT COUNT(*) FROM public.lead_history; -- Should show 12 records
SELECT COUNT(*) FROM public.lead_notes;   -- Should show 7 records
SELECT COUNT(*) FROM public.opportunities; -- Should show 8 records
SELECT COUNT(*) FROM public.tasks;        -- Should show 10 records
SELECT COUNT(*) FROM public.email_sends;  -- Should show 10 records
SELECT COUNT(*) FROM public.interactions; -- Should show 10 records

# Exit PostgreSQL
\q
```

**Expected Results:**
```
 count
-------
     5   -- users
    10   -- leads
     6   -- lead_scores
    12   -- lead_history
     7   -- lead_notes
     8   -- opportunities
    10   -- tasks
    10   -- email_sends
    10   -- interactions
```

---

## Step 9: Verify API Health

```bash
# Check if all containers are healthy
docker compose ps

# All should show "healthy" or "running (healthy)"
```

---

## Step 10: Test API Endpoints

```bash
# Test health check
curl http://localhost:4200/health

# You should see:
# {"status":"ok","timestamp":"2024-12-20T15:45:30.123Z"}
```

---

## Step 11: Test Lead Details API

```bash
# Get list of leads
curl -X GET "http://localhost:4200/leads" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific lead (test lead #1 - Rahul Sharma)
curl -X GET "http://localhost:4200/leads/l1000001-0000-0000-0000-000000000001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get lead with all details
curl -X GET "http://localhost:4200/leads/l1000001-0000-0000-0000-000000000001?include=all" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Step 12: Check Logs for Errors

```bash
# Check API logs
docker compose logs api --tail 50

# Check if any errors
docker compose logs api | grep -i error

# Exit log view
# Press Ctrl+C
```

---

## Step 13: Verify Public URL

Once deployed, test via public URL:

```bash
# Health check
curl https://primeosys.com/crm-backend/health

# List leads (requires authentication)
curl -X GET "https://primeosys.com/crm-backend/leads" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Quick Reference: All Test Leads

You can now test with these lead IDs:

1. **Rahul Sharma** (Hot Prospect)
   - ID: `l1000001-0000-0000-0000-000000000001`
   - Status: Qualified, Stage: Proposal
   - Has: 2 opportunities, 4 tasks, 4 emails, 4 interactions

2. **Priya Patel** (Warm Lead)
   - ID: `l1000001-0000-0000-0000-000000000002`
   - Status: Contacted, Stage: Discovery
   - Has: 1 opportunity, 2 tasks, 2 emails, 2 interactions

3. **Amit Kumar** (High-Value Deal)
   - ID: `l1000001-0000-0000-0000-000000000003`
   - Status: Qualified, Stage: Negotiation
   - Large deal: $500k+ opportunity

4. **Sneha Reddy** (New Lead)
   - ID: `l1000001-0000-0000-0000-000000000004`
   - Status: New, Stage: New
   - Low score: 45.2

5. **Vikram Singh** (Cold Lead)
   - ID: `l1000001-0000-0000-0000-000000000005`
   - Status: Cold
   - No activities

6. **Anita Desai** (Won Deal)
   - ID: `l1000001-0000-0000-0000-000000000006`
   - Status: Converted, Stage: Closed
   - Highest score: 95.8

7. **Rajesh Gupta** (Lost Deal)
   - ID: `l1000001-0000-0000-0000-000000000007`
   - Status: Lost, Stage: Closed

8. **Meera Nair** (Unqualified)
   - ID: `l1000001-0000-0000-0000-000000000008`
   - Status: Unqualified

9. **John Smith** (International)
   - ID: `l1000001-0000-0000-0000-000000000009`
   - Status: Qualified, Stage: Proposal
   - Pilot deal: $25k

10. **Sarah Johnson** (Complex Deal)
    - ID: `l1000001-0000-0000-0000-000000000010`
    - Status: Qualified, Stage: Negotiation
    - Large deal: $320k

---

## Troubleshooting

### Issue: Containers won't start
```bash
# Check Docker daemon
docker ps

# Check logs
docker compose logs

# Rebuild everything
docker compose down
docker system prune -a
docker compose up -d --build
```

### Issue: Database initialization didn't run
```bash
# Check if seed.sql exists in container
docker exec crm-postgres ls -la /docker-entrypoint-initdb.d/

# Check PostgreSQL logs
docker compose logs postgres

# Manual run (dangerous - may have duplicates)
docker exec crm-postgres psql -U postgres -d crm -f /docker-entrypoint-initdb.d/02-seed.sql
```

### Issue: API returning 401 Unauthorized
```bash
# Verify JWT keys match
docker exec crm-api env | grep JWT_SECRET
docker exec crm-postgrest env | grep JWT_SECRET

# They should match the value in .env
cat .env | grep JWT_SECRET
```

### Issue: "Port already in use"
```bash
# Find what's using the port
lsof -i :4200

# Kill the process or change port in docker-compose.yml
```

---

## Rollback (if something goes wrong)

```bash
# Stop containers
docker compose down

# Restore from backup (if available)
git checkout HEAD~1 supabase/schema.sql supabase/seed.sql

# Restart
docker compose up -d --build
```

---

## Next Steps

1. ✅ Deploy these changes to production
2. ✅ Verify database schema and seed data
3. ✅ Test lead details API endpoints
4. ✅ Verify public URL works
5. 📝 Update frontend to call the lead details API
6. 📝 Add authentication tokens to API calls
7. 📝 Test full user flow in production
8. 📝 Monitor logs for errors

---

## Files Modified

```
✅ supabase/schema.sql
   - Added users table
   - Added leads table
   - Added lead_scores table
   - Added lead_history table
   - Added lead_notes table
   - Added opportunities table
   - Added tasks table
   - Added email_sends table
   - Added interactions table
   - Added bulk_uploads table

✅ supabase/seed.sql
   - Added 5 users (team members)
   - Added 10 test leads (with full details)
   - Added lead scores, history, notes
   - Added 8 opportunities ($150k-$500k deals)
   - Added 10 tasks (mix of open/completed)
   - Added 10 email sends (with various statuses)
   - Added 10 interactions (meetings, calls, emails)

✅ src/routes/leads.js
   - Complete lead CRUD operations
   - Lead details with optional includes
   - Lead assignment and status tracking
   - Notes management
   - History and timeline tracking
   - Lead scoring and recommendations

✅ LEAD_API_DOCUMENTATION.md
   - Full API reference
   - Schema documentation
   - Endpoint examples
   - Response formats
   - Error handling

✅ TESTING_LEAD_API.md
   - Test lead descriptions
   - API testing examples
   - React hook example
   - Testing checklist
   - Performance notes
```

---

## Support

If you encounter issues:

1. Check Docker logs: `docker compose logs`
2. Check PostgreSQL: `docker compose logs postgres`
3. Check API: `docker compose logs api`
4. Verify env vars: `cat .env`
5. Test connectivity: `docker exec crm-api curl http://supabase-gateway/health`

