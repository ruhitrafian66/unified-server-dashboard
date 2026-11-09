#!/usr/bin/env bash
#
# Unified Server Dashboard — pull-based deploy (runs ON the server).
#
# Driven by dashboard-deploy.timer. The server is LAN-only, so instead of
# GitHub pushing to it, it polls GitHub (outbound HTTPS) for the rolling
# `deploy-ready` tag that CI moves after a green build, and deploys when the
# tag points at a new commit.
#
# Safety:
#   - Only one deploy at a time (flock).
#   - The frontend is built into a staging dir and swapped in atomically, so a
#     failed build never leaves the live UI broken.
#   - After restarting, the service must answer /api/health with the new commit
#     within HEALTH_TIMEOUT seconds; otherwise the previous build is restored.
#   - A commit that failed to deploy is remembered and not retried until the
#     tag moves again (no restart loop every 2 minutes).
#   - Uncommitted edits in the checkout are stashed (not destroyed) and logged.
#
# Environment overrides (defaults in brackets):
#   DASHBOARD_DIR [/opt/server-dashboard]   DASHBOARD_SERVICE [dashboard]
#   DASHBOARD_TAG [deploy-ready]            DASHBOARD_PORT [3001]
#   HEALTH_TIMEOUT [60]                     FORCE_DEPLOY [0] (1 = redeploy even if unchanged)
#
set -euo pipefail

REPO_DIR="${DASHBOARD_DIR:-/opt/server-dashboard}"
SERVICE="${DASHBOARD_SERVICE:-dashboard}"
DEPLOY_TAG="${DASHBOARD_TAG:-deploy-ready}"
PORT="${DASHBOARD_PORT:-3001}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
SHA_FILE="${REPO_DIR}/.deploy-sha"
FAILED_FILE="${REPO_DIR}/.deploy-failed-sha"
LOCK_FILE="/run/lock/dashboard-deploy.lock"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

for cmd in git npm node curl flock; do
  command -v "$cmd" >/dev/null || die "$cmd not found"
done
[ -d "${REPO_DIR}/.git" ] || die "No git checkout at ${REPO_DIR} (see DEPLOYMENT.md)"

exec 9>"${LOCK_FILE}"
flock -n 9 || { log "Another deploy is running; skipping."; exit 0; }

cd "${REPO_DIR}"

# ─── Resolve the tag on GitHub (cheap; no objects downloaded) ─────────────────
remote_refs="$(git ls-remote origin "refs/tags/${DEPLOY_TAG}" "refs/tags/${DEPLOY_TAG}^{}")" \
  || die "git ls-remote failed (network?)"
# Annotated tags list a peeled ^{} line with the commit; lightweight tags don't.
TARGET_SHA="$(awk '/\^\{\}$/ {print $1}' <<<"${remote_refs}")"
[ -n "${TARGET_SHA}" ] || TARGET_SHA="$(awk 'NR==1 {print $1}' <<<"${remote_refs}")"
[ -n "${TARGET_SHA}" ] || { log "Tag '${DEPLOY_TAG}' not found on origin; nothing to deploy."; exit 0; }

LAST_SHA="$(cat "${SHA_FILE}" 2>/dev/null || true)"
if [ "${FORCE_DEPLOY:-0}" != "1" ]; then
  [ "${TARGET_SHA}" = "${LAST_SHA}" ] && exit 0
  if [ "${TARGET_SHA}" = "$(cat "${FAILED_FILE}" 2>/dev/null || true)" ]; then
    exit 0  # already failed once; wait for a new green build
  fi
fi

log "Deploying ${TARGET_SHA:0:12} (was ${LAST_SHA:0:12})"

# Force-update the rolling tag locally (a plain fetch refuses to move an existing tag).
git fetch --quiet --force origin "+refs/tags/${DEPLOY_TAG}:refs/tags/${DEPLOY_TAG}" \
  || die "git fetch failed"
