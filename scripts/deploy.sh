#!/usr/bin/env bash
#
# Unified Server Dashboard — pull-based deploy script
#
# This script runs ON THE TARGET SERVER and is intended to be driven by a
# systemd timer (see scripts/dashboard-deploy.timer) or a cron entry. Because
# the server is LAN-only and its SSH port is NOT exposed to the internet, it
# does NOT wait for GitHub to push anything. Instead it POLLS GitHub using an
# outbound `git fetch` for a rolling "deploy-ready" tag, and redeploys only
# when that tag (the last build that passed CI) has moved.
#
# No inbound ports are opened — only normal outbound HTTPS to GitHub.
#
# Environment overrides (all optional, sensible defaults provided):
#   DASHBOARD_DIR       Absolute path to the deployed checkout on the server.
#                       Default: /opt/dashboard
#   DASHBOARD_SERVICE   systemd unit name for the backend.
#                       Default: dashboard
#   DASHBOARD_BRANCH    Branch to deploy. Default: master
#   DASHBOARD_TAG       Rolling tag that the release job marks as deploy-ready.
#                       Default: deploy-ready
#   DEPLOYED_SHA_FILE   File used to remember the last-deployed commit.
#                       Default: ${DASHBOARD_DIR}/.deploy-sha
#
# Exit codes:
#   0  deployed, or nothing to do (tag unchanged)
#   1  fatal error
#
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
REPO_DIR="${DASHBOARD_DIR:-/opt/dashboard}"
SERVICE="${DASHBOARD_SERVICE:-dashboard}"
BRANCH="${DASHBOARD_BRANCH:-master}"
DEPLOY_TAG="${DASHBOARD_TAG:-deploy-ready}"
SHA_FILE="${DEPLOYED_SHA_FILE:-${REPO_DIR}/.deploy-sha}"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# ─── Preflight ───────────────────────────────────────────────────────────────
command -v git  >/dev/null || die "git not found"
command -v npm  >/dev/null || die "npm not found"
command -v node >/dev/null || die "node not found"

# ─── Ensure the checkout exists ──────────────────────────────────────────────
if [ ! -d "${REPO_DIR}/.git" ]; then
  die "No git checkout at ${REPO_DIR}. Clone the repo there first (see DEPLOYMENT.md)."
fi

# ─── Fetch the latest state (outbound to GitHub only) ────────────────────────
log "Fetching origin '${BRANCH}' and tag '${DEPLOY_TAG}'..."
git -C "${REPO_DIR}" fetch --prune origin "${BRANCH}" "${DEPLOY_TAG}" \
  || die "git fetch failed"

# The commit the deploy-ready tag points at (i.e. the last green build).
if ! TARGET_SHA="$(git -C "${REPO_DIR}" rev-parse --verify --quiet \
      "refs/tags/${DEPLOY_TAG}^{commit}")"; then
  log "No deploy-ready tag found yet (nothing to deploy)."
  exit 0
fi

# ─── No-op if the tag hasn't moved since the last deploy ────────────────────
LAST_SHA="$(cat "${SHA_FILE}" 2>/dev/null || true)"
if [ "${TARGET_SHA}" = "${LAST_SHA}" ]; then
  log "Already at ${TARGET_SHA:0:12}; nothing to do."
  exit 0
fi

log "New deploy-ready build detected: ${TARGET_SHA:0:12}"

# ─── Align the working tree with the green build ─────────────────────────────
log "Checking out the deploy-ready build..."
git -C "${REPO_DIR}" reset --hard "${TARGET_SHA}"
# Untracked-but-ignored runtime files (e.g. backend/.env) are NOT touched,
# so secrets persist across deploys.

# ─── Install dependencies (deterministic via committed lockfile) ─────────────
log "Installing dependencies..."
cd "${REPO_DIR}"
npm ci --no-audit --no-fund

# ─── Build the frontend into frontend/dist ───────────────────────────────────
log "Building frontend..."
npm run build

# ─── Restart the backend service ─────────────────────────────────────────────
if command -v systemctl >/dev/null 2>&1; then
  log "Restarting systemd service '${SERVICE}'..."
  systemctl restart "${SERVICE}" || die "systemctl restart ${SERVICE} failed"
  log "Service '${SERVICE}' restarted."
else
  log "systemctl not available; skipping service restart."
fi

# ─── Record the deployed SHA so we don't redeploy the same build ─────────────
printf '%s' "${TARGET_SHA}" > "${SHA_FILE}"
log "Deploy complete, recorded ${TARGET_SHA:0:12}."
