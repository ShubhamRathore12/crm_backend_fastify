# Manual Deployment Guide - Lead API

Follow these steps to deploy the Lead Details API to production.

---

## Prerequisites

- SSH key: `C:\Users\Shubham\.ssh\ssh-key.key`
- Server: `91.98.235.142`
- User: `root`
- App path: `/crm-backend`

---

## Step-by-Step Deployment

### Step 1: Open PowerShell and Connect to Server

```powershell
# Open PowerShell as Administrator
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
```

You should now be connected to the server.

---

### Step 2: Navigate to Project Directory

```bash
cd /crm-backend
pwd
```

Should output: `/crm-backend`

---

### Step 3: Pull Latest Code (Optional - if using git)

```bash
# If using git
git pull origin main

# Or list current files
ls -la supabase/
```

---

### Step 4: Stop All Containers

```bash
docker compose down --timeout 30
```

Wait for all containers to stop. You should see output like:
```
Stopping crm-api ... done
Stopping crm-email-worker ... done
Stopping crm-campaign-worker ... done
...
```

---

### Step 5: Verify Schema Files Are in Place

```bash
# Check schema files
ls -la supabase/schema.sql supabase/seed.sql

# Check if they have content
wc -l supabase/schema.sql supabase/seed.sql
```

Should show:
- `schema.sql` - ~900+ lines
- `seed.sql` - ~500+ lines

---

### Step 6: Start Containers (With Fresh Database)

```bash
# Start all containers
docker compose up -d --build

# Monitor build progress
docker compose logs --follow
```

Wait for all containers to be healthy. You'll see messages like:
```
crm-api is now healthy
crm-email-worker is now running
crm-campaign-worker is now running
```

Press `Ctrl+C` to exit logs once all containers are healthy.

---

### Step 7: Wait for Database Initialization

```bash
# Wait 30-45 seconds for PostgreSQL to run init scripts
sleep 45

# Check if tables were created
docker exec crm-postgres psql -U postgres -d crm -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
```

Should output a count around 20+ tables.

---

### Step 8: Verify Data Was Inserted

```bash
# Check if leads were inserted
docker exec crm-postgres psql -U postgres -d crm -c "SELECT COUNT(*) FROM public.leads;"
```

Should output: `10`

---

### Step 9: Verify All Data Tables

Run this command to see all data counts:

```bash
docker exec crm-postgres psql -U postgres -d crm << 'EOF'
SELECT 
  'users' as table_name, COUNT(*) as count FROM public.users
UNION ALL SELECT 'leads', COUNT(*) FROM public.leads
UNION ALL SELECT 'lead_scores', COUNT(*) FROM public.lead_scores
UNION ALL SELECT 'lead_history', COUNT(*) FROM public.lead_history
UNION ALL SELECT 'lead_notes', COUNT(*) FROM public.lead_notes
UNION ALL SELECT 'opportunities', COUNT(*) FROM public.opportunities
UNION ALL SELECT 'tasks', COUNT(*) FROM public.tasks
UNION ALL SELECT 'email_sends', COUNT(*) FROM public.email_sends
UNION ALL SELECT 'interactions', COUNT(*) FROM public.interactions
ORDER BY table_name;
EOF
```

**Expected Output:**
```
 table_name       | count
------------------+-------
 email_sends      |    10
 interactions     |    10
 lead_history     |    12
 lead_notes       |     7
 lead_scores      |     6
 leads            |    10
 opportunities    |     8
 tasks            |    10
 users            |     5
(9 rows)
```

---

### Step 10: View Sample Lead Data

```bash
# Get first lead
docker exec crm-postgres psql -U postgres -d crm -c "
SELECT id, name, email, company, status, stage, lead_score, assigned_to
FROM public.leads 
LIMIT 5;"
```

Should show:
```
                   id                   |     name      |                email                |    company    |  status   | stage | lead_score |         assigned_to
----------------------------------------+---------------+-------------------------------------+---------------+-----------+-------+------------+----------
 l1000001-0000-0000-0000-000000000001   | Rahul Sharma  | rahul.sharma@techcorp.in            | TechCorp India| qualified |proposa|       92.5 | u1000001-...
```

---

### Step 11: Check API Health

```bash
# Check if API is responding
docker exec crm-api curl -f http://localhost:8080/health

# Should output something like:
# {"status":"ok","timestamp":"2024-12-20T15:45:30.123Z"}
```

---

### Step 12: Check Container Status

