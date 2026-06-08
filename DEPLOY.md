# CRM Backend - Deployment Guide

## Server Details

| Item | Value |
|------|-------|
| Server IP | `91.98.235.142` |
| SSH Key | `C:\Users\Shubham\.ssh\ssh-key.key` |
| SSH User | `root` |
| App Directory | `/crm-backend` |
| Public URL | `https://primeosys.com/crm-backend/` |
| Health Check | `https://primeosys.com/crm-backend/health` |

## Login Credentials (Demo)

| Email | Password | Role |
|-------|----------|------|
| admin@crm.com | Admin@123 | admin |
| shubham@crm.com | Admin@123 | manager |
| rahul@crm.com | Admin@123 | agent |
| priya@crm.com | Admin@123 | agent |
| amit@crm.com | Admin@123 | agent |

## Architecture (Docker Compose)

```
crm-postgres       → PostgreSQL 15 (port 5433)
crm-redis          → Redis 7.2 (port 6380)
crm-postgrest      → PostgREST v12 (port 3400)
crm-supabase-gateway → Nginx gateway (internal)
crm-api            → CRM API Node.js (port 4200)
crm-email-worker   → Email queue worker
crm-campaign-worker → Campaign queue worker
```

## How to Deploy Changes

### Step 1: SSH into the server

```bash
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
```

### Step 2: Navigate to the project

```bash
cd /crm-backend
```

### Step 3: Pull latest code (if using git)

```bash
git pull origin main
```

### Step 4: Rebuild and restart containers

```bash
# Rebuild only the app containers (keeps DB and Redis data intact)
docker compose up -d --build api email-worker campaign-worker
```

### Step 5: Verify deployment

```bash
# Check all containers are healthy
docker compose ps

# Check API health
curl http://localhost:4200/health

# Check logs if something is wrong
docker compose logs api --tail 50
docker compose logs email-worker --tail 50
```

## Common Operations

### Deploy code changes (quick)

```bash
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
cd /crm-backend
git pull origin main
docker compose up -d --build api email-worker campaign-worker
```

### Copy local files to server (without git)

```powershell
# From your local machine (PowerShell)
scp -i C:\Users\Shubham\.ssh\ssh-key.key -r d:\new_project\new_hmi\crm\backend\src root@91.98.235.142:/crm-backend/src
scp -i C:\Users\Shubham\.ssh\ssh-key.key d:\new_project\new_hmi\crm\backend\package.json root@91.98.235.142:/crm-backend/package.json

# Then on the server
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
cd /crm-backend && docker compose up -d --build api email-worker campaign-worker
```

### Restart without rebuilding (config/env changes)

```bash
cd /crm-backend
docker compose down
docker compose up -d
```

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f email-worker
docker compose logs -f campaign-worker
docker compose logs -f postgres
docker compose logs -f redis
```

### Database access

```bash
# Connect to PostgreSQL
docker exec -it crm-postgres psql -U postgres -d crm

# Run a SQL file
docker cp myfile.sql crm-postgres:/tmp/myfile.sql
docker exec crm-postgres psql -U postgres -d crm -f /tmp/myfile.sql
```

### Redis access

```bash
docker exec -it crm-redis redis-cli -a crm_redis_secret
```

### Full restart (nuclear option)

```bash
cd /crm-backend
docker compose down -v   # WARNING: -v removes volumes (deletes all DB data!)
docker compose up -d --build
```

> ⚠️ Only use `-v` if you want to wipe all data and start fresh.

### Restart without data loss

```bash
cd /crm-backend
docker compose down
docker compose up -d --build
```

## Environment Variables

The `.env` file at `/crm-backend/.env` controls all configuration. Key variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | API port inside container |
| `JWT_SECRET` | Secret for signing auth tokens |
| `SUPABASE_URL` | Internal PostgREST URL (http://supabase-gateway) |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT for PostgREST service role access |
| `SUPABASE_ANON_KEY` | JWT for PostgREST anonymous access |
| `REDIS_PASSWORD` | Redis authentication password |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |

## Nginx Configuration

The reverse proxy config is at:
- `/etc/nginx/sites-enabled/primeosys.com` (main site)
- `/etc/nginx/snippets/crm-backend.conf` (CRM backend proxy rules)

After any nginx changes:
```bash
nginx -t && systemctl reload nginx
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 502 Bad Gateway | Check `docker compose ps` — API might be restarting |
| 401 on login | Check PostgREST JWT keys match in `.env` and docker-compose |
| DB connection error | `docker compose logs postgres` — check if healthy |
| Redis connection error | `docker compose logs redis` — check if healthy |
| Container keeps restarting | `docker compose logs <service> --tail 100` |

## Ports Reference

| Service | Internal Port | External Port |
|---------|--------------|---------------|
| PostgreSQL | 5432 | 5433 |
| Redis | 6379 | 6380 |
| PostgREST | 3000 | 3400 |
| CRM API | 8080 | 4200 |
| Nginx (public) | - | 443 (HTTPS) |
