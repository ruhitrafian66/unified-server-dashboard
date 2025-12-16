#!/bin/bash

# Simple deployment script - builds on server
SERVER="orangepi"
REMOTE_PATH="/opt/server-dashboard"

echo "Creating directory on server..."
ssh $SERVER "mkdir -p $REMOTE_PATH"

echo "Copying files to server..."
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  backend/ $SERVER:$REMOTE_PATH/backend/

rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  frontend/ $SERVER:$REMOTE_PATH/frontend/

echo "Copying configuration files..."
scp server-dashboard.service $SERVER:/etc/systemd/system/
scp package.json $SERVER:$REMOTE_PATH/

echo "Installing and building on server..."
ssh $SERVER << 'EOF'
cd /opt/server-dashboard/backend
npm install --production

cd /opt/server-dashboard/frontend
npm install
npm run build

# Move build to frontend-dist
mkdir -p /opt/server-dashboard/frontend-dist
cp -r dist/* /opt/server-dashboard/frontend-dist/

# Update systemd service
systemctl daemon-reload
systemctl enable server-dashboard
systemctl restart server-dashboard

echo ""
echo "Deployment complete!"
echo "Checking service status..."
systemctl status server-dashboard --no-pager
EOF

echo ""
echo "Dashboard should be accessible at: http://orangepi:3001"
