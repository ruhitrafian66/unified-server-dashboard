# Unified Server Dashboard

React PWA + Express backend that runs on a 2 GB OrangePi and manages qBittorrent, a media library, TV-episode automation and host status. API and architecture: `README.md`. Deploy flow and rollback: `DEPLOYMENT.md`.

## Deployed topology (lives on the server, not in this repo)

- The backend listens on `127.0.0.1:3001` (drop-in `dashboard.service.d/20-localhost.conf` sets `HOST`). nginx on :80 exposes it by host name: `dash.local` → 3001, `torrent.local` → qBittorrent WebUI (`127.0.0.1:8080`, loopback only), `plex.local` → 32400. The vhosts are in `/etc/nginx/sites-available/local-services`.
- On the server, reach the API with `curl localhost:3001/api/...`; on :80 it needs `-H 'Host: dash.local'`.
- The live media stack is `/opt/media-stack/docker-compose.yml`; `docker-compose.yml` here is a reference copy.
- The OS and the media library share one SSD partition. `LIBRARY_PATH` is `/mnt/storage/Server` (`/downloads` inside the qBittorrent container).
- journald is capped at 8 MB, about one day of logs: read `journalctl -u dashboard` soon after the event you care about.

## Working rules

- A push to `master` is a production deploy: CI goes green, the `deploy-ready` tag moves, the server installs it within ~2 minutes. Work on a branch.
- There is no test suite or linter. CI builds the frontend and boots the backend against a temp `DATA_DIR` (`.github/workflows/deploy.yml`); do the same locally to check a backend change.
- Test anything that adds torrents against a mock qBittorrent and a staging instance on another port: `torrents/add` on the real one really adds.
- Test library delete and cleanup against a temp `LIBRARY_PATH`: those endpoints remove real media.
- Stage files by name. The repo root holds untracked, unrelated files (`PROTONDRIVE_*.md`).

## Parked: TV automation

Show tracking, episode sweeps and season jobs are switched off by the owner's decision (2026-11-16), to be revisited in a session of its own. Leave the feature off and its code in place until then.

- The switch is `TV_AUTOMATION_ENABLED` in `backend/lib/config.js`, true only when `TV_AUTOMATION=on` is in `backend/.env`.
- While off: `backend/routes/shows.js` starts no sweep or timer and answers 503 on every route except `/config/tmdb`, which Media browsing and Settings depend on. `GET /config/tmdb` reports `tvAutomation`, and the frontend (`SettingsContext`) uses it to hide the Tracked tab, the automation settings, and the Home "TV shows" and "Search queue" buttons.
- `data/shows.json` on the server is untouched (two shows, both paused since September 2026).
- Before turning it back on, fix T1–T6 below, plus F2, F3 and the show-search half of F4, which sit in the hidden UI. The search and retry cadence is also wasteful: four searches per episode attempt, only the first 50 results read, and a pending episode retried only every 6 hours.

## Verified, so skip re-investigating

- qBittorrent 5.3.0 serves a search job to any WebUI session, so the 10-minute cookie refresh in `qbAuth.js` does not break running searches (tested 2026-11-16).
- `/api/system/overview` takes ~340 ms because the Docker daemon needs ~190 ms to list containers, over the socket as well as through the CLI. Cache the result; swapping the CLI for the socket gains nothing.

## Known bugs

Audit of 2026-11-16, line numbers as of commit `befc6ea`. When you fix one, delete its entry in the same commit. When you find one, add it with file:line and how it was verified. Status: **live** = reproduced on the server, **code** = verified by reading or a local test, **suspected** = needs the stated check first.

### Library / Storage

- **L1 · medium · live** — Sidecar files of a single-file movie are separate items. Deleting the movie leaves `<name>.en.srt` etc. behind, each listed as its own "leftover" row. `scanLibrary` makes one item per top-level file (`backend/routes/library.js:241`) and `DELETE /items/:id` removes only that path (`:386`). Fix: fold top-level sidecars that share a video's stem into the video's item; report sidecars with no video as junk.
- **L2 · medium · code** — The duplicate flag keys on kind + title + year only (`library.js:294-304`). Two seasons or two episodes of one show are flagged "Duplicate" with "Delete one to free space"; a real duplicate where only one name carries the year is missed. Fix: for TV, require overlapping season/episode sets; compare years only when both names have one.
- **L3 · medium · code** — Cleanup removes only the first 200 junk entries. `junk.items` is truncated for the response (`library.js:332`) and `POST /cleanup` iterates that truncated list (`:396`), while the UI promises `junk.count`. Fix: keep the full list server-side and truncate only what is sent.
- **L4 · medium · code** — `hasReleaseMarkers` (`backend/lib/releaseName.js:63`) matches any year or `S<digit>` substring, so a personal folder without video ("Taxes 2023", "PS5 captures", "Docs2") is classed `leftover` and becomes deletable. Fix: word boundaries, and require two markers or a torrent match before calling a folder `leftover`.
- **L5 · low · code** — Cleanup removes "Empty folder" junk with a recursive `fs.rm` (`library.js:403`), and empty folders are flagged even when qBittorrent is unreachable (`:259`). Fix: `fs.rmdir`, which fails safely if the folder gained files, and skip empty-folder junk when the torrent list is unavailable.
- **L6 · low · code** — Loose-file season fallback (`library.js:150-157`) numbers episodes in unsorted readdir order and also counts the same files as `extras` (`:174`). `episodeOf` never sees the top-level folder name, so `Show Season 2/Episode 04.mkv` is not recognised.
- **L7 · low · code** — Poster lookups run inside the scan (`library.js:306`). With TMDB unreachable, every uncached item waits up to 20 s, on every scan, because failures are not cached.

