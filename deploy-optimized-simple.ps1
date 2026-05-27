# Simple optimized deployment script
$ErrorActionPreference = "Stop"

# Configuration
$SSH_KEY = "C:\Users\Shubham\.ssh\ssh-key.key"
$SERVER = "root@91.98.235.142"
$REMOTE_DIR = "/opt/crm-backend-optimized"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CRM Backend - Optimized Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create optimized environment file
Write-Host "[1/6] Creating optimized environment configuration..." -ForegroundColor Yellow
$envContent = @"
# =============================================================================
# CRM Backend - Optimized Production Environment
# =============================================================================

# Application
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
LOG_LEVEL=info
LOG_PRETTY=false

# Performance Optimizations
COMPRESSION_ENABLED=true
COMPRESSION_MIN_SIZE=1024
CACHE_ENABLED=true
CACHE_TTL=300000
CACHE_MAX_ITEMS=5000
REDIS_CACHE_ENABLED=true
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_IDLE_TIMEOUT=30000
CSV_BATCH_SIZE=1000
MAX_WORKERS=4

# Security
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
API_KEY_SALT=c6786222794b7dad63adee9552d6c59c89c1831b7e9404a18a966c3fac92fd51
WEBHOOK_SECRET=8451dfc067e4ccd2bfd06bb7be2b555223917aa7b7a0013525a95472b26b330a

# Supabase (Self-hosted via Docker - points to nginx gateway)
SUPABASE_URL=http://supabase-gateway
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# PostgreSQL (local Docker)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=crm_postgres_secret_2024
POSTGRES_DB=crm

# Redis (local Docker - optimized for performance)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=crm_redis_secret
REDIS_DB=0
REDIS_TLS=false
REDIS_DISABLED=false

# Email Providers (fill in when ready)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=CRM
AWS_SES_DAILY_LIMIT=50000
AWS_SES_RATE_PER_SECOND=14

SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=CRM
SENDGRID_DAILY_LIMIT=100000
SENDGRID_RATE_PER_SECOND=100

MAILGUN_API_KEY=
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
MAILGUN_FROM_NAME=CRM
MAILGUN_DAILY_LIMIT=50000
MAILGUN_RATE_PER_SECOND=50

# Queue (optimized for high throughput)
EMAIL_QUEUE_CONCURRENCY=100
CAMPAIGN_BATCH_SIZE=1000
MAX_RETRIES=3

# Rate Limiting (optimized)
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW_MS=60000

# CORS (optimized for performance)
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,https://primeosys.com,https://www.primeosys.com,https://crm-frontend-nextjs-six.vercel.app,https://crm-frontend-nextjs-y2qv.onrender.com

# API Base URL for Swagger
API_BASE_URL=https://primeosys.com/crm-backend
"@

$envContent | Out-File -FilePath ".env.optimized" -Encoding UTF8

# Step 2: Create remote directory structure
Write-Host "[2/6] Creating remote directory structure..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "mkdir -p $REMOTE_DIR/docker $REMOTE_DIR/supabase $REMOTE_DIR/src $REMOTE_DIR/logs"

# Step 3: Copy optimized source code
Write-Host "[3/6] Copying optimized source code..." -ForegroundColor Yellow

# Copy main config files
scp -i $SSH_KEY docker-compose.yml "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY Dockerfile "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY package.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY package-lock.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY .env.optimized "${SERVER}:${REMOTE_DIR}/.env"

# Copy optimized source code
ssh -i $SSH_KEY $SERVER "rm -rf $REMOTE_DIR/src && mkdir -p $REMOTE_DIR/src"
scp -i $SSH_KEY -r src/ "${SERVER}:${REMOTE_DIR}/src/"

# Copy SQL files
scp -i $SSH_KEY supabase/schema.sql "${SERVER}:${REMOTE_DIR}/supabase/"
scp -i $SSH_KEY supabase/seed.sql "${SERVER}:${REMOTE_DIR}/supabase/"

Write-Host "   Files copied successfully!" -ForegroundColor Green

# Step 4: Stop existing optimized containers if any
Write-Host "[4/6] Stopping existing optimized containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true"

# Step 5: Build and start optimized containers
Write-Host "[5/6] Building and starting optimized containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose up -d --build"

# Step 6: Wait and check health
Write-Host "[6/6] Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose ps"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "  Health Check" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "curl -s http://localhost:8080/health"
Write-Host ""
Write-Host ""
Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "  Performance Metrics" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "curl -s http://localhost:8080/api/v1/analytics/performance"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "  Database Check" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker exec \$(docker compose ps -q postgres) pg_isready -U postgres && echo 'PostgreSQL: OK' || echo 'PostgreSQL: FAILED'"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "  Redis Check" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker exec \$(docker compose ps -q redis) redis-cli -a crm_redis_secret ping && echo 'Redis: OK' || echo 'Redis: FAILED'"
Write-Host ""

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Optimized Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  API:        http://91.98.235.142:8080" -ForegroundColor White
Write-Host "  API Docs:   http://91.98.235.142:8080/docs" -ForegroundColor White
Write-Host "  Health:     http://91.98.235.142:8080/health" -ForegroundColor White
Write-Host "  HTTPS:      https://primeosys.com/crm-backend" -ForegroundColor White
Write-Host ""
Write-Host "  Features:   Compression, Caching, Connection Pooling, Batch Processing" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Performance monitoring available at /api/v1/analytics/performance" -ForegroundColor Yellow
Write-Host ""