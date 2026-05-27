# ============================================================
# CRM Backend - Optimized Deployment Script
# Deploy with performance optimizations
# ============================================================

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
Write-Host "[1/8] Creating optimized environment configuration..." -ForegroundColor Yellow
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
REDIS_CLUSTER_NODES=
REDIS_MAX_RETRIES_PER_REQUEST=null

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
Write-Host "[2/8] Creating remote directory structure..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "mkdir -p $REMOTE_DIR/docker $REMOTE_DIR/supabase $REMOTE_DIR/src $REMOTE_DIR/logs"

# Step 3: Copy optimized source code
Write-Host "[3/8] Copying optimized source code..." -ForegroundColor Yellow

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

# Step 4: Update docker-compose with performance optimizations
Write-Host "[4/8] Updating Docker configuration for performance..." -ForegroundColor Yellow
$dockerComposeContent = @"
version: '3.9'

services:
  # ============================================================
  # PostgreSQL — Optimized for performance
  # ============================================================
  postgres:
    image: postgres:15-alpine
    container_name: crm-optimized-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: `\${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: `\${POSTGRES_PASSWORD:-crm_postgres_secret_2024}
      POSTGRES_DB: `\${POSTGRES_DB:-crm}
      POSTGRES_MAX_CONNECTIONS: '200'
      POSTGRES_SHARED_BUFFERS: '256MB'
      POSTGRES_EFFECTIVE_CACHE_SIZE: '1GB'
      POSTGRES_MAINTENANCE_WORK_MEM: '64MB'
      POSTGRES_WORK_MEM: '4MB'
    ports:
      - '5434:5432'
    volumes:
      - postgres_data_optimized:/var/lib/postgresql/data
      - ./supabase/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./supabase/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
      - crm-optimized-network
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
"@

# Write the content to a temporary file
$dockerComposeContent | Out-File -FilePath "docker-compose-optimized-temp.yml" -Encoding UTF8

# Copy to server
scp -i $SSH_KEY "docker-compose-optimized-temp.yml" "${SERVER}:${REMOTE_DIR}/docker-compose.optimized.yml"

# Clean up
Remove-Item "docker-compose-optimized-temp.yml" -Force

  # ============================================================
  # Redis — Optimized for BullMQ
  # ============================================================
  redis:
    image: redis:7.2-alpine
    container_name: crm-optimized-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass \${REDIS_PASSWORD:-crm_redis_secret}
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
      --save 900 1
      --save 300 10
      --appendonly yes
      --appendfsync everysec
      --loglevel notice
      --maxclients 10000
      --tcp-keepalive 300
      --timeout 0
    ports:
      - '6381:6379'
    volumes:
      - redis_data_optimized:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '\${REDIS_PASSWORD:-crm_redis_secret}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - crm-optimized-network
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  # ============================================================
  # CRM API — Optimized with performance features
  # ============================================================
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
      args:
        NODE_ENV: production
        NODE_OPTIONS: '--max-old-space-size=512'
    container_name: crm-optimized-api
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 8080
      NODE_OPTIONS: '--max-old-space-size=512 --max-http-header-size=16384'
      UV_THREADPOOL_SIZE: '16'
    ports:
      - '4300:8080'
    volumes:
      - ./logs:/app/logs
    networks:
      - crm-optimized-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.5'
    # Scale horizontally
    scale: 2

  # ============================================================
  # Email Worker — Optimized for high concurrency
  # ============================================================
  email-worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: crm-optimized-email-worker
    restart: unless-stopped
    command: ['node', '--max-old-space-size=256', 'src/workers/emailWorker.js']
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NODE_ENV: production
      NODE_OPTIONS: '--max-old-space-size=256'
      EMAIL_QUEUE_CONCURRENCY: '100'
    networks:
      - crm-optimized-network
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
        reservations:
          memory: 128M
          cpus: '0.25'
    # Scale workers based on load
    scale: 4

  # ============================================================
  # Campaign Worker — Optimized for batch processing
  # ============================================================
  campaign-worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: crm-optimized-campaign-worker
    restart: unless-stopped
    command: ['node', '--max-old-space-size=256', 'src/workers/campaignWorker.js']
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NODE_ENV: production
      NODE_OPTIONS: '--max-old-space-size=256'
      CAMPAIGN_BATCH_SIZE: '1000'
    networks:
      - crm-optimized-network
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
        reservations:
          memory: 128M
          cpus: '0.25'
    scale: 2

# ============================================================
# Named volumes
# ============================================================
volumes:
  postgres_data_optimized:
    driver: local
  redis_data_optimized:
    driver: local

# ============================================================
# Networks
# ============================================================
networks:
  crm-optimized-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
EOF"

# Step 5: Install Docker if needed
Write-Host "[5/8] Ensuring Docker is installed..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER @"
if ! command -v docker &> /dev/null; then
    echo 'Installing Docker...'
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=\`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \`$(. /etc/os-release && echo \$VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo 'Docker installed successfully!'
else
    echo 'Docker already installed.'
fi
docker --version
docker compose version
"@

# Step 6: Stop existing containers
Write-Host "[6/8] Stopping existing containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose -f docker-compose.optimized.yml down --remove-orphans 2>/dev/null || true"

# Step 7: Build and start optimized containers
Write-Host "[7/8] Building and starting optimized containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose -f docker-compose.optimized.yml up -d --build --scale api=2 --scale email-worker=4 --scale campaign-worker=2"

# Step 8: Wait and check health
Write-Host "[8/8] Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

ssh -i $SSH_KEY $SERVER @"
echo ''
echo '========================================='
echo '  Optimized Container Status'
echo '========================================='
cd $REMOTE_DIR && docker compose -f docker-compose.optimized.yml ps
echo ''
echo '========================================='
echo '  Performance Health Check'
echo '========================================='
curl -s http://localhost:4300/health
echo ''
echo ''
echo '========================================='
echo '  Performance Metrics'
echo '========================================='
curl -s http://localhost:4300/api/v1/analytics/performance
echo ''
echo '========================================='
echo '  Database Check'
echo '========================================='
docker exec crm-optimized-postgres pg_isready -U postgres && echo 'PostgreSQL: OK' || echo 'PostgreSQL: FAILED'
echo ''
echo '========================================='
echo '  Redis Check'
echo '========================================='
docker exec crm-optimized-redis redis-cli -a crm_redis_secret ping || echo 'Redis: FAILED'
echo ''
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Optimized Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  API:        http://91.98.235.142:4300" -ForegroundColor White
Write-Host "  API Docs:   http://91.98.235.142:4300/docs" -ForegroundColor White
Write-Host "  Health:     http://91.98.235.142:4300/health" -ForegroundColor White
Write-Host "  HTTPS:      https://primeosys.com/crm-backend" -ForegroundColor White
Write-Host ""
Write-Host "  Scaling:    2 API instances, 4 email workers, 2 campaign workers" -ForegroundColor Cyan
Write-Host "  Memory:     PostgreSQL: 1GB, Redis: 512MB, API: 512MB each" -ForegroundColor Cyan
Write-Host "  Features:   Compression, Caching, Connection Pooling, Batch Processing" -ForegroundColor Cyan
Write-Host ""
Write-Host "  SSH into server: ssh -i $SSH_KEY $SERVER" -ForegroundColor Gray
Write-Host "  View logs:       ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && docker compose -f docker-compose.optimized.yml logs -f'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Performance monitoring available at /api/v1/analytics/performance" -ForegroundColor Yellow
Write-Host ""