### TV automation (dormant while the feature is parked)

- **T1 · medium · suspected** — An episode whose torrent is already in qBittorrent is treated as "not found": `addTorrentUrl` returns false for a duplicate (`backend/routes/qbAuth.js:136-152`), so `runCascade` (`backend/routes/shows.js:288-319`) parks it as pending, retries for 7 days, then records it as missed. Check first what 5.3.0 answers for a duplicate add, against a mock or staging qBittorrent. Fix: look up the magnet's infohash with `torrents/info?hashes=` and count "already present" as success.
- **T2 · medium · code** — Adding a show swallows TMDB errors. `lastAiredEpisode` (`shows.js:520-527`) turns a failed season lookup into "nothing aired", ending at S01E00, and the first check then downloads up to 100 episodes. The name-only `POST /api/shows` path assumes one season (`:537`); the UI always sends `tmdbId`. Fix: fail the add with 502; fetch show details when adding by name.
- **T3 · low · code** — Edits during a running check are lost. A `PUT /:id` while that show's cascade is in flight skips the follow-up check, and the cascade later writes `currentSeason`/`currentEpisode` from its own variables (`shows.js:296-303`). Pausing or removing a show mid-search still adds the torrent, because status is read before the search and not after (`:259-288`). Fix: re-read pointer and status after each search.
- **T4 · medium · code** — Title matching (`normalize`, `matchesShow`, `shows.js:59-60`) never matches a TMDB name containing `&`, an accented letter, or a prefix releases drop ("Marvel's …"), so those shows only ever produce missed episodes. The substring match also lets "NCIS" accept "NCIS Sydney". Fix: strip accents, map `&` to `and`, try TMDB alternative titles, and require a year or SxxEyy right after the title.
- **T5 · low · code** — `SearchQueue.getStatus().nextSearchIn` is always 0 because `current` is set before the spacing wait (`shows.js:186-189`, `:215`). The UI never shows "Next in Ns" and displays the wait as an active search.
- **T6 · low · code** — Free space is checked once per cascade against a flat 5 GB (`shows.js:79`, `:250`). A result's `fileSize` is never compared with what is free, on a disk shared with the OS.

### Frontend

- **F1 · medium · live** — The Home quick link to qBittorrent points at `http://<host>:8080` (`frontend/src/pages/Dashboard.jsx:14-18`), which is loopback-only on the server. Fix: take external links from server configuration through `/overview`.
- **F2 · low · code** — The Past Shows progress bar resets 3 s after the POST returns, because the `finally` at `frontend/src/pages/PastShows.jsx:106-113` runs before the job ends. Download re-enables while the job is still running.
- **F3 · low · code** — `QueuePopup` (`frontend/src/components/QueuePopup.jsx:22-27`) marks the first waiting item "processing", leaves out the job that is running (`current`), and prints `S01Eundefined` for season-pack jobs.
- **F4 · low · code** — A stale response can overwrite a newer one: range switches in `HistoryCard.jsx:24-34`, and the type-ahead show search in `OngoingShows.jsx` and `PastShows.jsx`, which also sends one TMDB request per keystroke.
- **F5 · low · code** — `TorrentSearch.jsx:55` polls from an async `setInterval`, so overlapping ticks can fetch results twice. Finished search jobs are stopped but never deleted in qBittorrent.

### Deploy / server

- **D1 · medium · code** — Rollback after a failed build restores the wrong frontend. `frontend/dist.prev` is replaced only after a successful build (`scripts/deploy.sh:93`), so when the build fails `rollback` (`:134`) swaps the live build for the one from the deploy before it. Fix: restore `dist.prev` only when this run did the swap.
- **D2 · medium · code** — `install_and_build` runs with `set -e` suspended, because it is called as `install_and_build || rollback` (`deploy.sh:145`), and `npm ci` empties `node_modules` in place. A failed install leaves the live service without dependencies, the rollback's `npm ci || true` fails the same way, and the commit is never retried. Fix: `|| return 1` on each step, and keep a hardlinked copy of `node_modules` to restore offline.
- **D3 · low · live** — An unknown `/assets/*` path returns `index.html` with 200 (`backend/server.js:83`). Harmless while the app is one bundle; a blank page after a deploy if code-splitting is ever added. Fix: 404 for paths with a file extension.
- **D4 · low · live** — Logs last under a day: journald is capped at 8 MB and `dashboard-deploy.service` writes three lines every ~2 minutes.
- **D5 · low · code** — The rolling GitHub release keeps every build's hashed assets (`.github/workflows/deploy.yml:129-137`). A manual run validates the dispatch ref but tags `inputs.branch`.
- **D6 · low · docs** — Docs drift. README and DEPLOYMENT describe LAN → :3001 directly. DEPLOYMENT lists `DASHBOARD_BRANCH` and `DEPLOYED_SHA_FILE`, which `deploy.sh` ignores, and omits `DASHBOARD_PORT`, `HEALTH_TIMEOUT`, `FORCE_DEPLOY`. `backend/.env.example` omits `HOST`, `LIBRARY_PATH`, `MONITORED_SERVICES`, `SEARCH_GAP_MS`, `NEW_ON_DIGITAL_DAYS`. README omits `/temp-history`.
