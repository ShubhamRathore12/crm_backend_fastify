# CRM Backend Deployment Guide

## Quick Deploy (Recommended)

### 1. Prepare Environment Variables
Before deployment, ensure you have the correct environment variables:

```bash
# Copy the example and fill in production values
cp .env.example .env.production

# Edit with your production credentials
# - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
# - AWS_SES credentials
# - SendGrid / Mailgun credentials
# - JWT_SECRET, API_KEY_SALT, WEBHOOK_SECRET
```

### 2. Deploy Using PowerShell Script (Windows)

```powershell
# Run the deployment script
.\deploy-to-remote.ps1 `
  -SSHKey "C:\Users\Shubham\.ssh\ssh-key.key" `
  -RemoteHost "91.98.235.142" `
  -RemoteUser "root" `
  -RemotePath "/crm-backend"
```

Or with default parameters:
```powershell
.\deploy-to-remote.ps1
```

### 3. Manual SSH Deployment

If you prefer manual deployment:

```bash
# 1. Connect to remote server
ssh -i C:\Users\Shubham\.ssh\ssh-key.key root@91.98.235.142

# 2. Create directory
mkdir -p /crm-backend
cd /crm-backend

# 3. Upload files from your local machine (in new terminal)
scp -i C:\Users\Shubham\.ssh\ssh-key.key -r src package.json package-lock.json .env.production root@91.98.235.142:/crm-backend/

# 4. Install dependencies
npm install --production

# 5. Start the service
npm start
```

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables configured in `.env.production`
- [ ] Redis is running and accessible
- [ ] Supabase connection verified
- [ ] AWS SES / SendGrid / Mailgun credentials valid
- [ ] Database migrations completed (if needed)
- [ ] SSH key has correct permissions (chmod 600)

### During Deployment
- [ ] Files uploaded successfully
- [ ] Dependencies installed without errors
- [ ] Service starts without errors
- [ ] Health check passes

### Post-Deployment
- [ ] Service is running (`curl http://localhost:3000/health`)
- [ ] Check logs for errors: `tail -f logs/app.log`
- [ ] Test email sending
- [ ] Test Redis queue operations
- [ ] Verify database connections

## Environment Variables Required

```
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=<32+ char secret>
API_KEY_SALT=<salt for API key hashing>

SUPABASE_URL=<your supabase url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

REDIS_HOST=<redis host>
REDIS_PORT=6379
REDIS_PASSWORD=<password>

AWS_ACCESS_KEY_ID=<AWS key>
AWS_SECRET_ACCESS_KEY=<AWS secret>
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com

SENDGRID_API_KEY=<SendGrid key>
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

MAILGUN_API_KEY=<Mailgun key>
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
```

## Troubleshooting

### Service won't start
```bash
# Check logs
tail -f /crm-backend/app.log

# Check if port is in use
lsof -i :3000

# Check Redis connection
redis-cli ping
```

### Missing dependencies
```bash
# Reinstall production dependencies
cd /crm-backend
npm install --production --no-optional
```

### Database connection errors
```bash
# Verify Supabase connection
curl https://vovppxpwuuhlbkihpaky.supabase.co/rest/v1/

# Check JWT secret
echo $JWT_SECRET
```

### Email sending issues
- Verify API keys are correct
- Check rate limits haven't been exceeded
- Review provider logs (AWS SES, SendGrid, Mailgun)
- Check queue status: `redis-cli keys "*:queue*"`

## Using Systemd for Auto-Start (Linux)

### 1. Create service file
```bash
sudo tee /etc/systemd/system/crm-backend.service > /dev/null <<EOF
[Unit]
Description=CRM Backend Service
After=network.target redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/crm-backend
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=append:/crm-backend/logs/app.log
StandardError=append:/crm-backend/logs/app.log
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF
```

### 2. Enable and start
```bash
sudo systemctl daemon-reload
sudo systemctl enable crm-backend
sudo systemctl start crm-backend
```

### 3. Check status
```bash
sudo systemctl status crm-backend
sudo journalctl -u crm-backend -f
```

## Workers Deployment

### Email Worker
```bash
# Run in separate terminal/process
node src/workers/emailWorker.js
```

### Campaign Worker
```bash
# Run in separate terminal/process
node src/workers/campaignWorker.js
```

Or use PM2 for process management:
```bash
npm install -g pm2

pm2 start src/app.js --name "crm-api"
pm2 start src/workers/emailWorker.js --name "email-worker"
pm2 start src/workers/campaignWorker.js --name "campaign-worker"

pm2 save
pm2 startup
```

## Docker Deployment (Alternative)

```bash
# Build image
docker build -t crm-backend:latest .

# Run container
docker run -d \
  --name crm-backend \
  -p 3000:3000 \
  --env-file .env.production \
  crm-backend:latest
```

## Rollback Procedure

If deployment fails:

```bash
# List backups
ls -la /crm-backend.backup.*

# Restore from backup
rm -rf /crm-backend
mv /crm-backend.backup.YYYYMMDD_HHMMSS /crm-backend

# Restart service
cd /crm-backend
npm install --production
npm start
```

## Monitoring & Health Checks

```bash
# Health check endpoint
curl http://localhost:3000/health

# Monitor queue
redis-cli
> KEYS "*:queue*"
> LLEN "bull:email-queue:active"

# Monitor logs
tail -f /crm-backend/app.log
```

## Performance Tips

1. **Enable compression** in nginx reverse proxy
2. **Use Redis Cluster** for high throughput
3. **Configure rate limiting** appropriately
4. **Monitor queue depth** - scale workers as needed
5. **Use CDN** for attachments
6. **Enable caching** for repeated queries

## Support

For issues or questions, check:
- Application logs: `/crm-backend/app.log`
- Redis status: `redis-cli info`
- System logs: `sudo journalctl -xe`
- Provider dashboards for API key issues
