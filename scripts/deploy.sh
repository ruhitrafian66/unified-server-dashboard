#!/usr/bin/env bash
#
# Unified Server Dashboard — server-side deploy script
#
# This script is meant to run ON THE TARGET SERVER (typically invoked remotely
# by the GitHub Actions deploy workflow, but it can also be run locally on the
# server for a manual deploy). It:
#   1. Pulls the latest code from the configured Git remote
#   2. Installs dependencies (using the committed package-lock.json)
#   3. Builds the frontend into frontend/dist
#   4. Restarts the systemd service so the backend serves the new build
#
# Usage:
#   scripts/deploy.sh [--repo-dir PATH] [--service NAME] [--branch NAME]
#
# Environment overrides (also used by the GitHub Actions workflow):
#   DASHBOARD_DIR     Absolute path to the deployed checkout on the server.
#                     Default: /opt/dashboard
#   DASHBOARD_SERVICE systemd unit name for the backend.
#                     Default: dashboard
#   DASHBOARD_BRANCH  Branch to pull. Default: master
#
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
REPO_DIR="${DASHBOARD_DIR:-/opt/dashboard}"
SERVICE="${DASHBOARD_SERVICE:-dashboard}"
BRANCH="${DASHBOARD_BRANCH:-master}"

log()  { printf '[deploy] %s\n' "$*"; }
die()  { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# ─── Preflight: dependencies present? ────────────────────────────────────────
command -v git  >/dev/null || die "git not found"
command -v npm  >/dev/null || die "npm not found"
command -v node >/dev/null || die "node not found"

log "Deploying '${REPO_DIR}' on branch '${BRANCH}'"

# ─── 1. Ensure the checkout exists ──────────────────────────────────────────
if [ ! -d "${REPO_DIR}/.git" ]; then
  log "No checkout found at ${REPO_DIR}; nothing to pull (expected on first bootstrap)."
  die "No git checkout at ${REPO_DIR}. Clone the repo there first, then re-run this script."
fi

# ─── 2. Pull latest code ───────────────────────────────────────────────────
log "Pulling latest '${BRANCH}'..."
git -C "${REPO_DIR}" fetch --prune origin
if git -C "${REPO_DIR}" rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  git -C "${REPO_DIR}" checkout "${BRANCH}"
  # reset --hard is the standard safe deploy behaviour: it aligns the working
  # tree with the remote. Untracked-but-ignored runtime files (e.g. backend/.env)
  # are NOT touched, so secrets persist across deploys.
  git -C "${REPO_DIR}" reset --hard "origin/${BRANCH}"
else
  die "Branch origin/${BRANCH} not found on remote."
fi

# ─── 3. Install dependencies (deterministic via lockfile) ───────────────────
log "Installing dependencies..."
cd "${REPO_DIR}"
npm ci --no-audit --no-fund

# ─── 4. Build the frontend into frontend/dist ───────────────────────────────
log "Building frontend..."
npm run build

# ─── 5. Restart the backend service ─────────────────────────────────────────
if command -v systemctl >/dev/null 2>&1; then
  log "Restarting systemd service '${SERVICE}'..."
  systemctl restart "${SERVICE}" || die "systemctl restart ${SERVICE} failed"
  log "Service '${SERVICE}' restarted."
else
  log "systemctl not available; skipping service restart."
fi

log "Deploy complete."
