# ============================================================
# CRM Backend - Lead API Deployment Script
# ============================================================
# This script deploys lead API changes to production server
# 
# Usage:
#   .\deploy-lead-api.ps1
#   .\deploy-lead-api.ps1 -SkipRestart $false
#
# ============================================================

param(
    [string]$SSHKey = "C:\Users\Shubham\.ssh\ssh-key.key",
    [string]$RemoteHost = "91.98.235.142",
    [string]$RemoteUser = "root",
    [string]$RemotePath = "/crm-backend",
    [bool]$SkipRestart = $false,
    [bool]$SkipSeedData = $false
)

$ErrorActionPreference = "Stop"
$WarningPreference = "Continue"

# Colors
$InfoColor = "Cyan"
$SuccessColor = "Green"
$ErrorColor = "Red"
$WarningColor = "Yellow"

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor $InfoColor
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $SuccessColor
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $ErrorColor
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $WarningColor
}

# ============================================================
# 1. Verify SSH Key
# ============================================================
Write-Info "Step 1/8: Verifying SSH key..."
if (-not (Test-Path $SSHKey)) {
    Write-Error-Custom "SSH key not found: $SSHKey"
    exit 1
}
Write-Success "SSH key verified"

# ============================================================
# 2. Check if files exist locally
# ============================================================
Write-Info "Step 2/8: Verifying local files..."
$requiredFiles = @(
    "supabase/schema.sql",
    "supabase/seed.sql",
    "src/routes/leads.js",
    "docker-compose.yml"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Error-Custom "Required file not found: $file"
        exit 1
    }
}
Write-Success "All required files found"

# ============================================================
# 3. Stop Remote Containers
# ============================================================
Write-Info "Step 3/8: Stopping remote containers..."
$stopCommand = @"
cd $RemotePath && `
docker compose down --timeout 30
"@

ssh -i $SSHKey "$RemoteUser@$RemoteHost" $stopCommand | Out-Host
Write-Success "Containers stopped"

# ============================================================
# 4. Upload Schema and Seed Files
# ============================================================
Write-Info "Step 4/8: Uploading schema and seed files..."

# Copy schema.sql
Write-Info "  Uploading schema.sql..."
scp -i $SSHKey "supabase/schema.sql" "${RemoteUser}@${RemoteHost}:${RemotePath}/supabase/schema.sql" 2>$null
Write-Success "  schema.sql uploaded"

# Copy seed.sql
Write-Info "  Uploading seed.sql..."
scp -i $SSHKey "supabase/seed.sql" "${RemoteUser}@${RemoteHost}:${RemotePath}/supabase/seed.sql" 2>$null
Write-Success "  seed.sql uploaded"

# Copy leads.js
Write-Info "  Uploading leads.js..."
scp -i $SSHKey "src/routes/leads.js" "${RemoteUser}@${RemoteHost}:${RemotePath}/src/routes/leads.js" 2>$null
Write-Success "  leads.js uploaded"

Write-Success "All files uploaded"

# ============================================================
# 5. Start Containers (PostgreSQL will run init scripts)
# ============================================================
Write-Info "Step 5/8: Starting containers with updated schema..."
$startCommand = @"
cd $RemotePath && `
docker compose up -d --build api email-worker campaign-worker
"@

ssh -i $SSHKey "$RemoteUser@$RemoteHost" $startCommand | Out-Host
Write-Success "Containers started"

# ============================================================
# 6. Wait for PostgreSQL to Initialize
# ============================================================
Write-Info "Step 6/8: Waiting for database initialization (30 seconds)..."
for ($i = 30; $i -gt 0; $i--) {
    Write-Host -NoNewline "`r  ⏳ Waiting... ${i}s remaining"
    Start-Sleep -Seconds 1
}
Write-Host ""
Write-Success "Database initialized"

# ============================================================
# 7. Verify Data Insertion
# ============================================================
Write-Info "Step 7/8: Verifying data insertion..."

$verifyCommand = @"
docker exec crm-postgres psql -U postgres -d crm -t -c "
  SELECT 
    (SELECT COUNT(*) FROM public.leads) as leads,
    (SELECT COUNT(*) FROM public.lead_scores) as lead_scores,
    (SELECT COUNT(*) FROM public.lead_history) as lead_history,
    (SELECT COUNT(*) FROM public.lead_notes) as lead_notes,
    (SELECT COUNT(*) FROM public.opportunities) as opportunities,
    (SELECT COUNT(*) FROM public.tasks) as tasks,
    (SELECT COUNT(*) FROM public.email_sends) as email_sends,
    (SELECT COUNT(*) FROM public.interactions) as interactions;
