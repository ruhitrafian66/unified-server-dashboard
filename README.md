# Unified Server Dashboard

A Progressive Web App (PWA) dashboard for managing media server infrastructure: qBittorrent torrents, Plex media library, TV-show automation, system resources, and Docker status — all in one unified interface.

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

# Install all workspace dependencies (npm workspaces handles frontend + backend)
npm install

# Build the frontend
npm run build
```

### Deployment (GitHub Actions CI/CD)

The deployment is fully automated with **GitHub Actions** and is **pull-based**, so it
works even though this server is LAN-only (SSH/remote ports not exposed to the internet).

On every push to `master`, CI builds the frontend and validates the backend. When CI is
green, the `release` job advances a rolling `deploy-ready` tag and publishes a GitHub
Release. On the server, a systemd timer polls that tag (via outbound `git fetch`) and
redeploys only when it moves — **no inbound ports or SSH from GitHub are required**.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full guide.

**One-time server setup:**

```bash
sudo mkdir -p /opt/dashboard
sudo chown -R $USER /opt/dashboard
git clone <repo-url> /opt/dashboard
cd /opt/dashboard
cp backend/.env.example backend/.env   # fill in real credentials
mkdir -p /opt/dashboard/data

# Enable the pull-based deploy timer (see DEPLOYMENT.md)
sudo cp scripts/dashboard-deploy.service /etc/systemd/system/
sudo cp scripts/dashboard-deploy.timer  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dashboard-deploy.timer
```

Then just **push to `master`** — the server picks up green builds automatically
(or trigger **Actions -> CI/CD -> Run workflow** manually).

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
