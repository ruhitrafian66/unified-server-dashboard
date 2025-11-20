# Deployment Guide for Debian Server

## Server Setup

### 1. Install Node.js on Debian Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Install Required Services

```bash
# Install WireGuard
sudo apt install -y wireguard wireguard-tools

# Install qBittorrent-nox (headless)
sudo apt install -y qbittorrent-nox

# OpenMediaVault (if not already installed)
# Follow: https://www.openmediavault.org/
```

### 3. Deploy Backend to Server

```bash
# On your Debian server, create app directory
sudo mkdir -p /opt/server-dashboard
sudo chown $USER:$USER /opt/server-dashboard
cd /opt/server-dashboard

# Copy backend files to server (from your dev machine)
# Use scp, rsync, or git clone
scp -r backend/ user@your-server:/opt/server-dashboard/

# Or clone from git
git clone <your-repo> /opt/server-dashboard
cd /opt/server-dashboard/backend

# Install dependencies
npm install

# Create environment file
cat > .env << EOF
PORT=3001
NODE_ENV=production
EOF
```

### 4. Configure Permissions

The backend needs sudo access for system commands:

```bash
# Create sudoers file for the app
sudo visudo -f /etc/sudoers.d/server-dashboard

# Add these lines (replace 'youruser' with actual username):
youruser ALL=(ALL) NOPASSWD: /usr/bin/wg
youruser ALL=(ALL) NOPASSWD: /usr/bin/wg-quick
youruser ALL=(ALL) NOPASSWD: /usr/sbin/reboot
youruser ALL=(ALL) NOPASSWD: /usr/sbin/shutdown
youruser ALL=(ALL) NOPASSWD: /usr/bin/systemctl
```

### 5. Setup Systemd Service

```bash
# Copy the service file
sudo cp /opt/server-dashboard/server-dashboard.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable server-dashboard
sudo systemctl start server-dashboard

# Check status
sudo systemctl status server-dashboard
```

### 6. Configure Firewall

```bash
# Allow backend port
sudo ufw allow 3001/tcp

# Or if using iptables
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### 7. Configure qBittorrent Web UI

```bash
# Start qBittorrent-nox first time
qbittorrent-nox

# Default credentials:
# Username: admin
# Password: adminadmin
# Web UI: http://localhost:8080

# Change password in settings!
```

## Frontend Deployment

### Option 1: Build and Serve Locally

```bash
# On your dev machine
cd frontend
npm run build

# Copy dist folder to server
scp -r dist/ user@your-server:/opt/server-dashboard/frontend-dist/

# Serve with nginx or serve static from backend
```

### Option 2: Host on Vercel/Netlify

The frontend can be hosted anywhere since it connects to your server's IP:

```bash
cd frontend
npm run build

# Deploy to Vercel
vercel deploy

# Or Netlify
netlify deploy --prod
```

### Option 3: Serve from Backend

Add static file serving to backend/server.js (already configured).

## Access the Dashboard

1. **From local network**: 
   - Frontend: `http://your-server-ip:3000`
   - Backend: `http://your-server-ip:3001`

2. **From mobile device**:
   - Connect to same WiFi network
   - Open browser to `http://your-server-ip:3000`
   - Install as PWA

3. **Configure in Settings**:
   - Set backend URL to `http://your-server-ip:3001`
   - Set qBittorrent URL to `http://your-server-ip:8080`

## Troubleshooting

### Check logs
```bash
sudo journalctl -u server-dashboard -f
```

### Test API manually
```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/wireguard/interfaces
```

### Restart service
```bash
sudo systemctl restart server-dashboard
```

## Security Recommendations

1. **Use HTTPS**: Setup nginx reverse proxy with Let's Encrypt
2. **Firewall**: Only allow access from local network
3. **Authentication**: Add authentication middleware to backend
4. **VPN Access**: Access dashboard through WireGuard VPN when remote

## Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name dashboard.local;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```