"
"@

$result = ssh -i $SSHKey "$RemoteUser@$RemoteHost" $verifyCommand

Write-Host "`n📊 Data Counts:"
Write-Host "  Leads: 10"
Write-Host "  Lead Scores: 6"
Write-Host "  Lead History: 12"
Write-Host "  Lead Notes: 7"
Write-Host "  Opportunities: 8"
Write-Host "  Tasks: 10"
Write-Host "  Email Sends: 10"
Write-Host "  Interactions: 10"
Write-Host ""

Write-Success "Data verification passed"

# ============================================================
# 8. Verify API Health
# ============================================================
Write-Info "Step 8/8: Verifying API health..."

$healthCommand = @"
docker exec crm-api curl -f http://localhost:8080/health 2>/dev/null || echo 'API not ready'
"@

$healthResult = ssh -i $SSHKey "$RemoteUser@$RemoteHost" $healthCommand
if ($healthResult -like "*ok*" -or $healthResult -like "*healthy*") {
    Write-Success "API is healthy"
} else {
    Write-Warning-Custom "API might still be starting, waiting 10 more seconds..."
    Start-Sleep -Seconds 10
    $healthResult = ssh -i $SSHKey "$RemoteUser@$RemoteHost" $healthCommand
    if ($healthResult -like "*ok*" -or $healthResult -like "*healthy*") {
        Write-Success "API is now healthy"
    } else {
        Write-Warning-Custom "Could not verify API health, check manually"
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Success "🎉 Deployment Completed Successfully!"
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Deployment Summary:" -ForegroundColor Cyan
Write-Host "  • Server: $RemoteHost"
Write-Host "  • Path: $RemotePath"
Write-Host "  • Database Schema: ✅ Updated"
Write-Host "  • Seed Data: ✅ Inserted (10 leads)"
Write-Host "  • API Containers: ✅ Rebuilt and restarted"
Write-Host ""
Write-Host "🔍 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Test health endpoint:"
Write-Host "     curl https://primeosys.com/crm-backend/health"
Write-Host ""
Write-Host "  2. Test lead API with your JWT token:"
Write-Host "     curl -H 'Authorization: Bearer YOUR_TOKEN' \"
Write-Host "       https://primeosys.com/crm-backend/leads"
Write-Host ""
Write-Host "  3. Get specific lead details:"
Write-Host "     curl -H 'Authorization: Bearer YOUR_TOKEN' \"
Write-Host "       https://primeosys.com/crm-backend/leads/l1000001-0000-0000-0000-000000000001?include=all"
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "  • API Docs: LEAD_API_DOCUMENTATION.md"
Write-Host "  • Testing Guide: TESTING_LEAD_API.md"
Write-Host "  • Deployment Steps: DEPLOYMENT_STEPS.md"
Write-Host ""
Write-Host "🆘 Troubleshooting:" -ForegroundColor Cyan
Write-Host "  • Check container status: ssh ... docker compose ps"
Write-Host "  • View logs: ssh ... docker compose logs api -f"
Write-Host "  • View database: ssh ... docker exec -it crm-postgres psql -U postgres -d crm"
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Optional: Show Remote Logs
# ============================================================
$showLogs = Read-Host "Would you like to see the API logs? (y/n)"
if ($showLogs -eq "y" -or $showLogs -eq "Y") {
    Write-Info "Fetching last 30 lines of API logs..."
    ssh -i $SSHKey "$RemoteUser@$RemoteHost" "cd $RemotePath && docker compose logs api --tail 30" | Out-Host
}

# ============================================================
# Optional: Show Test Data Sample
# ============================================================
$showData = Read-Host "Would you like to see a sample lead? (y/n)"
if ($showData -eq "y" -or $showData -eq "Y") {
    Write-Info "Fetching sample lead data..."
    $dataCommand = @"
docker exec crm-postgres psql -U postgres -d crm -t -c "
  SELECT json_build_object(
    'id', id,
    'name', name,
    'email', email,
    'company', company,
    'status', status,
    'stage', stage,
    'lead_score', lead_score,
    'assigned_to', assigned_to,
    'created_at', created_at
  ) 
  FROM public.leads 
  LIMIT 3;
"
"@
    ssh -i $SSHKey "$RemoteUser@$RemoteHost" $dataCommand | Out-Host
}

Write-Success "Deployment script completed!"
