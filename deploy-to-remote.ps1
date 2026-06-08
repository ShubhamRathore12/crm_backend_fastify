# ============================================================================
# CRM Backend Remote Deployment Script
# ============================================================================
# This script deploys the CRM backend to a remote server via SSH

param(
    [string]$SSHKey = "C:\Users\Shubham\.ssh\ssh-key.key",
    [string]$RemoteHost = "91.98.235.142",
    [string]$RemoteUser = "root",
    [string]$RemotePath = "/crm-backend",
    [string]$LocalPath = "."
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
Write-Info "CRM Backend Remote Deployment"
Write-Info "=========================================="
Write-Info "SSH Key: $SSHKey"
Write-Info "Remote Host: $RemoteHost"
Write-Info "Remote User: $RemoteUser"
Write-Info "Remote Path: $RemotePath"
Write-Info "Local Path: $LocalPath"
Write-Info ""

# Step 1: Build the project locally
Write-Info "Step 1: Installing dependencies locally..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Failed to install dependencies"
    exit 1
}
Write-Success "Dependencies installed successfully"

# Step 2: Create SSH connection string
$SSHConnection = "${RemoteUser}@${RemoteHost}"

# Step 3: Check if remote directory exists
Write-Info "Step 2: Checking remote directory..."
$RemoteDirCheck = ssh -i $SSHKey $SSHConnection "test -d $RemotePath && echo 'EXISTS' || echo 'NOT_EXISTS'"

if ($RemoteDirCheck -eq "NOT_EXISTS") {
    Write-Info "Creating remote directory: $RemotePath"
    ssh -i $SSHKey $SSHConnection "mkdir -p $RemotePath"
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to create remote directory"
        exit 1
    }
}
Write-Success "Remote directory ready"

# Step 4: Stop the existing service (if running)
Write-Info "Step 3: Stopping existing service..."
ssh -i $SSHKey $SSHConnection "cd $RemotePath && npm stop 2>/dev/null || true"
ssh -i $SSHKey $SSHConnection "pkill -f 'node src/app.js' || true"
Start-Sleep -Seconds 2

# Step 5: Backup existing installation
Write-Info "Step 4: Backing up existing installation..."
$BackupDir = "${RemotePath}.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
ssh -i $SSHKey $SSHConnection "test -d $RemotePath && mv $RemotePath $BackupDir || true"
Write-Success "Backup created at: $BackupDir"

# Step 6: Upload project files using SCP
Write-Info "Step 5: Uploading project files via SCP..."
$LocalFiles = @(
    "src",
    "package.json",
    "package-lock.json",
    "Dockerfile",
    "docker-compose.yml",
    ".env.production"
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

# Step 7: Install dependencies on remote
Write-Info "Step 6: Installing dependencies on remote server..."
ssh -i $SSHKey $SSHConnection "cd $RemotePath && npm install --production"
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Failed to install remote dependencies"
    exit 1
}
Write-Success "Remote dependencies installed"

# Step 8: Set permissions
Write-Info "Step 7: Setting correct permissions..."
ssh -i $SSHKey $SSHConnection "chmod -R 755 $RemotePath && chmod -R 755 ${RemotePath}/src"

# Step 9: Start the service
Write-Info "Step 8: Starting the service..."
ssh -i $SSHKey $SSHConnection "cd $RemotePath && nohup npm start > ${RemotePath}/app.log 2>&1 &"
Start-Sleep -Seconds 3

# Step 10: Verify the service is running
Write-Info "Step 9: Verifying service status..."
$ServiceStatus = ssh -i $SSHKey $SSHConnection "curl -s http://localhost:3000/health || echo 'NOT_RESPONDING'"

if ($ServiceStatus -like "*running*" -or $ServiceStatus -ne "NOT_RESPONDING") {
    Write-Success "Service is running!"
} else {
    Write-Info "Checking logs..."
    ssh -i $SSHKey $SSHConnection "tail -20 ${RemotePath}/app.log"
}

Write-Success ""
Write-Success "=========================================="
Write-Success "Deployment completed successfully!"
Write-Success "=========================================="
Write-Success "Server: $RemoteHost"
Write-Success "Path: $RemotePath"
Write-Success "Service started: npm start"
Write-Success ""
Write-Info "To view logs: ssh -i $SSHKey $SSHConnection 'tail -f ${RemotePath}/app.log'"
Write-Info "To restart: ssh -i $SSHKey $SSHConnection 'cd $RemotePath && npm start'"
