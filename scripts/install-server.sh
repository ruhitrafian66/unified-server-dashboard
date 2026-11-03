#!/usr/bin/env bash
#
# Unified Server Dashboard — one-shot server bootstrap/install script
#
# Run this ON THE TARGET SERVER (the LAN-only media server) to set up the
# pull-based deployment: it installs the backend systemd service, the deploy
# timer that polls GitHub for new green builds, and prepares the runtime dirs.
#
# Requires the repo to be cloned to /opt/server-dashboard (or set DASHBOARD_DIR).
#
# Usage (as root, or via sudo):
#   bash /opt/server-dashboard/scripts/install-server.sh
#
# Idempotent: safe to re-run to repair the install.
#
set -euo pipefail

# Shell is only for reference. When run interactively as root, adjust if needed.
REPO_DIR="${DASHBOARD_DIR:-/opt/server-dashboard}"
SERVICE="${DASHBOARD_SERVICE:-dashboard}"
DEPLOY_SERVICE="${DASHBOARD_DEPLOY_SERVICE:-dashboard-deploy}"
DEPLOY_TIMER="${DASHBOARD_DEPLOY_TIMER:-dashboard-deploy}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

log()  { printf '[install] %s\n' "$*"; }
die()  { printf '[install] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo $0)"

# ─── 1. Repo checkout ─────────────────────────────────────────────────────────
if [ ! -d "${REPO_DIR}/.git" ]; then
  log "No checkout at ${REPO_DIR}. Cloning..."
  mkdir -p "${REPO_DIR}"
  git clone https://github.com/ruhitrafian66/unified-server-dashboard.git "${REPO_DIR}"
fi

# ─── 2. Runtime directories ───────────────────────────────────────────────────
# The backend reads/writes TV-automation data from ${REPO_DIR}/data by default
# (see backend/routes/shows.js DATA_DIR). Keep that location so existing data is
# preserved across deploys. Plex/archival runtime dirs live under backend/data.
DATA_DIR="${DATA_DIR:-${REPO_DIR}/data}"
mkdir -p "${DATA_DIR}" "${REPO_DIR}/backend/data" || true
log "Data dir: ${DATA_DIR}"

# ─── 3. .env from example (never overwrite an existing .env) ─────────────────
ENV_SRC="${REPO_DIR}/backend/.env.example"
ENV_DST="${REPO_DIR}/backend/.env"
if [ ! -f "${ENV_DST}" ] && [ -f "${ENV_SRC}" ]; then
  cp "${ENV_SRC}" "${ENV_DST}"
  chmod 600 "${ENV_DST}"
  log "Created ${ENV_DST} from example — EDIT IT with real credentials."
else
  log "Leaving existing ${ENV_DST} untouched."
fi

# ─── 4. Backend service unit ──────────────────────────────────────────────────
log "Installing ${SERVICE}.service..."
cp "${REPO_DIR}/scripts/dashboard.service" "/etc/systemd/system/${SERVICE}.service"
# Fix the WorkingDirectory, ExecStart, and any placeholder paths to match REPO_DIR.
sed -i "s|/opt/server-dashboard|${REPO_DIR}|g" "/etc/systemd/system/${SERVICE}.service"

# ─── 5. Deploy oneshot + timer units ─────────────────────────────────────────
log "Installing ${DEPLOY_SERVICE}.service + ${DEPLOY_TIMER}.timer..."
cp "${REPO_DIR}/scripts/dashboard-deploy.service" "/etc/systemd/system/${DEPLOY_SERVICE}.service"
cp "${REPO_DIR}/scripts/dashboard-deploy.timer"  "/etc/systemd/system/${DEPLOY_TIMER}.timer"
# Point the deploy service's ExecStart at this checkout.
sed -i "s|/opt/server-dashboard|${REPO_DIR}|g" "/etc/systemd/system/${DEPLOY_SERVICE}.service"
sed -i "s|Unit=dashboard-deploy.service|Unit=${DEPLOY_SERVICE}.service|" \
  "/etc/systemd/system/${DEPLOY_TIMER}.timer"

# ─── 6. Reload and enable ─────────────────────────────────────────────────────
log "Reloading systemd..."
systemctl daemon-reload

log "Enabling ${SERVICE}.service..."
systemctl enable --now "${SERVICE}" || die "could not start ${SERVICE}"

log "Enabling ${DEPLOY_SERVICE}.service + ${DEPLOY_TIMER}.timer..."
systemctl enable --now "${DEPLOY_TIMER}"

# ─── 7. First deploy check ────────────────────────────────────────────────────
log "Running an initial deploy check..."
if systemctl start "${DEPLOY_SERVICE}"; then
  log "Deploy check ran."
else
  log "Initial deploy check failed (likely no deploy-ready tag yet). OK."
fi

log ""
log "Install complete. Next:"
log "  1. Edit credentials:  nano ${ENV_DST}"
log "  2. Restart backend:   systemctl restart ${SERVICE}"
log "  3. Watch deploy log:  journalctl -u ${DEPLOY_SERVICE} -f"
log "  4. Check timer:       systemctl status ${DEPLOY_TIMER}"
