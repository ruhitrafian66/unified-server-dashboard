/**
 * TV show automation.
 *
 * Model: each tracked show has a progress pointer (currentSeason/currentEpisode
 * = last episode handled). A "check" walks forward from the pointer:
 *   - episode aired + found      → add torrent, advance pointer, continue
 *   - episode aired + not found  → keep it as `pendingEpisode` and retry on the
 *                                  next sweep; only after MISS_AFTER_DAYS is it
 *                                  recorded in `missedEpisodes` and skipped
 *   - episode not aired yet      → remember its air date, arm a timer, stop
 *   - episode doesn't exist      → move to S+1E1 if TMDB has a next season
 *
 * Checks run (a) on a timer at each next episode's air time, (b) on a periodic
 * sweep — which also catches anything missed while the server was down — and
 * (c) on demand. All of it runs in the background; HTTP requests never wait.
 */
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, DOWNLOAD_PATH, getTmdbApiKey, isAutoCheckEnabled, updateConfig, loadConfig } from '../lib/config.js';
import { JsonStore } from '../lib/jsonStore.js';
import * as tmdb from '../lib/tmdb.js';
import { qbGet, qbPost, addTorrentUrl } from './qbAuth.js';

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Tunables ────────────────────────────────────────────────────────────────
const AIR_DELAY_MS = 60 * 60 * 1000;          // first search 1h after the air date (UTC midnight)
const MISS_AFTER_DAYS = 7;                     // give up on an episode this long after it aired
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;  // periodic catch-up sweep
const MAX_TIMER_MS = 12 * 60 * 60 * 1000;      // re-arm long timers (setTimeout overflows at ~24.8 days)
const MIN_FREE_BYTES = 5 * 1024 ** 3;
const SEARCH_GAP_MS = parseInt(process.env.SEARCH_GAP_MS, 10) || 45_000; // spacing between queued searches

// ─── Storage ─────────────────────────────────────────────────────────────────
const store = new JsonStore(path.join(DATA_DIR, 'shows.json'), { shows: [] }, { mode: 0o644 });

const loadShows = () => store.read();
const getShowById = async (id) => (await loadShows()).shows.find((s) => s.id === id) || null;

