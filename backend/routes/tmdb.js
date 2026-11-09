/**
 * Read-only TMDB proxy.
 *
 * The browser calls /api/tmdb/<path> and the server adds its API key, so the
 * key lives in one place (backend/.env or Settings) instead of in every
 * device's localStorage. Only a small allow-list of GET paths is forwarded.
 */
import express from 'express';
import { tmdbGet } from '../lib/tmdb.js';

const router = express.Router();

const ALLOWED = [
  /^trending\/(tv|movie|all)\/(day|week)$/,
  /^search\/(tv|movie|multi)$/,
  /^(tv|movie)\/\d+$/,
  /^tv\/\d+\/season\/\d+$/,
];

const ALLOWED_PARAMS = new Set(['query', 'page', 'append_to_response', 'language', 'include_adult']);

// Tiny in-memory cache: trending/detail pages are requested repeatedly.
const cache = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;

router.get(/^\/(.+)$/, async (req, res, next) => {
  const tmdbPath = req.params[0];
  if (!ALLOWED.some((re) => re.test(tmdbPath))) {
    return res.status(404).json({ error: 'Unsupported TMDB path' });
  }
  const params = Object.fromEntries(
    Object.entries(req.query).filter(([k, v]) => ALLOWED_PARAMS.has(k) && typeof v === 'string'),
  );
  const key = `${tmdbPath}?${new URLSearchParams(params)}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return res.json(hit.data);

  try {
    const data = await tmdbGet(`/${tmdbPath}`, params);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    res.json(data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({
        error: err.response.data?.status_message || 'TMDB request failed',
      });
    }
    next(err);
  }
});

export default router;
