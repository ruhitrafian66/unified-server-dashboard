# Deployment Complete! 🎉

## Orange Pi Server Information
- **Server IP**: 192.168.0.30
- **Hostname**: orangepi3b
- **Backend Port**: 3001
- **Platform**: Debian Linux (ARM64)
- **Node.js**: v18.20.4

## Access URLs

### Web Dashboard
Open in your browser (on same network):
```
http://192.168.0.30:3001
```

### API Health Check
```bash
curl http://192.168.0.30:3001/api/health
```

### SSH Access
```bash
ssh orangepi
```

## Service Management

### Check Status
```bash
ssh orangepi 'systemctl status server-dashboard'
```

### View Logs
```bash
ssh orangepi 'journalctl -u server-dashboard -f'
```

### Restart Service
```bash
ssh orangepi 'systemctl restart server-dashboard'
```

### Stop Service
```bash
ssh orangepi 'systemctl stop server-dashboard'
```

## Features Available

1. **qBittorrent Management**
   - Login to your qBittorrent server
   - View, add, pause, resume, delete torrents
   - Monitor download progress

2. **WireGuard VPN**
   - View VPN interfaces
   - Start/stop VPN connections
   - Monitor peers and status

3. **OpenMediaVault**
   - System monitoring (CPU, memory, disk)
   - Service status
   - Power control (reboot/shutdown)

## Mobile Access (PWA)

### iOS
1. Open Safari and go to `http://192.168.0.30:3001`
2. Tap the Share button
3. Select "Add to Home Screen"
4. The app will install like a native app

### Android
1. Open Chrome and go to `http://192.168.0.30:3001`
2. Tap the menu (three dots)
3. Select "Install app" or "Add to Home Screen"

## Configuration

### qBittorrent Setup
1. Go to Settings in the dashboard
2. Configure your qBittorrent server URL (e.g., `http://192.168.0.30:8080`)
3. Login with your qBittorrent credentials

### WireGuard Setup
- WireGuard commands run directly on the server
- Ensure WireGuard is installed: `ssh orangepi 'apt install wireguard'`

### OMV Setup
- System commands run directly on the server
- No additional configuration needed

## File Locations

- **Application**: `/opt/server-dashboard/`
- **Backend**: `/opt/server-dashboard/backend/`
- **Frontend**: `/opt/server-dashboard/frontend-dist/`
- **Service File**: `/etc/systemd/system/server-dashboard.service`
- **Sudo Config**: `/etc/sudoers.d/server-dashboard`

## Next Steps

1. **Install qBittorrent** (if not already installed):
   ```bash
   ssh orangepi 'apt install -y qbittorrent-nox'
   ```

2. **Install WireGuard** (if not already installed):
   ```bash
   ssh orangepi 'apt install -y wireguard wireguard-tools'
   ```

3. **Configure Firewall** (optional):
   ```bash
   ssh orangepi 'ufw allow 3001/tcp'
   ```

4. **Access the Dashboard**:
   - Open `http://192.168.0.30:3001` in your browser
   - Install as PWA on your mobile device

## Troubleshooting

### Service won't start
```bash
ssh orangepi 'journalctl -u server-dashboard -n 50'
```

### Port already in use
```bash
ssh orangepi 'lsof -i :3001'
```

### Restart after changes
```bash
ssh orangepi 'systemctl restart server-dashboard'
```

## Security Notes

⚠️ **Important**: This dashboard runs with root privileges to manage system services. Only use on trusted local networks.

- Consider setting up HTTPS with nginx reverse proxy
- Use firewall rules to restrict access
- Access through VPN when remote
- Change default passwords for all services

## Recent Updates

### qBittorrent Docker Migration ✅
**Date**: December 8, 2025  
**Change**: qBittorrent has been migrated from native installation to Docker container.

**Container Details**:
- Image: `lscr.io/linuxserver/qbittorrent:latest`
- Version: v5.1.4
- Network Mode: host
- WebUI: http://localhost:8080
- Default Credentials: admin / adminadmin

**Configuration**:
- The backend automatically connects to qBittorrent on localhost:8080
- Authentication uses default credentials (can be changed via environment variables)
- All existing features work with the Docker version

**Installed Search Plugins** (7 plugins):
✅ **The Pirate Bay** - Movies, Music, Games, Software  
✅ **LimeTorrents** - Movies, TV Shows, Music, Games, Anime, Software  
✅ **TorLock** - Movies, TV Shows, Music, Games, Anime, Books, Software  
✅ **EZTV** - TV Shows  
✅ **Solid Torrents** - Books, Music  
✅ **torrents-csv** - All categories  
✅ **Jackett** - All categories (requires Jackett server configuration)

The search functionality is now fully operational and can search across all installed plugins simultaneously!

### Search Timeout Issue - RESOLVED ✅
**Date**: December 2, 2025  
**Issue**: Search Torrent feature would work initially but return "Search timed out" after periods of inactivity.

**Root Cause**: The `/search/start` endpoint was not using authenticated requests. When qBittorrent sessions expired (after ~15 minutes), the search would fail silently and return invalid search IDs.

**Solution Implemented**:
1. Updated `search/start` endpoint to use `makeAuthenticatedRequest` helper
2. Updated `search/stop` endpoint to use `makeAuthenticatedRequest` helper
3. Fixed `makeAuthenticatedRequest` to include proper `Content-Type` header
4. All search operations now automatically re-authenticate when sessions expire

**Testing**: Verified that search works correctly even after service restarts and session expiry.

## Update Deployment

To update the dashboard:
```bash
# From your local machine
cd ~/Unified\ Server\ Dashboard
tar --exclude='node_modules' --exclude='dist' --exclude='.git' -czf deploy.tar.gz backend/ frontend/ server-dashboard.service package.json
scp deploy.tar.gz orangepi:/tmp/
ssh orangepi 'cd /opt/server-dashboard && tar -xzf /tmp/deploy.tar.gz && cd frontend && npm install && npm run build && cp -r dist/* ../frontend-dist/ && systemctl restart server-dashboard'
```

Enjoy your unified server dashboard with dark theme! 🚀
