# Deployment — GitHub Actions CI/CD (pull-based, LAN-only server)

The Unified Server Dashboard is deployed to a **self-hosted Linux media server** that
**only has LAN access — its SSH/remote ports are NOT exposed to the internet.** So the
pipeline is **pull-based**: the server reaches *out* to GitHub (which it can do, via HTTPS)
and pulls a green build, instead of GitHub reaching *in* over SSH.

```
GitHub (cloud)                          LAN-only server (no inbound ports)
+--------------+                        +------------------------------+
| push master  |                        | systemd timer (every 2 min)  |
|   v          |                        |   v                          |
| CI job       |                        | scripts/deploy.sh            |
|  build/test  |   --outbound HTTPS-->  |   git fetch deploy-ready <---+
|   v          |   or the server's own  |   tag moved? --no--> exit    |
| release job  |   `git fetch`          |        |yes                  |
|  tag: deploy |                        |        v                     |
|  -ready      |                        |   npm ci -> build -> restart  |
+--------------+                        +------------------------------+
```

The key idea: GitHub marks a commit as "deploy-ready" by advancing a rolling `deploy-ready`
tag **only when CI passes.** The server polls that tag and redeploys when it moves. No SSH, no
inbound firewall rules, no secrets on GitHub needed for server access.

---

## How it works

1. **Push to `master`** → the `ci` job builds the frontend, syntax-checks the backend, and
   uploads `frontend/dist` as an artifact.
2. **Only if CI is green** does the `release` job run. It force-advances a rolling
   `deploy-ready` tag to that commit and publishes/updates a GitHub **Release** (with the
   built `frontend/dist` attached for manual rollback).
3. **On the server**, a systemd timer runs `scripts/deploy.sh` every ~2 minutes. It asks GitHub
   (`git ls-remote`, no download) which commit the `deploy-ready` tag points at. If that commit
   differs from `.deploy-sha` it:
   - force-fetches the tag (a plain `git fetch` will not move an existing tag),
   - stashes any hand edits in the checkout (`git stash list` shows them) and resets to the commit,
   - runs `npm ci` only if a lockfile/package.json changed,
   - builds the frontend into `frontend/dist-next` and swaps it in atomically,
   - restarts `dashboard` and waits until `/api/health` reports the new commit.

   If the build or health check fails it **rolls back** to the previous commit and build, and
   writes the bad commit to `.deploy-failed-sha` so it isn't retried until the tag moves again.

Because only `git fetch` (outbound HTTPS to GitHub) is used, the server needs **no** inbound
ports and **no** SSH access from GitHub.

---

## One-time server setup
> **Easiest path — run the bundled installer on the server.** Everything below is
> automated by `scripts/install-server.sh` (idempotent, root required). It clones the
> repo if needed, creates `backend/.env` from the example (without overwriting), sets up
> `data/`, installs the `dashboard.service` backend unit and the deploy oneshot+timer,
> and enables everything:
>
> ```bash
> sudo bash <repo>/scripts/install-server.sh
> ```
>
> The manual steps below document exactly what it does, so you can follow along or
> customise.



### 1. Clone the repo (first deployment only)

```bash
sudo mkdir -p /opt/server-dashboard
sudo chown -R $USER /opt/server-dashboard
git clone https://github.com/<your-org>/unified-server-dashboard.git /opt/server-dashboard
cd /opt/server-dashboard
cp backend/.env.example backend/.env   # fill in real credentials
mkdir -p /opt/server-dashboard/data            # DATA_DIR for shows.json / config.json
```

### 2. Install the backend service

The backend runs as a systemd service (see `README.md`). Make sure `dashboard.service`
exists and is enabled:

```bash
sudo systemctl enable --now dashboard
```

### 3. Install the deploy timer + oneshot service

Copy the two units from `scripts/` into systemd and start the timer:

```bash
sudo cp /opt/server-dashboard/scripts/dashboard-deploy.service /etc/systemd/system/
sudo cp /opt/server-dashboard/scripts/dashboard-deploy.timer  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dashboard-deploy.timer
```

Trigger a check immediately (optional):

```bash
sudo systemctl start dashboard-deploy.service
```
### 4. Verify

```bash
sudo systemctl status dashboard-deploy.timer       # active, "waiting"
journalctl -u dashboard-deploy.service -f          # watch the deploy log
```

---

## Environment overrides

The deploy script respects these (all optional; defaults in parentheses):

| Variable | Default | Meaning |
|----------|---------|---------|
| `DASHBOARD_DIR` | `/opt/server-dashboard` | Path to the checkout on the server |
| `DASHBOARD_SERVICE` | `dashboard` | systemd unit to restart |
| `DASHBOARD_BRANCH` | `master` | Branch to deploy |
| `DASHBOARD_TAG` | `deploy-ready` | Rolling tag that marks a green build |
| `DEPLOYED_SHA_FILE` | `${DASHBOARD_DIR}/.deploy-sha` | File remembering the last-deployed SHA |

To set these, create a systemd override:

```bash
sudo systemctl edit dashboard-deploy.service
```

```ini
[Service]
Environment="DASHBOARD_DIR=/opt/server-dashboard"
Environment="DASHBOARD_SERVICE=dashboard"
Environment="DASHBOARD_TAG=deploy-ready"
```

---

## Manual trigger / immediate deploy

Two ways to force a deploy without waiting for the timer:

- **Re-run the pipeline in GitHub:** Actions -> CI/CD -> Run workflow (pick a branch). If the
  `release` job runs and the tag advances, the server picks it up on its next poll.
- **On the server:**
  ```bash
  sudo systemctl start dashboard-deploy.service
  ```

---

## Rollback

Automatic: a deploy that fails to build or doesn't pass the health check is rolled back
by `deploy.sh` itself (see `journalctl -u dashboard-deploy`).

Manual, to a specific known-good commit:

```bash
sudo systemctl stop dashboard-deploy.timer        # stop auto-deploys while you work
cd /opt/server-dashboard
git fetch origin && git reset --hard <good-sha>
npm ci && npm run build
printf '%s' "$(git rev-parse HEAD)" > .deploy-sha
sudo systemctl restart dashboard
# ...push a fix to master, then:
sudo systemctl start dashboard-deploy.timer
```

Force a redeploy of the current tag: `sudo FORCE_DEPLOY=1 bash /opt/server-dashboard/scripts/deploy.sh`.

## Notes & tips

- **No inbound ports / no SSH from GitHub** — the server only ever makes outbound `git fetch`.
- **`package-lock.json` is committed** so `npm ci` gives reproducible builds.
- **`frontend/dist` is built on the server**, so the built files are never committed.
- **Latency:** the timer polls every 2 minutes after the previous run finished
  (`OnUnitInactiveSec` in the timer); a no-change poll is one `git ls-remote` and logs nothing.
- **Never hand-edit files in `/opt/server-dashboard`.** Commit the change instead; a deploy will
  stash local edits (recoverable with `git stash list` / `git stash pop`).
- The CI `release` job retries the tag push, because GitHub occasionally returns 500 on ref updates.
- The `ci` job still gates changes; add **branch protection** on `master` requiring CI to
  pass so only green code reaches the `deploy-ready` tag.

