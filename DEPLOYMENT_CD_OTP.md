# CRM Backend Deployment to /cd/otp

## Overview

This guide deploys the CRM backend to `/cd/otp` on the remote server without affecting other deployments. The deployment will:

- Use port **3001** (separate from other services)
- Create isolated `node_modules`
- Maintain separate logs and configuration
- Can coexist with grain backend and other services

## Prerequisites

- SSH access with key: `C:\Users\Shubham\.ssh\ssh-key.key`
- Remote server: `91.98.235.142`
- Remote directory: `/cd/otp` (will be created if needed)

## Quick Deploy (Automated)

Run the PowerShell script:

```powershell
# Navigate to backend directory
cd d:\new_project\new_hmi\crm\backend

# Run deployment script
.\deploy-to-cd-otp.ps1
```

The script will:
1. ✅ Install dependencies locally
2. ✅ Create `/cd/otp` directory
3. ✅ Backup existing deployment (if any)
4. ✅ Upload all project files
5. ✅ Install dependencies remotely
6. ✅ Create environment configuration
7. ✅ Start service on port 3001
8. ✅ Verify deployment

## Manual Deployment Steps

### Step 1: Connect to Remote Server

```bash
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142
```

### Step 2: Create Directory Structure

```bash
# Create the deployment directory
mkdir -p /cd/otp
cd /cd/otp

# Create necessary subdirectories
mkdir -p logs
mkdir -p node_modules
```

### Step 3: Upload Project Files

From your local machine (in a new terminal):

```bash
# Define variables
$SSH_KEY = "C:\Users\Shubham\.ssh\ssh-key.key"
$REMOTE = "root@91.98.235.142"
$REMOTE_PATH = "/cd/otp"

# Upload source code
scp -i $SSH_KEY -r src "$REMOTE:$REMOTE_PATH/"

# Upload package files
scp -i $SSH_KEY package.json "$REMOTE:$REMOTE_PATH/"
scp -i $SSH_KEY package-lock.json "$REMOTE:$REMOTE_PATH/"
```

Or using bash:

```bash
scp -i ~/.ssh/ssh-key.key -r src root@91.98.235.142:/cd/otp/
scp -i ~/.ssh/ssh-key.key package.json root@91.98.235.142:/cd/otp/
scp -i ~/.ssh/ssh-key.key package-lock.json root@91.98.235.142:/cd/otp/
```

### Step 4: Create Environment Configuration

On the remote server:

```bash
cat > /cd/otp/.env << 'EOF'
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
SUPABASE_URL=https://vovppxpwuuhlbkihpaky.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_publishable_zX8P5u6tDXEsT35YCbsLQw_z7P8JSr1
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdnBweHB3dXVobGJraWhwYWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDU5MTIsImV4cCI6MjA4ODg4MTkxMn0.4jdSIki6QmSAoLA0ILs0jMJpAcZYLTCzebi_-cQ8VV8

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

# Security Keys (MUST CHANGE IN PRODUCTION)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-CHANGE-NOW
API_KEY_SALT=your-api-key-salt-for-hashing-CHANGE-NOW
WEBHOOK_SECRET=your-webhook-signing-secret-CHANGE-NOW

# AWS SES
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=Your Company

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Your Company

# Mailgun
MAILGUN_API_KEY=
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com

# Email Queue
EMAIL_QUEUE_CONCURRENCY=50
CAMPAIGN_BATCH_SIZE=500
MAX_RETRIES=3
RETRY_DELAY_BASE=60000

# Logging
LOG_LEVEL=info
LOG_PRETTY=false
EOF

# Secure the .env file
chmod 600 /cd/otp/.env
```

### Step 5: Install Dependencies

```bash
cd /cd/otp
npm install --production --no-optional
```

### Step 6: Start the Service

```bash
# Start in background with nohup
nohup npm start > /cd/otp/app.log 2>&1 &

# Or start in a new tmux/screen session
tmux new-session -d -s crm-otp 'cd /cd/otp && npm start'
```

### Step 7: Verify Deployment

```bash
# Check if process is running
ps aux | grep "node src/app.js" | grep -v grep

# Check port is listening
lsof -i :3001

# Test health endpoint
curl http://localhost:3001/health

# View logs
tail -f /cd/otp/app.log
```