[ "$(git rev-parse "refs/tags/${DEPLOY_TAG}^{commit}")" = "${TARGET_SHA}" ] \
  || die "Fetched tag does not match ls-remote"

PREV_SHA="$(git rev-parse HEAD)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  stash_msg="deploy-autostash $(date -u +%Y-%m-%dT%H:%M:%SZ) before ${TARGET_SHA:0:12}"
  git stash push --quiet -m "${stash_msg}"
  log "WARNING: uncommitted edits found in ${REPO_DIR}; stashed as '${stash_msg}' (see: git stash list)"
fi

lock_changed() { ! git diff --quiet "$1" "$2" -- package-lock.json package.json frontend/package.json backend/package.json; }

install_and_build() {
  local from="$1"
  if lock_changed "${from}" HEAD || [ ! -d node_modules ]; then
    log "Dependencies changed; running npm ci..."
    npm ci --no-audit --no-fund --loglevel=error
  fi
  log "Building frontend..."
  rm -rf frontend/dist-next
  npm run build --silent --workspace frontend -- --outDir dist-next --emptyOutDir >/dev/null
  [ -f frontend/dist-next/index.html ] || return 1
  rm -rf frontend/dist.prev
  [ -d frontend/dist ] && mv frontend/dist frontend/dist.prev
  mv frontend/dist-next frontend/dist
}

# Install the systemd units from the checkout if they changed (paths rewritten
# to REPO_DIR). Called before restart, and again on rollback.
sync_units() {
  local changed=0 unit dst
  for unit in dashboard.service dashboard-deploy.service dashboard-deploy.timer; do
    dst="/etc/systemd/system/${unit}"
    [ "${unit}" = "dashboard.service" ] && dst="/etc/systemd/system/${SERVICE}.service"
    if ! sed "s|/opt/server-dashboard|${REPO_DIR}|g" "scripts/${unit}" | cmp -s - "${dst}"; then
      sed "s|/opt/server-dashboard|${REPO_DIR}|g" "scripts/${unit}" > "${dst}"
      log "Updated ${dst}"
      changed=1
    fi
  done
  [ "${changed}" = 1 ] && systemctl daemon-reload
  return 0
}

healthy() {
  local want="${1:0:12}" deadline=$((SECONDS + HEALTH_TIMEOUT)) body
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    body="$(curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
    if [[ "${body}" == *"\"status\":\"ok\""* && "${body}" == *"\"commit\":\"${want}\""* ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  log "Rolling back to ${PREV_SHA:0:12}..."
  printf '%s' "${TARGET_SHA}" > "${FAILED_FILE}"
  git reset --quiet --hard "${PREV_SHA}"
  if lock_changed "${TARGET_SHA}" "${PREV_SHA}"; then
    npm ci --no-audit --no-fund --loglevel=error || true
  fi
  if [ -d frontend/dist.prev ]; then
    rm -rf frontend/dist && mv frontend/dist.prev frontend/dist
  fi
  printf '%s' "${PREV_SHA}" > "${SHA_FILE}"
  sync_units || true
  systemctl restart "${SERVICE}" || true
  healthy "${PREV_SHA}" && log "Rollback healthy." || log "WARNING: rollback is not healthy either; check 'journalctl -u ${SERVICE}'"
  die "Deploy of ${TARGET_SHA:0:12} failed; it will not be retried until the tag moves."
}

git reset --quiet --hard "${TARGET_SHA}"
install_and_build "${PREV_SHA}" || rollback

# deployInfo.js reads this at startup, so /api/health reports the new commit.
printf '%s' "${TARGET_SHA}" > "${SHA_FILE}"
sync_units || rollback
log "Restarting ${SERVICE}..."
systemctl restart "${SERVICE}" || rollback
healthy "${TARGET_SHA}" || rollback

rm -f "${FAILED_FILE}"
log "Deploy complete: ${TARGET_SHA:0:12} is live."
