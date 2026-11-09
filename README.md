# Unified Server Dashboard

A Progressive Web App (PWA) dashboard for managing media server infrastructure: qBittorrent torrents, Plex media library, TV-show automation, system resources, and Docker status — all in one unified interface.

## Features

- **Storage**: media library built from the download folder (files and folders shown as clean movie/TV entries), duplicate and partial detection, junk cleanup, delete
- **Downloads bar**: sticky progress bar while torrents download, auto-scrolling between several
- **qBittorrent**: torrent search (Media › Torrents), add, stop/start/remove
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

**One-time server setup** — run the bundled installer on the server (root required,
idempotent). It clones the repo if needed, creates `backend/.env` from the example
without overwriting, sets up `data/`, installs the backend `dashboard.service` and the
deploy timer, and enables everything:

```bash
# From the server, with the repo checked out (e.g. /opt/server-dashboard):
sudo bash /opt/server-dashboard/scripts/install-server.sh
# ...then edit /opt/server-dashboard/backend/.env with real credentials and restart:
sudo systemctl restart dashboard
```

Then just **push to `master`** — the server picks up green builds automatically
(or trigger **Actions -> CI/CD -> Run workflow** manually). See **DEPLOYMENT.md**
for the manual equivalent of each step and for rollback guidance.

The backend unit lives in [`scripts/dashboard.service`](scripts/dashboard.service).

## How it fits together on the server

```
LAN device ──HTTP:3001──▶ dashboard (Node, systemd, /opt/server-dashboard)
                             ├─▶ qBittorrent WebUI  localhost:8080 ─┐ (docker-proxy)
                             ├─▶ docker CLI / systemctl / /proc     │
                             └─▶ TMDB (HTTPS)                       ▼
                                              gluetun container (WireGuard, kill-switch)
                                                └─ qbittorrent shares its network namespace (tun0)
                             plex container: host network, :32400
```

The media stack itself (gluetun, qbittorrent, plex) is managed separately from
`/opt/media-stack/docker-compose.yml`; [`docker-compose.yml`](docker-compose.yml)
in this repo is a reference copy with secrets moved to `.env.docker`.

## API Endpoints

All write requests (`POST`/`PUT`/`DELETE`) must send `X-Requested-With: dashboard`
(CSRF protection; the bundled UI does this automatically).

### System — `/api/system` (alias `/api/omv`)
- `GET /overview` — CPU, memory, load, temperature, disks, services, containers, torrent client, build info (one call; partial failures listed in `errors`)
- `GET /cpu-history?hours=<1-96>` — per-minute CPU history
- `POST /power/reboot` · `POST /power/shutdown`

### qBittorrent — `/api/qbittorrent`
- `GET /torrents` · `GET /transfer`
- `POST /torrents/add` — `{ urls, savepath? }` (sequential + first/last piece always on)
- `POST /torrents/:action` — `pause|resume|delete|recheck|reannounce`, `{ hashes, deleteFiles? }`
- `GET /search/plugins` · `POST /search/start` · `GET /search/status/:id` · `GET /search/results/:id` · `POST /search/stop` · `GET|DELETE /search/logs`
- `GET|POST /auto-stop/config` — seeding limits, stored in qBittorrent's own preferences

### TV automation — `/api/shows`
- `GET /` · `POST /` (`{ tmdbId }`) · `PUT /:id` · `DELETE /:id`
- `POST /check` (background) · `GET /check/status`
- `POST /download-season` · `POST /:id/season/:season` · `GET /download-progress/:sessionId`
- `GET /queue/status` · `POST /queue/clear`
- `GET|POST /config/tmdb` · `GET|POST /config/auto-check`

### Media library — `/api/library`
- `GET /` — scan of `LIBRARY_PATH` (default `/mnt/storage/Server`): one item per movie/show/folder with parsed title, year, seasons, quality, size, poster, matching torrent, duplicate/partial flags, plus reclaimable junk (`?refresh=1` bypasses the 30 s cache)
- `GET /items/:id` — full detail (episodes per season, extras, main file)
- `DELETE /items/:id` — delete a media item (and its torrent); non-media folders are refused
- `POST /cleanup` — remove junk (macOS/Windows metadata, empty folders, orphaned `.parts`)

### TMDB proxy — `/api/tmdb/*`
Read-only allow-listed TMDB paths (trending, search, details); the server adds its API key.

### Health
- `GET /api/health` — status, running commit, uptime

## Architecture

- **Frontend**: React + Vite PWA. Polling pauses while the app is in the background.
- **Backend**: Node.js + Express. Reads `/proc`, `/sys` and `statfs` directly (no `top`/`df` subprocesses).
- **Data**: `DATA_DIR/shows.json` and `DATA_DIR/config.json`, written atomically and serialised (no lost updates, no wipe on a corrupt file).
- **TV automation**: timer at each episode's air time + a 6-hourly sweep (also catches anything missed while the server was down). Aired-but-not-found episodes are retried for 7 days, then flagged as missed instead of silently skipped. Malware-looking release names are rejected.

## Security

- Backend runs on local network only (not exposed to internet); there is no login, so anyone on the LAN can use it
- Cross-site requests are blocked (custom-header CSRF check, no CORS unless `ALLOWED_ORIGINS` is set)
- Use firewall rules to restrict access to trusted IPs
- `.env` file contains sensitive credentials — never commit to version control
- All API communication is HTTP (use reverse proxy with HTTPS if exposing externally)

## License

MIT
