# Deployment Complete! 🎉

## Server Information
- **Server IP**: 10.211.55.4
- **Backend Port**: 3001
- **Platform**: Debian Linux (ARM64)
- **Node.js**: v20.19.2

## Access URLs

### Web Dashboard
Open in your browser (on same network):
```
http://10.211.55.4:3001
```

### API Health Check
```bash
curl http://10.211.55.4:3001/api/health
```

## Service Management

### Check Status
```bash
ssh root@10.211.55.4 'systemctl status server-dashboard'
```

### View Logs
```bash
ssh root@10.211.55.4 'journalctl -u server-dashboard -f'
```

### Restart Service
```bash
ssh root@10.211.55.4 'systemctl restart server-dashboard'
```

### Stop Service
```bash
ssh root@10.211.55.4 'systemctl stop server-dashboard'
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
1. Open Safari and go to `http://10.211.55.4:3001`
2. Tap the Share button
3. Select "Add to Home Screen"
4. The app will install like a native app

### Android
1. Open Chrome and go to `http://10.211.55.4:3001`
2. Tap the menu (three dots)
3. Select "Install app" or "Add to Home Screen"

## Configuration

### qBittorrent Setup
1. Go to Settings in the dashboard
2. Configure your qBittorrent server URL (e.g., `http://10.211.55.4:8080`)
3. Login with your qBittorrent credentials

### WireGuard Setup
- WireGuard commands run directly on the server
- Ensure WireGuard is installed: `apt install wireguard`

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
   ssh root@10.211.55.4 'apt install -y qbittorrent-nox'
   ```

2. **Install WireGuard** (if not already installed):
   ```bash
   ssh root@10.211.55.4 'apt install -y wireguard wireguard-tools'
   ```

3. **Configure Firewall** (optional):
   ```bash
   ssh root@10.211.55.4 'ufw allow 3001/tcp'
   ```

4. **Access the Dashboard**:
   - Open `http://10.211.55.4:3001` in your browser
   - Install as PWA on your mobile device

## Troubleshooting

### Service won't start
```bash
ssh root@10.211.55.4 'journalctl -u server-dashboard -n 50'
```

### Port already in use
```bash
ssh root@10.211.55.4 'lsof -i :3001'
```

### Restart after changes
```bash
ssh root@10.211.55.4 'systemctl restart server-dashboard'
```

## Security Notes

⚠️ **Important**: This dashboard runs with root privileges to manage system services. Only use on trusted local networks.

- Consider setting up HTTPS with nginx reverse proxy
- Use firewall rules to restrict access
- Access through VPN when remote
- Change default passwords for all services

Enjoy your unified server dashboard! 🚀