/** Atomically mutate one show. Returns a copy of the updated show, or null if it no longer exists. */
const patchShow = (id, fn) =>
  store.update((data) => {
    const show = data.shows.find((s) => s.id === id);
    if (!show) return null;
    fn(show);
    return structuredClone(show);
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const epCode = (s, e) => `S${pad(s)}E${pad(e)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const airTime = (airDate) => new Date(`${airDate}T00:00:00Z`).getTime() + AIR_DELAY_MS;
const hasAired = (airDate) => Boolean(airDate) && Date.now() >= airTime(airDate);

const normalize = (s = '') => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const matchesShow = (fileName, showName) => ` ${normalize(fileName)} `.includes(` ${normalize(showName)} `);
const matchesEpisode = (fileName, season, episode) =>
  new RegExp(`\\b(s0?${season}e0?${episode}|${season}x0?${episode})(?!\\d)`).test(normalize(fileName));
const isSeasonPack = (fileName, season) => {
  const n = normalize(fileName);
  if (!new RegExp(`\\b(s0?${season}(?=\\b|e\\d)|season ${season}\\b)`).test(n)) return false;
  const episodeMarkers = (n.match(/\bs\d{1,2}e\d{1,3}|\be\d{1,3}\b/g) || []).length;
  return episodeMarkers === 0 || episodeMarkers >= 2;
};
// Fake "releases" that are really malware (e.g. "Show S01E04 1080p .exe") are
// common on public trackers. Never pick these automatically.
const SUSPICIOUS_NAME = /\.(exe|scr|bat|cmd|msi|lnk|vbs|jar|apk|zip|rar|7z)\b|\bpassword\b/i;
const isSafeResult = (r) => r.fileUrl?.startsWith('magnet:') && !SUSPICIOUS_NAME.test(r.fileName || '');

const qualityScore = (name = '') =>
  (/2160p|\b4k\b/i.test(name) ? 20 : 0) + (/1080p/i.test(name) ? 15 : 0) + (/web-?dl/i.test(name) ? 10 : 0);
const bestFirst = (a, b) =>
  (b.nbSeeders || 0) - (a.nbSeeders || 0) || qualityScore(b.fileName) - qualityScore(a.fileName);

const hasFreeSpace = async () => {
  try {
    const s = await fs.statfs(DOWNLOAD_PATH);
    return s.bavail * s.bsize > MIN_FREE_BYTES;
  } catch (err) {
    console.error('Disk space check failed (allowing download):', err.message);
    return true;
  }
};

// ─── qBittorrent search ──────────────────────────────────────────────────────
/** Run one qBittorrent search and return its results (partial results on timeout). */
const runQbSearch = async (pattern, { maxWaitMs = 60_000, limit = 50 } = {}) => {
  const { data } = await qbPost('/api/v2/search/start', { pattern, plugins: 'enabled', category: 'all' });
  const id = data.id;
  try {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await sleep(5000);
      const { data: status } = await qbGet('/api/v2/search/status', { id });
      if (status?.[0]?.status === 'Stopped') break;
    }
    const { data: results } = await qbGet('/api/v2/search/results', { id, limit });
    return results.results || [];
  } finally {
    await qbPost('/api/v2/search/stop', { id }).catch(() => {});
    await qbPost('/api/v2/search/delete', { id }).catch(() => {});
  }
};

const searchEpisode = async ({ showName, season, episode }) => {
  const code = epCode(season, episode);
  const patterns = [
    `${showName} ${code} 2160p web-dl`,
    `${showName} ${code} 2160p`,
    `${showName} ${code} 1080p web-dl`,
    `${showName} ${code} 1080p`,
  ];
  for (const pattern of patterns) {
    try {
      const results = await runQbSearch(pattern);
      const valid = results
        .filter(isSafeResult)
        .filter((r) => matchesShow(r.fileName, showName) && matchesEpisode(r.fileName, season, episode))
        .sort(bestFirst);
      if (valid.length) {
        console.log(`✅ ${showName} ${code}: picked "${valid[0].fileName}" (${valid[0].nbSeeders} seeders)`);
        return valid[0];
      }
    } catch (err) {
      console.error(`Search "${pattern}" failed:`, err.message);
    }
  }
  console.log(`❌ ${showName} ${code}: no matching result`);
  return null;
};

const searchSeasonPack = async ({ showName, season }) => {
  const s = `S${pad(season)}`;
  const patterns = [
    `${showName} ${s} 2160p web-dl`,
    `${showName} ${s} 2160p`,
    `${showName} ${s} 1080p web-dl`,
    `${showName} ${s} 1080p`,
    `${showName} Season ${season} 1080p complete`,
    `${showName} ${s} complete`,
  ];
  for (const pattern of patterns) {
    try {
      const results = await runQbSearch(pattern, { maxWaitMs: 75_000 });
      const valid = results
        .filter(isSafeResult)
        .filter((r) => matchesShow(r.fileName, showName) && isSeasonPack(r.fileName, season))
        .sort(bestFirst);
      if (valid.length) {
        console.log(`🎯 ${showName} ${s} pack: "${valid[0].fileName}" (${valid[0].nbSeeders} seeders)`);
        return valid[0];
      }
    } catch (err) {
      console.error(`Season search "${pattern}" failed:`, err.message);
    }
  }
  return null;
};

// ─── Search queue: one search job at a time, spaced out ──────────────────────
class SearchQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.current = null;
    this.lastSearchTime = 0;
    this.searchInterval = SEARCH_GAP_MS;
  }

  enqueue(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...request, resolve, reject, timestamp: Date.now() });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const req = this.queue.shift();
      this.current = req;
      try {
        const wait = this.searchInterval - (Date.now() - this.lastSearchTime);
        if (wait > 0) await sleep(wait);
        const result = req.searchType === 'season' ? await searchSeasonPack(req) : await searchEpisode(req);
        req.resolve(result);
      } catch (err) {
        req.reject(err);
      } finally {
        this.lastSearchTime = Date.now();
        this.current = null;
      }
    }
    this.processing = false;
  }

  getStatus() {
    const describe = (item) => ({
      showName: item.showName,
      season: item.season,
      episode: item.episode,
      searchType: item.searchType,
      queuedAt: new Date(item.timestamp).toISOString(),
    });
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      current: this.current ? describe(this.current) : null,
      lastSearchTime: this.lastSearchTime,
      nextSearchIn: this.processing && !this.current
        ? Math.max(0, this.searchInterval - (Date.now() - this.lastSearchTime))
        : 0,
      queuedItems: this.queue.map(describe),
    };
  }

  clearQueue() {
    const cleared = this.queue.length;
    this.queue.forEach((item) => item.reject(new Error('Search queue cleared')));
    this.queue = [];
    return cleared;
  }
}

const searchQueue = new SearchQueue();

// ─── The check (cascade) ─────────────────────────────────────────────────────
const inFlight = new Set();

const checkShow = async (showId, reason = 'manual') => {
  if (inFlight.has(showId)) return { success: false, message: 'Check already running', episodes: [] };
  inFlight.add(showId);
  try {
    return await runCascade(showId, reason);
  } finally {
    inFlight.delete(showId);
  }
};

const runCascade = async (showId, reason) => {
  const show = await getShowById(showId);
  if (!show || show.status !== 'active') return { success: false, message: 'Show not found or inactive', episodes: [] };
  if (!show.tmdbId) return { success: false, message: 'Show has no TMDB id; automatic tracking needs TMDB', episodes: [] };
  if (!getTmdbApiKey()) return { success: false, message: 'TMDB API key not configured', episodes: [] };
  if (!(await hasFreeSpace())) return { success: false, message: 'Insufficient disk space (< 5 GB free)', episodes: [] };

  console.log(`🔄 Checking ${show.name} from ${epCode(show.currentSeason, show.currentEpisode + 1)} (${reason})`);
  const downloaded = [];
  const missed = [];
  let season = show.currentSeason;
  let episode = show.currentEpisode + 1;

  for (let guard = 0; guard < 100; guard++) {
    const fresh = await getShowById(showId);
    if (!fresh || fresh.status !== 'active') break;

    const ep = await tmdb.getEpisode(show.tmdbId, season, episode);

    if (!ep) {
      // Past the end of this season — is there a next one?
      const nextSeasonPremiere = await tmdb.getEpisode(show.tmdbId, season + 1, 1);
      if (nextSeasonPremiere) {
        season += 1;
        episode = 1;
        await patchShow(showId, (s) => { s.currentSeason = season; s.currentEpisode = 0; });
        continue;
      }
      await patchShow(showId, (s) => { s.nextEpisodeAirDate = null; s.pendingEpisode = null; s.lastChecked = nowIso(); });
      break;
    }

    if (!ep.air_date || !hasAired(ep.air_date)) {
      const updated = await patchShow(showId, (s) => {
        s.nextEpisodeAirDate = ep.air_date || null;
        s.pendingEpisode = null;
        s.lastChecked = nowIso();
      });
      if (updated) scheduleShow(updated);
      break;
    }

    const result = await searchQueue.enqueue({ showName: show.name, season, episode, searchType: 'episode' });
    const added = result ? await addTorrentUrl(result.fileUrl).catch((err) => {
      console.error('Add torrent failed:', err.message);
      return false;
    }) : false;

    if (added) {
      const info = { season, episode, title: result.fileName, downloadedAt: nowIso(), airDate: ep.air_date };
      downloaded.push(info);
      const updated = await patchShow(showId, (s) => {
        s.currentSeason = season;
        s.currentEpisode = episode;
        s.downloadedEpisodes = [...(s.downloadedEpisodes || []), info];
        s.missedEpisodes = (s.missedEpisodes || []).filter((m) => !(m.season === season && m.episode === episode));
        s.pendingEpisode = null;
        s.lastChecked = nowIso();
      });
      if (!updated) break;
      episode += 1;
      continue;
    }

    const daysSinceAir = (Date.now() - airTime(ep.air_date)) / 86_400_000;
    if (daysSinceAir < MISS_AFTER_DAYS) {
      // Not released yet (or not indexed yet). Keep the pointer here and retry on the next sweep.
      await patchShow(showId, (s) => {
        const same = s.pendingEpisode?.season === season && s.pendingEpisode?.episode === episode;
        s.pendingEpisode = { season, episode, airDate: ep.air_date, lastTried: nowIso(), tries: same ? (s.pendingEpisode.tries || 0) + 1 : 1 };
        s.nextEpisodeAirDate = ep.air_date;
        s.lastChecked = nowIso();
      });
      break;
    }

    // Old enough that it's unlikely to appear: record it as missed and move on.
    const miss = { season, episode, airDate: ep.air_date, missedAt: nowIso() };
    missed.push(miss);
    const updated = await patchShow(showId, (s) => {
      s.currentSeason = season;
      s.currentEpisode = episode;
      s.missedEpisodes = [...(s.missedEpisodes || []).filter((m) => !(m.season === season && m.episode === episode)), miss];
      s.pendingEpisode = null;
      s.lastChecked = nowIso();
    });
    if (!updated) break;
    episode += 1;
  }

  const codes = downloaded.map((e) => epCode(e.season, e.episode)).join(', ');
  return {
    success: downloaded.length > 0,
    message: downloaded.length ? `Downloaded ${downloaded.length} episode(s): ${codes}` : 'No new episodes available',
    episodes: downloaded,
    missed,
  };
};

// ─── Scheduling ──────────────────────────────────────────────────────────────
const timers = new Map(); // showId -> timeout

const clearShowTimer = (showId) => {
  clearTimeout(timers.get(showId));
  timers.delete(showId);
};

/** Arm a timer for the show's next air time. Past-due shows are left to the sweep. */
const scheduleShow = (show) => {
  clearShowTimer(show.id);
  if (!isAutoCheckEnabled() || show.status !== 'active' || !show.nextEpisodeAirDate) return;
  const due = airTime(show.nextEpisodeAirDate);
  if (due <= Date.now()) return;

  const arm = () => {
    const remaining = due - Date.now();
    if (remaining <= 0) {
      timers.delete(show.id);
      checkShow(show.id, 'scheduled').catch((err) => console.error(`Scheduled check for ${show.name} failed:`, err.message));
      return;
    }
    const t = setTimeout(arm, Math.min(remaining, MAX_TIMER_MS));
    t.unref();
    timers.set(show.id, t);
  };
  arm();
};

let sweepRunning = false;
let lastSweep = null;

const sweep = async (reason = 'sweep', { force = false } = {}) => {
  if (sweepRunning) return { success: false, message: 'A check is already running' };
  if (!force && !isAutoCheckEnabled()) return { success: false, message: 'Auto-check disabled' };
  sweepRunning = true;
  const summary = { checked: 0, downloads: [], missed: [], errors: [] };
  try {
    const { shows } = await loadShows();
    for (const show of shows.filter((s) => s.status === 'active')) {
      const due = force || !show.nextEpisodeAirDate || hasAired(show.nextEpisodeAirDate);
      if (!due) { scheduleShow(show); continue; }
      try {
        const result = await checkShow(show.id, reason);
        summary.checked += 1;
        result.episodes?.forEach((e) => summary.downloads.push({
          show: show.name, episode: epCode(e.season, e.episode), title: e.title, status: 'downloaded', airDate: e.airDate,
        }));
        result.missed?.forEach((m) => summary.missed.push({ show: show.name, episode: epCode(m.season, m.episode) }));
      } catch (err) {
        console.error(`Check for ${show.name} failed:`, err.message);
        summary.errors.push({ show: show.name, error: err.message });
      }
    }
  } finally {
    sweepRunning = false;
    lastSweep = { at: nowIso(), reason, ...summary };
  }
  return { success: true, ...summary };
};

const startAutomation = async () => {
  await loadConfig();
  setTimeout(() => sweep('startup').catch((err) => console.error('Startup sweep failed:', err.message)), 60_000).unref();
  setInterval(() => sweep('periodic').catch((err) => console.error('Periodic sweep failed:', err.message)), SWEEP_INTERVAL_MS).unref();
};
startAutomation();

// ─── Background season downloads with progress sessions ──────────────────────
const downloadProgress = new Map(); // sessionId -> progress
const PROGRESS_TTL_MS = 60 * 60 * 1000;

const setProgress = (sessionId, progress) => {
  downloadProgress.set(sessionId, { ...progress, updatedAt: Date.now() });
  for (const [id, p] of downloadProgress) {
    if (Date.now() - p.updatedAt > PROGRESS_TTL_MS) downloadProgress.delete(id);
  }
};

/** Aired episode numbers for a season, from TMDB (null if unknown). */
const airedEpisodes = async (tmdbId, season) => {
  if (!tmdbId || !getTmdbApiKey()) return null;
  try {
    const data = await tmdb.getSeason(tmdbId, season);
    return (data?.episodes || []).filter((e) => hasAired(e.air_date)).map((e) => e.episode_number);
  } catch {
    return null;
  }
};

const processSeasonDownload = async (sessionId, { showName, season, tmdbId, startEpisode, endEpisode, tryPack = true }) => {
  const base = { showName, season };
  const results = [];
  let seasonPack = false;

  if (!(await hasFreeSpace())) {
    setProgress(sessionId, { ...base, status: 'error', message: 'Insufficient disk space (less than 5GB available)', progress: 100, error: true });
    return;
  }

  if (tryPack) {
    setProgress(sessionId, { ...base, status: 'searching', message: 'Searching for a season pack…', progress: 10 });
    const pack = await searchQueue.enqueue({ showName, season, searchType: 'season' });
    if (pack && await addTorrentUrl(pack.fileUrl).catch(() => false)) {
      results.push({ type: 'season_pack', title: pack.fileName, status: 'downloaded' });
      seasonPack = true;
    }
  }

  if (!seasonPack) {
    let episodes = await airedEpisodes(tmdbId, season);
    const knownList = Boolean(episodes);
    const from = startEpisode || 1;
    const to = endEpisode || (knownList ? 999 : from + 11);
    episodes = (episodes || Array.from({ length: Math.min(to, from + 49) - from + 1 }, (_, i) => from + i))
      .filter((e) => e >= from && e <= to);

    let consecutiveMisses = 0;
    for (const [i, ep] of episodes.entries()) {
      setProgress(sessionId, {
        ...base,
        status: 'searching',
        message: `Searching episode ${ep} (${i + 1}/${episodes.length})…`,
        progress: 40 + Math.round(((i + 1) / episodes.length) * 55),
      });
      const found = await searchQueue.enqueue({ showName, season, episode: ep, searchType: 'episode' });
      if (found && await addTorrentUrl(found.fileUrl).catch(() => false)) {
        results.push({ type: 'episode', episode: epCode(season, ep), title: found.fileName, status: 'downloaded' });
        consecutiveMisses = 0;
      } else if (!knownList && ++consecutiveMisses >= 3) {
        break; // Unknown season length: stop after three misses in a row.
      }
    }
  }

  if (!results.length) {
    setProgress(sessionId, {
      ...base,
      status: 'completed',
      success: false,
      progress: 100,
      downloads: [],
      seasonPack: false,
      message: `No 1080p+ release found for ${showName} Season ${season}. Try a manual search for other qualities.`,
      qualityNote: 'Only 1080p and 2160p releases are picked automatically.',
    });
    return;
  }
  setProgress(sessionId, {
    ...base,
    status: 'completed',
    success: true,
    progress: 100,
    downloads: results,
    seasonPack,
    message: seasonPack
      ? `Added season pack for ${showName} Season ${season}`
      : `Added ${results.length} episode(s) of ${showName} Season ${season}`,
  });
};

const startSeasonJob = (params) => {
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setProgress(sessionId, { status: 'searching', message: 'Starting…', progress: 0, showName: params.showName, season: params.season });
  processSeasonDownload(sessionId, params).catch((err) => {
    console.error(`Season download ${sessionId} failed:`, err);
    setProgress(sessionId, { status: 'error', message: `Download failed: ${err.message}`, progress: 100, error: true });
  });
  return sessionId;
};

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/', h(async (req, res) => {
  res.json(await loadShows());
}));

const lastAiredEpisode = async (tmdbId, numberOfSeasons) => {
  for (let season = numberOfSeasons; season >= 1; season--) {
    const data = await tmdb.getSeason(tmdbId, season).catch(() => null);
    const aired = (data?.episodes || []).filter((e) => hasAired(e.air_date));
    if (aired.length) return { currentSeason: season, currentEpisode: aired.at(-1).episode_number };
  }
  return { currentSeason: 1, currentEpisode: 0 };
};

router.post('/', h(async (req, res) => {
  const { tmdbId, name } = req.body || {};
  if (!tmdbId && !name) return res.status(400).json({ error: 'Either TMDB ID or show name is required' });
  if (!getTmdbApiKey()) return res.status(400).json({ error: 'TMDB API key not configured (Settings → TMDB)' });

  const tmdbShow = tmdbId ? await tmdb.getShow(tmdbId) : (await tmdb.searchShows(name))[0];
  if (!tmdbShow) return res.status(404).json({ error: `No TMDB match for "${name}"` });

  const progress = await lastAiredEpisode(tmdbShow.id, tmdbShow.number_of_seasons || 1);
  const newShow = {
    id: Date.now().toString(),
    name: tmdbShow.name,
    currentSeason: progress.currentSeason,
    currentEpisode: progress.currentEpisode,
    status: 'active',
    dateAdded: nowIso(),
    lastChecked: null,
    downloadedEpisodes: [],
    missedEpisodes: [],
    pendingEpisode: null,
    tmdbId: tmdbShow.id,
    tmdbName: tmdbShow.name,
    tmdbOverview: tmdbShow.overview || null,
    firstAirDate: tmdbShow.first_air_date || null,
    posterPath: tmdbShow.poster_path || null,
    nextEpisodeAirDate: null,
  };

  const duplicate = await store.update((data) => {
    const exists = data.shows.some((s) => s.tmdbId === newShow.tmdbId || s.name.toLowerCase() === newShow.name.toLowerCase());
    if (!exists) data.shows.push(newShow);
    return exists;
  });
  if (duplicate) return res.status(409).json({ error: 'Show is already being tracked' });

  // Find the next air date (and anything that slipped through) in the background.
  checkShow(newShow.id, 'added').catch((err) => console.error(`Initial check for ${newShow.name} failed:`, err.message));

  res.status(201).json({
    success: true,
    show: newShow,
    catchUpEpisodes: 0,
    message: `Tracking ${newShow.name} from ${epCode(newShow.currentSeason, newShow.currentEpisode + 1)}`,
  });
}));

const EDITABLE_FIELDS = ['status', 'currentSeason', 'currentEpisode', 'name'];

router.put('/:id', h(async (req, res) => {
  const updates = Object.fromEntries(
    Object.entries(req.body || {}).filter(([k]) => EDITABLE_FIELDS.includes(k)),
  );
  if (updates.status && !['active', 'paused'].includes(updates.status)) {
    return res.status(400).json({ error: 'status must be active or paused' });
  }
  for (const k of ['currentSeason', 'currentEpisode']) {
    if (k in updates) {
      updates[k] = parseInt(updates[k], 10);
      if (!Number.isFinite(updates[k]) || updates[k] < 0) return res.status(400).json({ error: `${k} must be a non-negative number` });
    }
  }

  const show = await patchShow(req.params.id, (s) => {
    Object.assign(s, updates);
    if ('currentSeason' in updates || 'currentEpisode' in updates) s.pendingEpisode = null;
  });
  if (!show) return res.status(404).json({ error: 'Show not found' });

  if (show.status === 'active') {
    scheduleShow(show);
    if (updates.status === 'active' || 'currentEpisode' in updates || 'currentSeason' in updates) {
      checkShow(show.id, 'updated').catch((err) => console.error(`Check for ${show.name} failed:`, err.message));
    }
  } else {
    clearShowTimer(show.id);
  }
  res.json({ success: true, show });
}));

router.delete('/:id', h(async (req, res) => {
  clearShowTimer(req.params.id);
  await store.update((data) => {
    data.shows = data.shows.filter((s) => s.id !== req.params.id);
  });
  res.json({ success: true });
}));

// Manual "check all now" — runs in the background; poll GET /check/status.
router.post('/check', (req, res) => {
  if (sweepRunning) return res.status(202).json({ success: true, started: false, running: true, message: 'A check is already running' });
  sweep('manual', { force: true }).catch((err) => console.error('Manual check failed:', err.message));
  res.status(202).json({ success: true, started: true, running: true, message: 'Checking all active shows in the background' });
});

router.get('/check/status', (req, res) => {
  res.json({ running: sweepRunning, lastSweep, inFlight: inFlight.size });
});

router.post('/download-season', h(async (req, res) => {
  const { tmdbId, showName } = req.body || {};
  const season = parseInt(req.body?.season, 10);
  if (!showName || !Number.isFinite(season) || season < 1) {
    return res.status(400).json({ error: 'Show name and season are required' });
  }
  if (!(await hasFreeSpace())) {
    return res.json({ success: false, message: 'Insufficient disk space (less than 5GB available)' });
  }
  const sessionId = startSeasonJob({ showName, season, tmdbId });
  res.json({ success: true, sessionId, message: 'Download started. Use the session ID to track progress.' });
}));

router.post('/:id/season/:season', h(async (req, res) => {
  const show = await getShowById(req.params.id);
  if (!show) return res.status(404).json({ error: 'Show not found' });
  const season = parseInt(req.params.season, 10);
  const startEpisode = parseInt(req.body?.startEpisode, 10) || 1;
  const endEpisode = parseInt(req.body?.endEpisode, 10) || 99;
  if (!(await hasFreeSpace())) {
    return res.json({ success: false, message: 'Insufficient disk space (less than 5GB available)' });
  }
  const sessionId = startSeasonJob({
    showName: show.name, season, tmdbId: show.tmdbId, startEpisode, endEpisode, tryPack: false,
  });
  res.json({ success: true, sessionId, message: `Searching ${show.name} S${pad(season)} E${startEpisode}–${endEpisode} in the background` });
}));

router.get('/download-progress/:sessionId', (req, res) => {
  res.json(downloadProgress.get(req.params.sessionId) || { status: 'not_found', message: 'Download session not found' });
});

// ─── Config ──────────────────────────────────────────────────────────────────
router.get('/config/tmdb', (req, res) => {
  res.json({
    configured: Boolean(getTmdbApiKey()),
    hasKey: Boolean(process.env.TMDB_API_KEY),
  });
});

router.post('/config/tmdb', h(async (req, res) => {
  const apiKey = req.body?.apiKey?.trim();
  if (!apiKey) return res.status(400).json({ error: 'API key is required' });
  try {
    await tmdb.tmdbGet('/configuration', {}, apiKey);
  } catch {
    return res.status(400).json({ error: 'TMDB rejected this API key' });
  }
  await updateConfig({ tmdbApiKey: apiKey });
  res.json({ success: true, message: 'TMDB API key saved on the server' });
}));

router.get('/search/:query', h(async (req, res) => {
  const { query } = req.params;
  if (!getTmdbApiKey()) return res.status(400).json({ error: 'TMDB API key not configured', results: [] });
  if (!query || query.length < 2) return res.json({ results: [] });
  const results = (await tmdb.searchShows(query)).slice(0, 10).map((show) => ({
    id: show.id,
    name: show.name,
    overview: show.overview,
    firstAirDate: show.first_air_date,
    posterPath: show.poster_path,
    voteAverage: show.vote_average,
  }));
  res.json({ results });
}));

router.get('/config/auto-check', (req, res) => {
  res.json({
    enabled: isAutoCheckEnabled(),
    scheduledChecks: timers.size,
    sweepIntervalHours: SWEEP_INTERVAL_MS / 3_600_000,
    retryWindowDays: MISS_AFTER_DAYS,
    lastSweep,
    type: 'targeted+sweep',
  });
});

router.post('/config/auto-check', h(async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  await updateConfig({ autoCheckEnabled: enabled });
  if (enabled) {
    sweep('enabled').catch((err) => console.error('Sweep failed:', err.message));
  } else {
    for (const id of [...timers.keys()]) clearShowTimer(id);
  }
  res.json({ success: true, enabled, message: enabled ? 'Automatic episode checking enabled' : 'Automatic episode checking disabled' });
}));

router.get('/queue/status', (req, res) => {
  res.json({ ...searchQueue.getStatus(), searchInterval: searchQueue.searchInterval / 1000 });
});

router.post('/queue/clear', (req, res) => {
  const clearedCount = searchQueue.clearQueue();
  res.json({ success: true, message: `Cleared ${clearedCount} items from search queue`, clearedCount });
});

export const stopShowTimers = () => {
  for (const id of [...timers.keys()]) clearShowTimer(id);
};

export default router;
