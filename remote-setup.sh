#!/bin/bash

# ============================================================================
# Remote Server Setup Script for CRM Backend
# ============================================================================
# Run this on the remote server to set up the environment

REMOTE_PATH="/crm-backend"
NODE_ENV="production"

echo "=========================================="
echo "CRM Backend Remote Setup"
echo "=========================================="
echo ""

# Check if Node.js is installed
echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js version: $(node --version)"
fi

# Check if Redis is running
echo "Checking Redis..."
if ! redis-cli ping &> /dev/null; then
    echo "WARNING: Redis is not running or not accessible"
    echo "Redis should be running for the queue system"
fi

# Navigate to project directory
cd $REMOTE_PATH || exit 1

# Create .env file from .env.production if needed
if [ ! -f ".env" ] && [ -f ".env.production" ]; then
    cp .env.production .env
    echo "Created .env from .env.production"
fi

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Create logs directory
mkdir -p logs

# Setup systemd service (optional but recommended)
echo ""
echo "Setting up systemd service for auto-restart..."

sudo tee /etc/systemd/system/crm-backend.service > /dev/null <<EOF
[Unit]
Description=CRM Backend Service
After=network.target redis.service

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_PATH
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=append:$REMOTE_PATH/logs/app.log
StandardError=append:$REMOTE_PATH/logs/app.log
Environment="NODE_ENV=$NODE_ENV"

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "To start the service:"
echo "  sudo systemctl start crm-backend"
echo ""
echo "To enable auto-start on boot:"
echo "  sudo systemctl enable crm-backend"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u crm-backend -f"
echo ""
