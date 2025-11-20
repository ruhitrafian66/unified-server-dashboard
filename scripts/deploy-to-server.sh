#!/bin/bash

# Deployment script for Debian server
# Usage: ./scripts/deploy-to-server.sh user@server-ip

if [ -z "$1" ]; then
    echo "Usage: $0 user@server-ip"
    exit 1
fi

SERVER=$1
REMOTE_PATH="/opt/server-dashboard"

echo "Building frontend..."
cd frontend
npm run build
cd ..

echo "Deploying to $SERVER..."

# Create directory on server
ssh $SERVER "sudo mkdir -p $REMOTE_PATH && sudo chown \$USER:\$USER $REMOTE_PATH"

# Copy backend
echo "Copying backend..."
rsync -avz --exclude 'node_modules' backend/ $SERVER:$REMOTE_PATH/backend/

# Copy frontend build
echo "Copying frontend build..."
rsync -avz frontend/dist/ $SERVER:$REMOTE_PATH/frontend-dist/

# Copy service file
echo "Copying systemd service..."
scp server-dashboard.service $SERVER:/tmp/
ssh $SERVER "sudo mv /tmp/server-dashboard.service /etc/systemd/system/"

# Install dependencies and restart
echo "Installing dependencies and restarting service..."
ssh $SERVER << 'EOF'
cd /opt/server-dashboard/backend
npm install --production
sudo systemctl daemon-reload
sudo systemctl restart server-dashboard
sudo systemctl status server-dashboard
EOF

echo "Deployment complete!"
echo "Access dashboard at: http://$SERVER:3001"
