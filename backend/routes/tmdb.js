/**
 * Read-only TMDB proxy.
 *
 * The browser calls /api/tmdb/<path> and the server adds its API key, so the
 * key lives in one place (backend/.env or Settings) instead of in every
 * device's localStorage. Only a small allow-list of GET paths is forwarded,
 * plus a curated "new on streaming" movie list.
 */
import express from 'express';
import { tmdbGet } from '../lib/tmdb.js';

const router = express.Router();

// A film counts as "new" if its first digital release is within this window.
const NEW_ON_DIGITAL_DAYS = parseInt(process.env.NEW_ON_DIGITAL_DAYS, 10) || 120;

const ALLOWED = [
  /^trending\/(tv|movie|all)\/(day|week)$/,
  /^search\/(tv|movie|multi)$/,
  /^(tv|movie)\/\d+$/,
  /^tv\/\d+\/season\/\d+$/,
];

const ALLOWED_PARAMS = new Set(['query', 'page', 'append_to_response', 'language', 'include_adult']);

// Tiny in-memory cache: list/detail pages are requested repeatedly.
const cache = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;

const cachedGet = async (tmdbPath, params = {}) => {
  const key = `${tmdbPath}?${new URLSearchParams(params)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await tmdbGet(`/${tmdbPath}`, params);
  cache.set(key, { at: Date.now(), data });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return data;
};

const sendTmdbError = (err, res, next) => {
  if (err.response) {
    return res.status(err.response.status).json({
      error: err.response.data?.status_message || 'TMDB request failed',
    });
  }
  return next(err);
};

const isoDate = (d) => d.toISOString().slice(0, 10);

/**
 * Movies newly out on streaming/digital: TMDB lists a digital release
 * (release type 4) in any country within the last NEW_ON_DIGITAL_DAYS days,
 * dated today or earlier. Films that are still theatrical-only have no
 * digital date yet, or one in the future (e.g. Clayface, The Odyssey), so
 * they're excluded.
 *
 * Deliberately NOT filtered by watch providers: TMDB lists pre-orders as
 * providers (Clayface shows one in CA while still in cinemas).
 */
router.get('/movies/streaming', async (req, res, next) => {
  const page = Math.min(500, Math.max(1, parseInt(req.query.page, 10) || 1));
  const today = new Date();
  const from = new Date(today.getTime() - NEW_ON_DIGITAL_DAYS * 86_400_000);
  try {
    const data = await cachedGet('discover/movie', {
      with_release_type: '4',
      'release_date.gte': isoDate(from),
      'release_date.lte': isoDate(today),
      include_adult: 'false',
      sort_by: 'popularity.desc',
      page: String(page),
    });
    res.json({ ...data, windowDays: NEW_ON_DIGITAL_DAYS });
  } catch (err) {
    sendTmdbError(err, res, next);
  }
});

router.get(/^\/(.+)$/, async (req, res, next) => {
  const tmdbPath = req.params[0];
  if (!ALLOWED.some((re) => re.test(tmdbPath))) {
    return res.status(404).json({ error: 'Unsupported TMDB path' });
  }
  const params = Object.fromEntries(
    Object.entries(req.query).filter(([k, v]) => ALLOWED_PARAMS.has(k) && typeof v === 'string'),
  );
  try {
    res.json(await cachedGet(tmdbPath, params));
  } catch (err) {
    sendTmdbError(err, res, next);
  }
});

export default router;
