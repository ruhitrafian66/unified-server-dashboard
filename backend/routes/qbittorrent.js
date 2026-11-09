import express from 'express';
import { qbGet, qbPost, addTorrentUrl } from './qbAuth.js';

const router = express.Router();

// Wraps async handlers so errors reach the central error handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Search logs (in-memory, diagnostic only) ────────────────────────────────
let searchLogs = [];
const MAX_LOGS = 100;

const addSearchLog = (pattern, plugins, category, status, error = null) => {
  const entry = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    pattern,
    plugins: plugins || 'enabled',
    category: category || 'all',
    status,
    searchId: null,
    resultCount: 0,
    error,
    duration: null,
  };
  searchLogs.unshift(entry);
  if (searchLogs.length > MAX_LOGS) searchLogs.length = MAX_LOGS;
  return entry;
};

const finishLog = (searchId, patch) => {
  const entry = searchLogs.find((l) => l.searchId === searchId);
  if (!entry || entry.status === 'completed') return;
  Object.assign(entry, patch, { duration: Date.now() - new Date(entry.timestamp).getTime() });
};

router.get('/search/logs', (req, res) => {
  const limit = Math.min(MAX_LOGS, parseInt(req.query.limit, 10) || 50);
  res.json({ logs: searchLogs.slice(0, limit), total: searchLogs.length, limit });
});

router.delete('/search/logs', (req, res) => {
  const clearedCount = searchLogs.length;
  searchLogs = [];
  res.json({ success: true, message: `Cleared ${clearedCount} log entries`, clearedCount });
});

// ─── Torrents ────────────────────────────────────────────────────────────────
router.get('/torrents', h(async (req, res) => {
  const response = await qbGet('/api/v2/torrents/info');
  res.json(response.data);
}));

router.get('/transfer', h(async (req, res) => {
  const response = await qbGet('/api/v2/transfer/info');
  res.json(response.data);
}));

const addHandler = h(async (req, res) => {
  const { urls, savepath } = req.body || {};
  if (typeof urls !== 'string' || !urls.trim()) {
    return res.status(400).json({ error: 'No torrent URL provided' });
  }
  const ok = await addTorrentUrl(urls.trim(), { savepath });
  if (!ok) {
    return res.status(400).json({
      error: 'Torrent rejected',
      details: 'qBittorrent rejected the link: it is invalid, unavailable, or already added.',
    });
  }
  res.json({ success: true });
});

// Both paths kept for compatibility with older clients.
router.post('/torrents/add', addHandler);
router.post('/torrents/add-advanced', addHandler);

// Frontend action → qBittorrent v5 endpoint. Anything else is rejected.
const TORRENT_ACTIONS = {
  pause: 'stop',
  stop: 'stop',
  resume: 'start',
  start: 'start',
  delete: 'delete',
  recheck: 'recheck',
  reannounce: 'reannounce',
};

router.post('/torrents/:action', h(async (req, res) => {
  const qbAction = TORRENT_ACTIONS[req.params.action];
  if (!qbAction) return res.status(400).json({ error: `Unknown action '${req.params.action}'` });

  const { hashes, deleteFiles } = req.body || {};
  if (typeof hashes !== 'string' || !/^(all|[a-fA-F0-9|]+)$/.test(hashes)) {
    return res.status(400).json({ error: 'Invalid torrent hashes' });
  }

  const form = { hashes };
  if (qbAction === 'delete') form.deleteFiles = deleteFiles === false ? 'false' : 'true';

  await qbPost(`/api/v2/torrents/${qbAction}`, form);
  res.json({ success: true });
}));

// ─── Search ──────────────────────────────────────────────────────────────────
router.get('/search/plugins', h(async (req, res) => {
  const response = await qbGet('/api/v2/search/plugins');
  res.json(response.data);
}));

router.post('/search/start', h(async (req, res) => {
  const { pattern, plugins, category } = req.body || {};
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return res.status(400).json({ error: 'Search pattern is required' });
  }
  const log = addSearchLog(pattern, plugins, category, 'started');
  try {
    const response = await qbPost('/api/v2/search/start', {
      pattern: pattern.trim(),
      plugins: plugins || 'enabled',
      category: category || 'all',
    });
    log.searchId = response.data.id;
    log.status = 'running';
    res.json(response.data);
  } catch (err) {
    log.status = 'failed';
    log.error = err.message;
    throw err;
  }
}));

router.get('/search/status/:id', h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const response = await qbGet('/api/v2/search/status', { id });
    res.json(response.data);
  } catch (err) {
    // 404: the job finished or expired — report "no active search".
    if (err.response?.status === 404) return res.json([]);
    throw err;
  }
}));

router.get('/search/results/:id', h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const params = { id };
  if (req.query.limit) params.limit = parseInt(req.query.limit, 10);
  if (req.query.offset) params.offset = parseInt(req.query.offset, 10);
  try {
    const response = await qbGet('/api/v2/search/results', params);
    if (response.data.status === 'Stopped') {
      finishLog(id, { status: 'completed', resultCount: response.data.total ?? response.data.results?.length ?? 0 });
    }
    res.json(response.data);
  } catch (err) {
    finishLog(id, { status: 'failed', error: err.message });
    throw err;
  }
}));

router.post('/search/stop', h(async (req, res) => {
  const id = parseInt(req.body?.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Search id is required' });
  try {
    await qbPost('/api/v2/search/stop', { id });
  } catch (err) {
    if (err.response?.status !== 404) throw err;
  }
  res.json({ success: true });
}));

// ─── Auto-stop seeding ───────────────────────────────────────────────────────
// Backed by qBittorrent's own share limits, so it works whether or not the
// dashboard is open or running, and survives restarts of either service.
const MAX_RATIO_ACT_STOP = 0;

const readShareLimits = async () => {
  const { data: p } = await qbGet('/api/v2/app/preferences');
  return {
    enabled: Boolean(p.max_ratio_enabled || p.max_seeding_time_enabled),
    ratioLimit: p.max_ratio_enabled ? p.max_ratio : null,
    seedTimeLimit: p.max_seeding_time_enabled ? p.max_seeding_time : null,
    action: p.max_ratio_act === MAX_RATIO_ACT_STOP ? 'stop' : 'other',
    source: 'qbittorrent',
  };
};

router.get('/auto-stop/config', h(async (req, res) => {
  res.json(await readShareLimits());
}));

router.post('/auto-stop/config', h(async (req, res) => {
  const { enabled } = req.body || {};
  const ratio = parseFloat(req.body?.ratioLimit);
  const minutes = parseInt(req.body?.seedTimeLimit, 10);

  const ratioOn = Boolean(enabled) && Number.isFinite(ratio) && ratio >= 0;
  // Enabled with no ratio and no time = stop as soon as the download completes.
  const timeOn = Boolean(enabled) && (Number.isFinite(minutes) ? minutes >= 0 : !ratioOn);

  const prefs = {
    max_ratio_enabled: ratioOn,
    max_seeding_time_enabled: timeOn,
    max_ratio_act: MAX_RATIO_ACT_STOP,
  };
  if (ratioOn) prefs.max_ratio = ratio;
  if (timeOn) prefs.max_seeding_time = Number.isFinite(minutes) ? minutes : 0;

  await qbPost('/api/v2/app/setPreferences', { json: JSON.stringify(prefs) });
  const config = await readShareLimits();
  res.json({
    success: true,
    config,
    message: config.enabled ? 'Seeding limits saved in qBittorrent' : 'Seeding limits disabled',
  });
}));

export default router;
