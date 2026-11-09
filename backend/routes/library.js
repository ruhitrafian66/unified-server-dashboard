/**
 * Media library / storage management.
 *
 * Scans LIBRARY_PATH (where qBittorrent downloads and Plex reads) and turns
 * each top-level entry — a single video file, a release folder, a season
 * pack or a multi-season box set — into one clean item:
 *   kind      movie | tv | leftover (release folder without video) | other
 *   title/year/seasons/quality parsed from the release name and file names
 *   episodes  grouped by season (TV), extras/subtitles counted separately
 *   torrent   the matching qBittorrent torrent, if any
 * Junk (macOS "._*" files, .DS_Store, orphaned qBittorrent ".parts", empty
 * folders) is reported separately and can be cleaned up in one go.
 *
 * Only media items (movie/tv/leftover, or anything with a torrent) can be
 * deleted. Other folders (personal files, app config) are read-only here.
 */
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { LIBRARY_PATH, DATA_DIR, getTmdbApiKey } from '../lib/config.js';
import { JsonStore } from '../lib/jsonStore.js';
import { tmdbGet } from '../lib/tmdb.js';
import { qbGet, qbPost } from './qbAuth.js';
import {
  VIDEO_EXT, SUBTITLE_EXT, parseRelease, episodeOf, hasReleaseMarkers,
} from '../lib/releaseName.js';

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ROOT = path.resolve(LIBRARY_PATH);
const SCAN_TTL_MS = 30_000;
const MAX_FILES_PER_ITEM = 20_000;
const SAMPLE = /(^|[\W_])sample([\W_]|$)/i;
const MIN_MOVIE_BYTES = 150 * 1024 * 1024;

const isJunkFile = (name) => name.startsWith('._') || ['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(name);
const PARTS = /^\.([0-9a-f]{40})\.parts$/i;
const junkReason = (name) => (path.basename(name).startsWith('._') || path.basename(name) === '.DS_Store'
  ? 'macOS metadata file'
  : 'Windows metadata file');

const encodeId = (name) => Buffer.from(name, 'utf8').toString('base64url');
const decodeId = (id) => Buffer.from(String(id), 'base64url').toString('utf8');

/** Absolute path of a top-level entry, refusing anything that escapes ROOT. */
const entryPath = (name) => {
  if (!name || name.includes('/') || name.includes('\0') || name === '.' || name === '..') return null;
  const full = path.resolve(ROOT, name);
  return path.dirname(full) === ROOT ? full : null;
};

// ─── Filesystem walk ─────────────────────────────────────────────────────────
const walk = async (dir, rel = '', out = { files: [], junk: [], truncated: false }) => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (out.files.length >= MAX_FILES_PER_ITEM) { out.truncated = true; break; }
    const abs = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      await walk(abs, relPath, out);
    } else if (e.isFile()) {
      const st = await fs.stat(abs).catch(() => null);
      if (!st) continue;
      if (isJunkFile(e.name)) out.junk.push({ rel: relPath, size: st.size });
      else out.files.push({ rel: relPath, size: st.size, mtime: st.mtimeMs });
    }
  }
  return out;
};

// ─── Torrent matching ────────────────────────────────────────────────────────
const loadTorrents = async () => {
  try {
    const { data } = await qbGet('/api/v2/torrents/info');
    return data;
  } catch {
    return null; // qBittorrent down: library still works, just without status
  }
};

const torrentsByTopLevel = (torrents) => {
  const map = new Map();
  for (const t of torrents || []) {
    const rel = path.posix.relative(t.save_path.replace(/\/$/, ''), t.content_path || '');
    const top = rel.split('/')[0];
    if (top && !top.startsWith('..')) map.set(top, t);
  }
  return map;
};

const torrentSummary = (t) => (t ? {
  hash: t.hash,
  state: t.state,
  progress: t.progress,
  ratio: Math.round((t.ratio || 0) * 100) / 100,
  dlspeed: t.dlspeed,
  eta: t.eta,
} : null);