## Environment Configuration

Update these values in `/cd/otp/.env` based on your setup:

| Variable | Purpose | Required |
|----------|---------|----------|
| `JWT_SECRET` | JWT token signing | Yes |
| `API_KEY_SALT` | API key hashing | Yes |
| `WEBHOOK_SECRET` | Webhook validation | Yes |
| `SUPABASE_URL` | Database connection | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Database auth | Yes |
| `REDIS_HOST` | Cache/queue backend | Yes |
| `REDIS_PASSWORD` | Redis auth | Maybe |
| `AWS_ACCESS_KEY_ID` | Email sending (SES) | Optional |
| `SENDGRID_API_KEY` | Email sending | Optional |
| `MAILGUN_API_KEY` | Email sending | Optional |

## Service Management

### Start Service

```bash
# Foreground (for testing)
cd /cd/otp && npm start

# Background
cd /cd/otp && nohup npm start > app.log 2>&1 &
```

### Stop Service

```bash
# Kill by process name
pkill -f "node src/app.js"

# Kill by port
lsof -ti:3001 | xargs kill -9
```

### View Logs

```bash
# Real-time logs
tail -f /cd/otp/app.log

# Last 50 lines
tail -50 /cd/otp/app.log

# Search for errors
grep ERROR /cd/otp/app.log
```

### Restart Service

```bash
# Stop and start
pkill -f "node src/app.js"
sleep 2
cd /cd/otp && nohup npm start > app.log 2>&1 &
```

## Using Systemd (Recommended for Production)

### Create Service File

```bash
sudo tee /etc/systemd/system/crm-otp.service > /dev/null <<EOF
[Unit]
Description=CRM Backend OTP Service
After=network.target redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/cd/otp
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=append:/cd/otp/logs/app.log
StandardError=append:/cd/otp/logs/app.log
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF
```

### Enable and Start

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable crm-otp

# Start the service
sudo systemctl start crm-otp

# Check status
sudo systemctl status crm-otp

# View logs
sudo journalctl -u crm-otp -f
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### Service Won't Start

```bash
# Check for errors
tail -50 /cd/otp/app.log

# Verify Node.js is installed
node --version

# Check if all dependencies installed
cd /cd/otp && npm ls
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping

# Check Redis running
ps aux | grep redis

# Start Redis if needed
redis-server --daemonize yes
```

### High Memory Usage

```bash
# Check process memory
ps aux | grep "node src/app.js"

# Restart service
sudo systemctl restart crm-otp

# Check logs for memory leaks
grep -i memory /cd/otp/app.log
```

## Backup and Restore

### Create Backup

```bash
# Backup entire deployment
tar -czf /cd/otp.backup.$(date +%Y%m%d_%H%M%S).tar.gz /cd/otp

# List backups
ls -lh /cd/*.backup.*
```

### Restore from Backup

```bash
# Stop service
sudo systemctl stop crm-otp

# Extract backup
tar -xzf /cd/otp.backup.YYYYMMDD_HHMMSS.tar.gz -C /

# Start service
sudo systemctl start crm-otp
```

## Monitoring

### Check Health

```bash
# API health endpoint
curl http://localhost:3001/health

# Process status
ps aux | grep "node src/app.js"

# Port listening
netstat -tlnp | grep 3001
```

### Performance Monitoring

```bash
# CPU and Memory
top -p $(pgrep -f "node src/app.js")

# Active connections
netstat -an | grep :3001 | wc -l

# Queue status
redis-cli keys "bull:*"
```

## Coexistence with Other Services

Your deployment in `/cd/otp` will coexist with:
- Grain backend (different port)
- Other services (different directories)
- Shared Redis instance (ensure unique queue names)

### Access Your Service

```
http://91.98.235.142:3001
```

## Next Steps

1. Test all endpoints
2. Configure nginx/HAProxy if needed for reverse proxy
3. Set up monitoring and alerting
4. Configure domain/SSL if needed
5. Test email queue workers
6. Monitor logs for errors

---

**Support**: For deployment issues, check logs at `/cd/otp/app.log`