```bash
# Verify all containers are healthy
docker compose ps

# Should show all containers with "healthy" or "running" status:
# NAME                STATUS
# crm-postgres        Up 2 minutes (healthy)
# crm-redis          Up 2 minutes (healthy)
# crm-postgrest      Up 2 minutes (healthy)
# crm-supabase-gateway Up 2 minutes (healthy)
# crm-api            Up 2 minutes (healthy)
# crm-email-worker   Up 2 minutes
# crm-campaign-worker Up 2 minutes
```

---

### Step 13: Exit SSH and Test Public URL

```bash
# Exit remote server
exit
```

Now from your local machine, test the public API:

```powershell
# Test health endpoint (no auth needed)
curl https://primeosys.com/crm-backend/health

# Get your JWT token first, then test leads endpoint
curl -X GET "https://primeosys.com/crm-backend/leads" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific lead details
curl -X GET "https://primeosys.com/crm-backend/leads/l1000001-0000-0000-0000-000000000001?include=all" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Quick Verification Checklist

- [ ] SSH connection successful
- [ ] Containers stopped cleanly
- [ ] Containers started and healthy
- [ ] Database initialized (tables created)
- [ ] Data inserted (10 leads visible)
- [ ] All data tables have correct counts
- [ ] API health check passes
- [ ] Public URL accessible

---

## Test Leads Available

After deployment, you can test with these lead IDs:

| ID | Name | Status | Stage | Score |
|----|------|--------|-------|-------|
| `l1000001-0000-0000-0000-000000000001` | Rahul Sharma | Qualified | Proposal | 92.5 |
| `l1000001-0000-0000-0000-000000000002` | Priya Patel | Contacted | Discovery | 76.3 |
| `l1000001-0000-0000-0000-000000000003` | Amit Kumar | Qualified | Negotiation | 88.7 |
| `l1000001-0000-0000-0000-000000000004` | Sneha Reddy | New | New | 45.2 |
| `l1000001-0000-0000-0000-000000000005` | Vikram Singh | Cold | New | 32.1 |
| `l1000001-0000-0000-0000-000000000006` | Anita Desai | Converted | Closed | 95.8 |
| `l1000001-0000-0000-0000-000000000007` | Rajesh Gupta | Lost | Closed | 58.4 |
| `l1000001-0000-0000-0000-000000000008` | Meera Nair | Unqualified | Discovery | 38.9 |
| `l1000001-0000-0000-0000-000000000009` | John Smith | Qualified | Proposal | 81.5 |
| `l1000001-0000-0000-0000-000000000010` | Sarah Johnson | Qualified | Negotiation | 89.3 |

---

## Troubleshooting

### Issue: Containers won't start
```bash
# Check logs
docker compose logs

# Check specific service
docker compose logs api
docker compose logs postgres
```

### Issue: Database not initializing
```bash
# Check if init scripts ran
docker exec crm-postgres ls -la /docker-entrypoint-initdb.d/

# Check PostgreSQL logs
docker compose logs postgres | tail -50
```

### Issue: No data in database
```bash
# Manually run seed script
docker exec crm-postgres psql -U postgres -d crm -f /docker-entrypoint-initdb.d/02-seed.sql
```

### Issue: API returning 401
```bash
# Check JWT environment variables
docker exec crm-api env | grep JWT

# Verify they match
cat .env | grep JWT_SECRET
```

---

## Rollback (If Something Goes Wrong)

```bash
# Stop containers
docker compose down

# Restore previous version using git
git checkout HEAD~1 supabase/schema.sql supabase/seed.sql

# Restart
docker compose up -d --build

# Wait for initialization
sleep 45

# Verify
docker compose ps
```

---

## Next Steps After Deployment

1. ✅ **Deployment Complete** - All changes deployed to production
2. 📝 **Update Frontend** - Call the lead details API from your UI
3. 🔐 **Add Authentication** - Include JWT tokens in API calls
4. 📊 **Test in Production** - Click on leads to see full details
5. 📈 **Monitor Logs** - Watch for errors: `docker compose logs -f api`
6. 📚 **Reference Documentation** - See LEAD_API_DOCUMENTATION.md

---

## Support

If you encounter issues:

1. Check logs: `docker compose logs`
2. Verify connectivity: `docker exec crm-api curl http://supabase-gateway/health`
3. Check database: `docker exec -it crm-postgres psql -U postgres -d crm`
4. View full error details: `docker compose logs api --tail 100`

---