// ─── Classification ──────────────────────────────────────────────────────────
const classify = (name, isFile, files, torrent) => {
  const parsed = parseRelease(name);
  const videos = files.filter((f) => VIDEO_EXT.has(path.extname(f.rel).toLowerCase()));
  const mainVideos = videos.filter((f) => !SAMPLE.test(f.rel));
  const episodes = [];
  const extras = [];
  for (const v of mainVideos) {
    const ep = episodeOf(v.rel);
    if (ep) episodes.push({ ...ep, file: v.rel, size: v.size });
    else extras.push(v);
  }
  const subtitles = files.filter((f) => SUBTITLE_EXT.has(path.extname(f.rel).toLowerCase())).length;
  const markers = hasReleaseMarkers(name);

  let kind;
  if (episodes.length > 0 || (parsed.seasons.length > 0 && mainVideos.length > 0)) {
    kind = 'tv';
  } else if (mainVideos.length > 0) {
    const big = mainVideos.filter((v) => v.size >= MIN_MOVIE_BYTES);
    // A folder full of loose videos with no release-style name is personal media.
    kind = (markers || big.length) && mainVideos.length <= 3 ? 'movie' : 'other';
  } else {
    kind = markers && !torrent ? 'leftover' : 'other';
  }

  // TV: fold episodes into seasons (dedupe repeated episode numbers).
  let seasons = [];
  if (kind === 'tv') {
    const bySeason = new Map();
    for (const e of episodes) {
      if (!bySeason.has(e.season)) bySeason.set(e.season, new Map());
      const s = bySeason.get(e.season);
      if (!s.has(e.episode) || s.get(e.episode).size < e.size) s.set(e.episode, e);
    }
    seasons = [...bySeason.entries()].sort((a, b) => a[0] - b[0]).map(([season, eps]) => {
      const list = [...eps.values()].sort((a, b) => a.episode - b.episode);
      return {
        season,
        episodes: list.map((e) => ({ episode: e.episode, file: e.file, size: e.size })),
        size: list.reduce((a, e) => a + e.size, 0),
      };
    });
    // Release name says S01 but files have no SxxEyy: one season of loose files.
    if (!seasons.length && parsed.seasons.length === 1) {
      seasons = [{
        season: parsed.seasons[0],
        episodes: mainVideos.map((v, i) => ({ episode: i + 1, file: v.rel, size: v.size })),
        size: mainVideos.reduce((a, v) => a + v.size, 0),
      }];
    }
  }

  const mainFile = kind === 'movie' ? mainVideos.sort((a, b) => b.size - a.size)[0] : null;

  return {
    kind,
    title: parsed.title,
    year: parsed.year,
    // Quality from the folder name, falling back to the main file name.
    quality: parsed.quality.length ? parsed.quality : parseRelease(mainFile?.rel || '').quality,
    seasons,
    episodeCount: seasons.reduce((a, s) => a + s.episodes.length, 0),
    // The release name promises seasons that aren't on disk (partial download/selection).
    missingSeasons: kind === 'tv' && seasons.length
      ? parsed.seasons.filter((n) => !seasons.some((s) => s.season === n))
      : [],
    extras: extras.filter((x) => kind === 'tv' || x !== mainFile).map((x) => ({ file: x.rel, size: x.size })),
    subtitles,
    videoCount: mainVideos.length,
    mainFile: mainFile ? { file: mainFile.rel, size: mainFile.size } : null,
  };
};

// ─── Posters (TMDB), cached on disk ─────────────────────────────────────────
const posterStore = new JsonStore(path.join(DATA_DIR, 'library-posters.json'), {}, { mode: 0o644 });
let posterCache = null;
const POSTER_MISS_TTL_MS = 3 * 24 * 3600 * 1000;

