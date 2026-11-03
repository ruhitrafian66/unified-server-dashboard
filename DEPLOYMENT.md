# Deployment — GitHub Actions CI/CD

The Unified Server Dashboard is deployed to a **self-hosted Linux media server** using a
modern GitHub Actions pipeline. Every push to `master` automatically builds the frontend,
validates the backend, then SSHes into your server, pulls the latest code, rebuilds, and
restarts the `dashboard` systemd service.

```
push to master  -->  GitHub Actions  -->  SSH  -->  self-hosted server
                        |                           |- git pull
                        |- npm ci                   |- npm ci
                        |- npm run build            |- npm run build
                        `- node --check             `- systemctl restart dashboard
```

---

## Prerequisites

1. **The repo must be on GitHub** with a matching remote (already configured as `origin`).
2. **The server must have a Git checkout** of the repo at the deploy directory
   (default `/opt/dashboard`) and be able to reach GitHub over the network.
3. **A systemd unit** for the backend already exists (see the existing systemd service
   described in `README.md` — `dashboard.service`).
4. **An SSH key pair** that GitHub Actions can use to log into the server as a user with
   permissions to restart the service.

---

## GitHub Actions secrets to configure

Add these in **Settings → Secrets and variables → Actions** on GitHub (repo scope):

| Secret               | Description                                                              | Example                       |
|----------------------|--------------------------------------------------------------------------|-------------------------------|
| `DEPLOY_SSH_KEY`     | **Private** SSH key (PEM) used to log into the server.                   | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| `DEPLOY_HOST`        | Hostname or IP of the server.                                            | `192.168.1.100`               |
| `DEPLOY_USER`        | SSH user to log in as (must be able to `systemctl restart dashboard`).   | `root`                        |
| `DEPLOY_PORT`        | Backend port to health-check after deploy (default `3001`).              | `3001`                        |
| `DEPLOY_DIR`         | Absolute path where the repo is checked out on the server (default `/opt/dashboard`). | `/opt/dashboard` |
| `DEPLOY_SERVICE`     | systemd unit name for the backend (default `dashboard`).                 | `dashboard`                   |

> **Important:** the deploy user must be able to restart the service without an
> interactive password (e.g. logged in as `root`, or a sudo-less user with a
> `systemctl` permission override). If the user needs `sudo`, grant a
> passwordless sudo rule via `/etc/sudoers.d/dashboard`:
>
> ```bash
> deployuser ALL=(root) NOPASSWD: /usr/bin/systemctl restart dashboard
> ```

### Add the deploy SSH key to the server

On the server, place the **public** key in the target user's `authorized_keys`:

```bash
# On the server, as the deploy user:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<paste DEPLOY public key here>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## Setting up the server checkout (one-time bootstrap)

The deploy script refuses to run if there is no Git checkout, so bootstrap it once:

```bash
sudo mkdir -p /opt/dashboard
sudo chown -R $USER /opt/dashboard
git clone https://github.com/<your-org>/unified-server-dashboard.git /opt/dashboard
cd /opt/dashboard
cp backend/.env.example backend/.env    # fill in real credentials
# Ensure the systemd unit exists (see README) and the DATA_DIR is writable.
```

> **Note:** `backend/.env` and other runtime files are **not** touched by the deploy
> script (`git reset --hard` only resets tracked files; ignored runtime files like
> `.env` persist). If you ever need first-time env setup, do it once here.

---

## The CI/CD workflow

`.github/workflows/deploy.yml` has two jobs:

### 1. `ci` — Build & validate (runs on every push/PR)
- Checks out the code, installs deps with `npm ci` (uses committed `package-lock.json`).
- Builds the frontend (`npm run build`).
- Verifies `frontend/dist/index.html` exists.
- Syntax-checks the backend (`node --check backend/server.js`).
- Uploads the build as an artifact.

### 2. `deploy` — Deploy to server
- Runs **only** on pushes to `master`/`main` **or** on manual `workflow_dispatch`.
- Never runs from pull requests.
- Sets up the SSH key from secrets, tests connectivity, then streams
  `scripts/deploy.sh` to the server with the required environment variables.
- Health-checks `http://localhost:<port>/api/health` afterwards.

### Manual trigger

You can deploy a specific branch from the GitHub UI: **Actions → CI/CD → Run workflow**,
then pick the branch.

---

## The deploy script — `scripts/deploy.sh`

Runs **on the server** (invoked remotely by the workflow, or manually via
`npm run deploy`). It:

1. `git fetch --prune origin` and `reset --hard origin/<branch>`.
2. `npm ci --no-audit --no-fund` — deterministic install from the lockfile.
3. `npm run build` — builds the frontend into `frontend/dist`.
4. `systemctl restart <service>`.
5. Health-checks the running service.

Environment overrides: `DASHBOARD_DIR`, `DASHBOARD_SERVICE`, `DASHBOARD_BRANCH`.

---

## Rollback

Because the checkout on the server is a Git repo, rollback is a one-liner on the server:

```bash
cd /opt/dashboard
git reset --hard origin/master~1   # previous commit
npm ci && npm run build
systemctl restart dashboard
```

(Or re-run the prior workflow run from the Actions tab.)

---

## Notes & tips

- **Lockfile is committed** now — `package-lock.json` is no longer in `.gitignore`, so
  `npm ci` gives reproducible builds both locally and in CI.
- **`scripts/` is tracked** now — only sensitive artifacts (keys, `server-dashboard.service`,
  `DEPLOYED.md`) remain ignored.
- **Concurrency** is enforced so two rapid deploys don't race (`concurrency` group keyed on ref).
- Best practice: add **branch protection** on `master` requiring the `ci` job to pass before merge.

---

## TODO / customization

- If you later prefer containers, a `Dockerfile` + GHCR push flow can be layered on top of
  the same SSH deployment (the workflow is structured so a `docker` job is easy to add).

