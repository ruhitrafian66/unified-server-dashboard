# Unified Server Dashboard

A Progressive Web App (PWA) dashboard for managing media server infrastructure: qBittorrent torrents, Plex media library, system resources, and VPN status — all in one unified interface.

## Features

- **qBittorrent Management**: Search, add, pause/resume/delete torrents with real-time status
- **Plex Integration**: Monitor media library status and server uptime
- **System Monitoring**: Real-time CPU usage history with 6h/12h/24h/2d/4d range views
- **Docker Status**: View container health and resource usage
- **Torrent Search**: Built-in search with plugin support
- **PWA Support**: Install on iOS and Android for native-like experience
- **Responsive Design**: Mobile-first UI, works on phones/tablets/desktop

## Quick Start

### Requirements

- Linux server with Docker and Docker Compose
- Node.js 18+
- Existing services: Gluetun (VPN), qBittorrent, Plex

### Installation

```bash
# Clone repository
git clone <repo-url>
cd "Unified Server Dashboard"

# Frontend build
cd frontend
npm install
npm run build

# Backend setup
cd ../backend
npm install
npm install dotenv  # Add dotenv if not in package.json
```

### Deployment

Copy `frontend/dist` and `backend` to your server:

```bash
rsync -az frontend/dist/ user@server:/opt/dashboard/frontend/dist/
rsync -az --exclude=node_modules backend/ user@server:/opt/dashboard/backend/
```

On the server:

```bash
cd /opt/dashboard/backend
npm install
cat > .env << EOF
NODE_ENV=production
PORT=3001
QBITTORRENT_URL=http://localhost:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=<password>
DOCKER_SOCKET_PATH=/var/run/docker.sock
ALLOWED_ORIGINS=*
EOF

# Start as systemd service
sudo systemctl start dashboard
sudo systemctl enable dashboard
```

**Systemd service file** (`/etc/systemd/system/dashboard.service`):

```ini
[Unit]
Description=Unified Server Dashboard
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/dashboard/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## API Endpoints

### qBittorrent
- `GET /api/qbittorrent/torrents` — List all torrents
- `POST /api/qbittorrent/torrents/add` — Add torrent by URL
- `POST /api/qbittorrent/torrents/add-advanced` — Add with options
- `POST /api/qbittorrent/torrents/:action` — Control (pause/resume/delete)
- `GET /api/qbittorrent/search/plugins` — List search plugins
- `POST /api/qbittorrent/search/start` — Start search
- `GET /api/qbittorrent/search/results/:id` — Get results

### System Monitoring
- `GET /api/omv/cpu-history?hours=<N>` — CPU usage history (default 6h, max 96h)

### Docker
- `GET /api/docker/containers` — List containers and status

## Architecture

- **Frontend**: React + Vite, PWA with Service Worker, Canvas-based charts
- **Backend**: Node.js + Express, lightweight circular buffer CPU sampling (60s interval, ~115KB RAM)
- **No external dependencies**: CPU chart uses pure Canvas, no charting library

## Security

- Backend runs on local network only (not exposed to internet)
- Use firewall rules to restrict access to trusted IPs
- `.env` file contains sensitive credentials — never commit to version control
- All API communication is HTTP (use reverse proxy with HTTPS if exposing externally)

## License

MIT
