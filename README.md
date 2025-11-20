# Unified Server Dashboard

A Progressive Web App (PWA) that combines qBittorrent, WireGuard, and OpenMediaVault management into a single interface.

## Features

- **qBittorrent Remote**: Manage torrents, add new downloads, pause/resume/delete torrents
- **WireGuard VPN**: Configure and monitor VPN connections, manage peers
- **OpenMediaVault**: Monitor system resources, control services, manage power
- **PWA Support**: Install on iOS and Android devices for native-like experience

## Architecture

- **Frontend**: React + Vite with PWA support
- **Backend**: Node.js + Express API server
- **Communication**: REST API with local network connectivity

## Installation

### Development (Local Machine - macOS)

```bash
# Install all dependencies
npm run install:all

# Start development servers (frontend + backend)
npm run dev
```

### Production (Debian Server)

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete server setup instructions.

Quick start:
```bash
# On Debian server
cd /opt/server-dashboard/backend
npm install
npm start
```

## Usage

1. Start the backend server on your Linux server (port 3001)
2. Access the frontend at http://localhost:3000
3. Configure server URL in Settings
4. Connect to qBittorrent, WireGuard, and OMV services

## Server Requirements

- Linux server with:
  - WireGuard installed
  - qBittorrent with Web UI enabled
  - OpenMediaVault (optional)
  - Node.js 18+

## PWA Installation

### iOS
1. Open in Safari
2. Tap Share button
3. Select "Add to Home Screen"

### Android
1. Open in Chrome
2. Tap menu (three dots)
3. Select "Install app" or "Add to Home Screen"

## API Endpoints

### qBittorrent
- POST `/api/qbittorrent/login` - Authenticate
- POST `/api/qbittorrent/torrents` - Get torrent list
- POST `/api/qbittorrent/torrents/add` - Add torrent
- POST `/api/qbittorrent/torrents/:action` - Control torrents

### WireGuard
- GET `/api/wireguard/interfaces` - List interfaces
- GET `/api/wireguard/status/:interface` - Get status
- POST `/api/wireguard/interface/:action` - Start/stop interface
- GET `/api/wireguard/peers/:interface` - List peers

### OMV
- GET `/api/omv/system` - System information
- GET `/api/omv/services` - Service status
- GET `/api/omv/disks` - Disk usage
- POST `/api/omv/power/:action` - Power control

## Security Notes

- Backend should run on trusted local network only
- Use HTTPS in production
- Configure firewall rules appropriately
- Backend requires sudo privileges for some operations

## License

MIT
