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
3. **On the server**, a `systemd timer` runs `scripts/deploy.sh` every 2 minutes. That script
   does an outbound `git fetch origin deploy-ready`; if the tag moved since the last deploy, it
   resets to that commit, runs `npm ci` + `npm run build`, restarts the `dashboard` service,
   and records the new SHA. If the tag hasn't moved, it exits without touching anything.

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
sudo mkdir -p /opt/dashboard
sudo chown -R $USER /opt/dashboard
git clone https://github.com/<your-org>/unified-server-dashboard.git /opt/dashboard
cd /opt/dashboard
cp backend/.env.example backend/.env   # fill in real credentials
mkdir -p /opt/dashboard/data            # DATA_DIR for shows.json / config.json
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
sudo cp /opt/dashboard/scripts/dashboard-deploy.service /etc/systemd/system/
sudo cp /opt/dashboard/scripts/dashboard-deploy.timer  /etc/systemd/system/
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
| `DASHBOARD_DIR` | `/opt/dashboard` | Path to the checkout on the server |
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
Environment="DASHBOARD_DIR=/opt/dashboard"
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

Because the server checkout is a Git repo, roll back to the previous build on the server:

```bash
cd /opt/dashboard
git fetch --prune origin master
git reset --hard origin/master~1
npm ci && npm run build
sudo systemctl restart dashboard
```

To **prevent** the timer from re-deploying the bad tag, either (a) revert on GitHub so the
`deploy-ready` tag moves back to an older green commit and push again, or (b) temporarily
stop the timer:

```bash
sudo systemctl stop dashboard-deploy.timer
# ... fix on GitHub, push a green build ...
sudo systemctl start dashboard-deploy.timer
```

For an exact known-good build, you can also grab the attached `frontend/dist` from the
latest GitHub Release and serve it manually.

---

## Notes & tips

- **No inbound ports / no SSH from GitHub** — the server only ever makes outbound `git fetch`.
- **`package-lock.json` is committed** so `npm ci` gives reproducible builds.
- **`frontend/dist` is built on the server**, so the built files are never committed.
- **Latency:** the timer default polls every 2 minutes; lower it if you want faster deploys
  (add `OnUnitActiveSec=1min` in the timer).
- The `ci` job still gates changes; add **branch protection** on `master` requiring CI to
  pass so only green code reaches the `deploy-ready` tag.

