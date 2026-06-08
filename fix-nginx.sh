#!/bin/bash
# Add /crm-backend/ location to nginx config for primeosys.com

CONFIG="/etc/nginx/sites-enabled/primeosys.com"

# Find the line number of "location /backend/"
LINE=$(grep -n "location /backend/" "$CONFIG" | head -1 | cut -d: -f1)

if [ -z "$LINE" ]; then
    echo "ERROR: Could not find 'location /backend/' in config"
    exit 1
fi

# Insert the crm-backend location block before /backend/
sed -i "${LINE}i\\
    location /crm-backend/ {\\
        proxy_pass http://127.0.0.1:3001/;\\
        proxy_http_version 1.1;\\
        proxy_set_header Host \$host;\\
        proxy_set_header X-Real-IP \$remote_addr;\\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto \$scheme;\\
        proxy_set_header X-Forwarded-Host \$host;\\
        proxy_pass_header Access-Control-Allow-Origin;\\
        proxy_pass_header Access-Control-Allow-Credentials;\\
        proxy_pass_header Access-Control-Allow-Methods;\\
        proxy_pass_header Access-Control-Allow-Headers;\\
        proxy_pass_header Access-Control-Expose-Headers;\\
        proxy_pass_header Access-Control-Max-Age;\\
    }\\
" "$CONFIG"

# Test nginx config
nginx -t
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo "SUCCESS: nginx reloaded with /crm-backend/ route"
else
    echo "ERROR: nginx config test failed"
    exit 1
fi
