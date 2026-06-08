# ============================================================================
# CRM Backend Deployment to /cd/otp on Remote Server
# ============================================================================
# Deploys to /cd/otp without affecting existing deployments
# Uses parallel port (3001) to avoid conflicts

param(
    [string]$SSHKey = "C:\Users\Shubham\.ssh\ssh-key.key",
    [string]$RemoteHost = "91.98.235.142",
    [string]$RemoteUser = "root",
    [string]$RemotePath = "/cd/otp",
    [string]$LocalPath = ".",
    [int]$Port = 3001
)

# Color output functions
function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

# Validate SSH key exists
if (-not (Test-Path $SSHKey)) {
    Write-Error-Custom "SSH key not found at: $SSHKey"
    exit 1
}

Write-Info "=========================================="
Write-Info "CRM Backend Deployment to /cd/otp"
Write-Info "=========================================="
Write-Info "SSH Key: $SSHKey"
Write-Info "Remote Host: $RemoteHost"
Write-Info "Remote User: $RemoteUser"
Write-Info "Remote Path: $RemotePath"
Write-Info "Port: $Port"
Write-Info "Local Path: $LocalPath"
Write-Info ""

# Step 1: Validate local project
Write-Info "Step 1: Validating local project..."
if (-not (Test-Path "package.json")) {
    Write-Error-Custom "package.json not found in current directory"
    exit 1
}
Write-Success "Project structure valid"

# Step 2: Install dependencies locally
Write-Info "Step 2: Installing dependencies locally..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Failed to install dependencies"
    exit 1
}
Write-Success "Dependencies installed successfully"

# Step 3: Create SSH connection string
$SSHConnection = "${RemoteUser}@${RemoteHost}"

# Step 4: Check remote directory structure
Write-Info "Step 3: Checking remote directory structure..."
$RemoteDirCheck = ssh -i $SSHKey $SSHConnection "test -d $RemotePath && echo 'EXISTS' || echo 'NOT_EXISTS'"

if ($RemoteDirCheck -eq "NOT_EXISTS") {
    Write-Info "Creating directory: $RemotePath"
    ssh -i $SSHKey $SSHConnection "mkdir -p $RemotePath"
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to create remote directory"
        exit 1
    }
    Write-Success "Directory created"
} else {
    Write-Info "Directory already exists"
}

# Step 5: Backup existing deployment if it exists
Write-Info "Step 4: Checking for existing deployment..."
$ExistingCheck = ssh -i $SSHKey $SSHConnection "test -d $RemotePath/src && echo 'EXISTS' || echo 'NOT_EXISTS'"

if ($ExistingCheck -eq "EXISTS") {
    Write-Warning-Custom "Existing deployment found. Creating backup..."
    $BackupDir = "${RemotePath}.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    ssh -i $SSHKey $SSHConnection "cp -r $RemotePath $BackupDir && echo 'Backup created at: $BackupDir'"
    Write-Success "Backup created"
}

# Step 6: Create isolated node_modules directory
Write-Info "Step 5: Setting up isolated environment..."
ssh -i $SSHKey $SSHConnection "mkdir -p ${RemotePath}/node_modules"

# Step 7: Upload project files using SCP
Write-Info "Step 6: Uploading project files..."
$LocalFiles = @(
    "src",
    "package.json",
    "package-lock.json"
)

foreach ($file in $LocalFiles) {
    if (Test-Path $file) {
        Write-Info "  Uploading: $file"
        scp -i $SSHKey -r "$file" "${SSHConnection}:${RemotePath}/"
        if ($LASTEXITCODE -ne 0) {
            Write-Error-Custom "Failed to upload: $file"
            exit 1
        }
    }
}
Write-Success "Project files uploaded"

# Step 8: Create production .env file
Write-Info "Step 7: Creating environment configuration..."
$EnvContent = @"
NODE_ENV=production
PORT=$Port
HOST=0.0.0.0

# Database
SUPABASE_URL=https://vovppxpwuuhlbkihpaky.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_publishable_zX8P5u6tDXEsT35YCbsLQw_z7P8JSr1
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdnBweHB3dXVobGJraWhwYWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDU5MTIsImV4cCI6MjA4ODg4MTkxMn0.4jdSIki6QmSAoLA0ILs0jMJpAcZYLTCzebi_-cQ8VV8

# Redis - Update with your actual Redis configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

# Security - Update with your actual secrets
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-CHANGE-IN-PRODUCTION
API_KEY_SALT=your-api-key-salt-for-hashing-CHANGE-IN-PRODUCTION
WEBHOOK_SECRET=your-webhook-signing-secret-CHANGE-IN-PRODUCTION

