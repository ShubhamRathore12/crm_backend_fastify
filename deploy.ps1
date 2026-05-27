# ============================================================
# CRM Backend - Deployment Script
# Deploy to server via SSH using Docker
# ============================================================

$ErrorActionPreference = "Stop"

# Configuration
$SSH_KEY = "C:\Users\Shubham\.ssh\ssh-key.key"
$SERVER = "root@91.98.235.142"
$REMOTE_DIR = "/opt/crm-backend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CRM Backend Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create remote directory structure
Write-Host "[1/6] Creating remote directory structure..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "mkdir -p $REMOTE_DIR/docker $REMOTE_DIR/supabase $REMOTE_DIR/src $REMOTE_DIR/logs"

# Step 2: Copy project files to server
Write-Host "[2/6] Copying project files to server..." -ForegroundColor Yellow

# Copy main config files
scp -i $SSH_KEY docker-compose.yml "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY Dockerfile "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY package.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY package-lock.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY .env.production "${SERVER}:${REMOTE_DIR}/.env"

# Copy docker config
scp -i $SSH_KEY docker/nginx.conf "${SERVER}:${REMOTE_DIR}/docker/"
if (Test-Path "docker/kong.yml") { scp -i $SSH_KEY docker/kong.yml "${SERVER}:${REMOTE_DIR}/docker/" }

# Copy SQL files
scp -i $SSH_KEY supabase/schema.sql "${SERVER}:${REMOTE_DIR}/supabase/"
scp -i $SSH_KEY supabase/seed.sql "${SERVER}:${REMOTE_DIR}/supabase/"

# Copy source code (recursive)
scp -i $SSH_KEY -r src/ "${SERVER}:${REMOTE_DIR}/src/"

Write-Host "   Files copied successfully!" -ForegroundColor Green

# Step 3: Install Docker on server (if not installed)
Write-Host "[3/6] Ensuring Docker is installed on server..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER @"
if ! command -v docker &> /dev/null; then
    echo 'Installing Docker...'
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu `$(. /etc/os-release && echo \$VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
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

# Step 4: Stop existing containers (if any)
Write-Host "[4/6] Stopping existing containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose down --remove-orphans 2>/dev/null || true"

# Step 5: Build and start containers
Write-Host "[5/6] Building and starting Docker containers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && docker compose up -d --build"

# Step 6: Wait and check health
Write-Host "[6/6] Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

ssh -i $SSH_KEY $SERVER @"
echo ''
echo '========================================='
echo '  Container Status'
echo '========================================='
cd $REMOTE_DIR && docker compose ps
echo ''
echo '========================================='
echo '  Health Check'
echo '========================================='
curl -s http://localhost:8080/health || echo 'API not ready yet (may need more time)'
echo ''
echo ''
echo '========================================='
echo '  PostgreSQL Check'
echo '========================================='
docker exec crm-postgres pg_isready -U postgres && echo 'PostgreSQL: OK' || echo 'PostgreSQL: FAILED'
echo ''
echo '========================================='
echo '  Redis Check'
echo '========================================='
docker exec crm-redis redis-cli -a crm_redis_secret ping || echo 'Redis: FAILED'
echo ''
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  API:        http://91.98.235.142:8080" -ForegroundColor White
Write-Host "  API Docs:   http://91.98.235.142:8080/docs" -ForegroundColor White
Write-Host "  Health:     http://91.98.235.142:8080/health" -ForegroundColor White
Write-Host "  PostgREST:  http://91.98.235.142:3001" -ForegroundColor White
Write-Host "  Kong:       http://91.98.235.142:8000" -ForegroundColor White
Write-Host ""
Write-Host "  SSH into server: ssh -i $SSH_KEY $SERVER" -ForegroundColor Gray
Write-Host "  View logs:       ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && docker compose logs -f'" -ForegroundColor Gray
Write-Host ""