const lookupPoster = async (item) => {
  if (!['movie', 'tv'].includes(item.kind) || !getTmdbApiKey()) return null;
  posterCache ??= await posterStore.read().catch(() => ({}));
  const key = `${item.kind}|${item.title.toLowerCase()}|${item.year || ''}`;
  const hit = posterCache[key];
  if (hit && (hit.id || Date.now() - hit.at < POSTER_MISS_TTL_MS)) return hit;

  const search = async (withYear) => {
    const params = { query: item.title };
    if (withYear && item.year) params[item.kind === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = item.year;
    const data = await tmdbGet(`/search/${item.kind}`, params);
    return data.results?.[0];
  };
  try {
    const r = (await search(true)) || (item.year ? await search(false) : null);
    const entry = r
      ? { id: r.id, poster: r.poster_path, name: r.title || r.name, at: Date.now() }
      : { id: null, at: Date.now() };
    posterCache[key] = entry;
    posterStore.update((d) => { d[key] = entry; }).catch(() => {});
    return entry;
  } catch {
    return null;
  }
};

const mapLimit = async (list, limit, fn) => {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx]);
    }
  }));
  return out;
};

// ─── Scan ────────────────────────────────────────────────────────────────────
let scanCache = null;
let scanInFlight = null;

const scanLibrary = async () => {
  const torrents = await loadTorrents();
  const byTop = torrentsByTopLevel(torrents);
  const torrentHashes = new Set((torrents || []).map((t) => t.hash.toLowerCase()));

  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const items = [];
  const junk = [];

  for (const e of entries) {
    const abs = path.join(ROOT, e.name);
    if (e.isSymbolicLink()) continue;

    if (e.isFile()) {
      const st = await fs.stat(abs).catch(() => null);
      if (!st) continue;
      const parts = e.name.match(PARTS);
      if (isJunkFile(e.name) || (parts && !torrentHashes.has(parts[1].toLowerCase()) && torrents)) {
        junk.push({ name: e.name, size: st.size, reason: parts ? 'Orphaned qBittorrent .parts file' : junkReason(e.name) });
        continue;
      }
      if (parts) continue; // belongs to a live torrent
      const files = [{ rel: e.name, size: st.size, mtime: st.mtimeMs }];
      const torrent = byTop.get(e.name);
      items.push({ name: e.name, isFile: true, size: st.size, mtime: st.mtimeMs, files, nestedJunk: [], torrent });
      continue;
    }

    if (!e.isDirectory()) continue;
    const torrent = byTop.get(e.name);
    // Only a literally empty folder is junk (one with empty sub-folders may be in use).
    if (!torrent && (await fs.readdir(abs).catch(() => [null])).length === 0) {
      junk.push({ name: e.name, size: 0, reason: 'Empty folder' });
      continue;
    }
    const { files, junk: nested, truncated } = await walk(abs);
    const st = await fs.stat(abs).catch(() => null);
    items.push({
      name: e.name,
      isFile: false,
      size: files.reduce((a, f) => a + f.size, 0),
      mtime: Math.max(st?.mtimeMs || 0, ...files.slice(0, 5000).map((f) => f.mtime)),
      files,
      nestedJunk: nested,
      truncated,
      torrent,
    });
  }

  const classified = items.map((it) => {
    const c = classify(it.name, it.isFile, it.files, it.torrent);
    return {
      id: encodeId(it.name),
      name: it.name,
      isFile: it.isFile,
      size: it.size,
      modified: new Date(it.mtime).toISOString(),
      fileCount: it.files.length,
      truncated: Boolean(it.truncated),
      ...c,
      torrent: torrentSummary(it.torrent),
      deletable: c.kind !== 'other' || Boolean(it.torrent),
      _nestedJunk: it.nestedJunk,
    };
  });

  // Duplicate movies/shows (same title + year), e.g. a 4K DV and a 4K SDR copy.
  const groups = new Map();
  for (const it of classified.filter((i) => i.kind === 'movie' || i.kind === 'tv')) {
    const key = `${it.kind}|${it.title.toLowerCase()}|${it.year || ''}`;
    groups.set(key, [...(groups.get(key) || []), it.id]);
  }
  for (const it of classified) {
    const key = `${it.kind}|${it.title.toLowerCase()}|${it.year || ''}`;
    const ids = groups.get(key);
    it.duplicateOf = ids && ids.length > 1 ? ids.filter((x) => x !== it.id) : [];
  }

  await mapLimit(classified, 4, async (it) => {
    const p = await lookupPoster(it);
    it.poster = p?.poster || null;
    it.tmdbId = p?.id || null;
  });

  // Nested junk (e.g. "._file.mkv" inside release folders) counts toward
  // cleanup — but never inside protected (non-media) folders.
  const nestedJunk = classified
    .filter((it) => it.deletable)
    .flatMap((it) => it._nestedJunk.map((j) => ({ name: `${it.name}/${j.rel}`, size: j.size, reason: junkReason(j.rel) })));
  for (const it of classified) delete it._nestedJunk;

  let disk = null;
  try {
    const s = await fs.statfs(ROOT);
    disk = { size: s.blocks * s.bsize, available: s.bavail * s.bsize, used: (s.blocks - s.bfree) * s.bsize };
  } catch { /* ignore */ }

  const allJunk = [...junk, ...nestedJunk];
  return {
    root: ROOT,
    scannedAt: new Date().toISOString(),
    torrentsAvailable: Boolean(torrents),
    disk,
    items: classified.sort((a, b) => b.size - a.size),
    junk: { count: allJunk.length, size: allJunk.reduce((a, j) => a + j.size, 0), items: allJunk.slice(0, 200) },
  };
};