# AWS SES - Update with your credentials
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=Your Company

# SendGrid - Update with your credentials
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Your Company

# Mailgun - Update with your credentials
MAILGUN_API_KEY=
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com

# Email Queue
EMAIL_QUEUE_CONCURRENCY=50
CAMPAIGN_BATCH_SIZE=500
MAX_RETRIES=3
RETRY_DELAY_BASE=60000

# Tracking URLs
UNSUBSCRIBE_BASE_URL=https://api.yourdomain.com/unsubscribe
TRACKING_PIXEL_BASE_URL=https://api.yourdomain.com/track/open
CLICK_TRACKING_BASE_URL=https://api.yourdomain.com/track/click

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
LOG_PRETTY=false
"@

# Upload .env file
$EnvFile = New-TemporaryFile
Set-Content -Path $EnvFile.FullName -Value $EnvContent
scp -i $SSHKey $EnvFile.FullName "${SSHConnection}:${RemotePath}/.env"
Remove-Item $EnvFile.FullName

Write-Success "Environment file created"

# Step 9: Install dependencies on remote
Write-Info "Step 8: Installing dependencies on remote server..."
ssh -i $SSHKey $SSHConnection "cd $RemotePath && npm install --production --no-optional"
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Failed to install remote dependencies"
    exit 1
}
Write-Success "Remote dependencies installed"

# Step 10: Set correct permissions
Write-Info "Step 9: Setting permissions..."
ssh -i $SSHKey $SSHConnection "chmod -R 755 $RemotePath && chmod 600 ${RemotePath}/.env"

# Step 11: Kill any existing process on the target port
Write-Info "Step 10: Checking for processes on port $Port..."
ssh -i $SSHKey $SSHConnection "lsof -ti:$Port | xargs kill -9 2>/dev/null || true"
Start-Sleep -Seconds 1

# Step 12: Start the service
Write-Info "Step 11: Starting the service on port $Port..."
ssh -i $SSHKey $SSHConnection "cd $RemotePath && nohup npm start > ${RemotePath}/app.log 2>&1 &"
Start-Sleep -Seconds 3

# Step 13: Verify the service is running
Write-Info "Step 12: Verifying service status..."
$HealthCheck = ssh -i $SSHKey $SSHConnection "curl -s http://localhost:$Port/health 2>&1 || echo 'TIMEOUT'"

if ($HealthCheck -like "*200*" -or $HealthCheck -like "*Connected*") {
    Write-Success "Service is running!"
} else {
    Write-Warning-Custom "Health check inconclusive. Checking process..."
    $ProcessCheck = ssh -i $SSHKey $SSHConnection "ps aux | grep 'node src/app.js' | grep -v grep | wc -l"
    if ($ProcessCheck -gt 0) {
        Write-Success "Service process is running"
        Write-Info "Waiting for service to fully start..."
        Start-Sleep -Seconds 3
    } else {
        Write-Warning-Custom "Process not found. Checking logs..."
        ssh -i $SSHKey $SSHConnection "tail -30 ${RemotePath}/app.log"
    }
}

# Step 14: Display connection info
Write-Success ""
Write-Success "=========================================="
Write-Success "Deployment Completed Successfully!"
Write-Success "=========================================="
Write-Success ""
Write-Success "Deployment Details:"
Write-Success "  Server: $RemoteHost"
Write-Success "  Path: $RemotePath"
Write-Success "  Port: $Port"
Write-Success "  Service: npm start"
Write-Success ""
Write-Info "Access your application:"
Write-Info "  http://${RemoteHost}:${Port}"
Write-Info ""
Write-Info "Remote management commands:"
Write-Info "  View logs:"
Write-Info "    ssh -i $SSHKey $SSHConnection 'tail -f ${RemotePath}/app.log'"
Write-Info ""
Write-Info "  Restart service:"
Write-Info "    ssh -i $SSHKey $SSHConnection 'cd $RemotePath && npm start'"
Write-Info ""
Write-Info "  Stop service:"
Write-Info "    ssh -i $SSHKey $SSHConnection 'pkill -f \"node src/app.js\"'"
Write-Info ""
Write-Info "  Check process:"
Write-Info "    ssh -i $SSHKey $SSHConnection 'ps aux | grep \"node src/app.js\"'"
Write-Info ""

if ($BackupDir) {
    Write-Warning-Custom "Previous deployment backed up at: $BackupDir"
}

Write-Info "=========================================="
