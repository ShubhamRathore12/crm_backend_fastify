# Deploy PostgreSQL configuration fix to production server
# This changes the app to use local PostgreSQL instead of Supabase cloud

$SERVER = "91.98.235.142"
$SSH_KEY = "C:\Users\Shubham\.ssh\ssh-key.key"
$REMOTE_PATH = "/crm-backend"
$CONTAINER_NAME = "crm_backend"

Write-Host "Deploying PostgreSQL configuration fix..." -ForegroundColor Cyan

# 1. Copy updated files via SCP
Write-Host "Uploading new PostgreSQL client..." -ForegroundColor Yellow
& scp -i $SSH_KEY "src/config/postgres.js" "root@${SERVER}:${REMOTE_PATH}/src/config/postgres.js"

Write-Host "Uploading updated auth handler..." -ForegroundColor Yellow
& scp -i $SSH_KEY "src/routes/auth.js" "root@${SERVER}:${REMOTE_PATH}/src/routes/auth.js"

Write-Host "Uploading updated .env..." -ForegroundColor Yellow
& scp -i $SSH_KEY ".env" "root@${SERVER}:${REMOTE_PATH}/.env"

Write-Host "Uploading updated package.json..." -ForegroundColor Yellow
& scp -i $SSH_KEY "package.json" "root@${SERVER}:${REMOTE_PATH}/package.json"

# 2. SSH into server and restart container
Write-Host "Installing dependencies on server..." -ForegroundColor Yellow
& ssh -i $SSH_KEY "root@${SERVER}" "cd ${REMOTE_PATH} && npm install pg"

Write-Host "Restarting Docker container..." -ForegroundColor Yellow
& ssh -i $SSH_KEY "root@${SERVER}" "docker-compose -f ${REMOTE_PATH}/docker-compose.yml restart ${CONTAINER_NAME}"

Write-Host "Waiting for container to restart..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 3. Health check
Write-Host "Running health check..." -ForegroundColor Cyan
$health = & ssh -i $SSH_KEY "root@${SERVER}" "curl -s http://localhost:8080/health || echo 'FAILED'"

if ($health -like "*ok*" -or $health -like "*healthy*") {
  Write-Host "Server is healthy!" -ForegroundColor Green
} else {
  Write-Host "Health check result: $health" -ForegroundColor Yellow
}

# 4. Test login endpoint
Write-Host "Testing login endpoint..." -ForegroundColor Cyan
$testResult = & curl -X POST "https://primeosys.com/crm-backend/api/v1/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@crm.com","password":"Admin@123"}' `
  --insecure 2>&1

Write-Host $testResult -ForegroundColor Green

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Admin credentials:" -ForegroundColor Cyan
Write-Host "   Email: admin@crm.com" -ForegroundColor White
Write-Host "   Password: Admin@123" -ForegroundColor White
Write-Host "`nNext: Test the login at https://primeosys.com/crm-backend/api/v1/auth/login" -ForegroundColor Cyan