const getScan = async ({ refresh = false } = {}) => {
  if (!refresh && scanCache && Date.now() - scanCache.at < SCAN_TTL_MS) return scanCache.data;
  if (!scanInFlight) {
    scanInFlight = scanLibrary()
      .then((data) => { scanCache = { at: Date.now(), data }; return data; })
      .finally(() => { scanInFlight = null; });
  }
  return scanInFlight;
};

const invalidate = () => { scanCache = null; };

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/', h(async (req, res) => {
  const data = await getScan({ refresh: req.query.refresh === '1' });
  // The list view doesn't need every episode file; the detail route has them.
  res.json({
    ...data,
    items: data.items.map(({ seasons, extras, ...rest }) => ({
      ...rest,
      seasonNumbers: seasons.map((s) => s.season),
      extrasCount: extras.length,
    })),
  });
}));

router.get('/items/:id', h(async (req, res) => {
  const data = await getScan();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found (it may have been moved or deleted)' });
  res.json(item);
}));

router.delete('/items/:id', h(async (req, res) => {
  const name = decodeId(req.params.id);
  const abs = entryPath(name);
  if (!abs) return res.status(400).json({ error: 'Invalid item' });

  const data = await getScan({ refresh: true });
  const item = data.items.find((i) => i.name === name);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!item.deletable) {
    return res.status(403).json({ error: 'This folder is not media; manage it over the file share instead.' });
  }

  if (item.torrent) {
    // Remove from qBittorrent first so it doesn't re-check or re-download.
    await qbPost('/api/v2/torrents/delete', { hashes: item.torrent.hash, deleteFiles: 'true' });
    await new Promise((r) => setTimeout(r, 1500));
  }
  await fs.rm(abs, { recursive: true, force: true });
  invalidate();
  console.log(`🗑️ Library: deleted "${name}" (${(item.size / 2 ** 30).toFixed(2)} GiB)${item.torrent ? ' + torrent' : ''}`);
  res.json({ success: true, freed: item.size, removedTorrent: Boolean(item.torrent) });
}));

router.post('/cleanup', h(async (req, res) => {
  const data = await getScan({ refresh: true });
  let removed = 0;
  let freed = 0;
  for (const j of data.junk.items) {
    const [top, ...rest] = j.name.split('/');
    const base = entryPath(top);
    if (!base) continue;
    const target = rest.length ? path.resolve(base, ...rest) : base;
    if (!target.startsWith(`${ROOT}${path.sep}`)) continue;
    try {
      await fs.rm(target, { recursive: !rest.length, force: true });
      removed += 1;
      freed += j.size;
    } catch (err) {
      console.error(`Cleanup failed for ${j.name}:`, err.message);
    }
  }
  invalidate();
  res.json({ success: true, removed, freed });
}));

export default router;
