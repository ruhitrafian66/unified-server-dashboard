/**
 * Thin TMDB client used by the shows automation and the /api/tmdb proxy.
 * Every request has a timeout, so a slow TMDB can never stall the search queue.
 */
import axios from 'axios';
import { getTmdbApiKey } from './config.js';

const client = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  timeout: 10_000,
});

export class TmdbNotConfiguredError extends Error {
  constructor() {
    super('TMDB API key not configured');
    this.status = 400;
  }
}

export const tmdbGet = async (urlPath, params = {}, apiKey = getTmdbApiKey()) => {
  if (!apiKey) throw new TmdbNotConfiguredError();
  const res = await client.get(urlPath, { params: { ...params, api_key: apiKey } });
  return res.data;
};

/** Returns the episode, or null if TMDB says it doesn't exist (404). Throws on other errors. */
export const getEpisode = async (tmdbId, season, episode) => {
  try {
    return await tmdbGet(`/tv/${tmdbId}/season/${season}/episode/${episode}`);
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

export const getShow = (tmdbId) => tmdbGet(`/tv/${tmdbId}`);

export const getSeason = async (tmdbId, season) => {
  try {
    return await tmdbGet(`/tv/${tmdbId}/season/${season}`);
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

export const searchShows = async (query) => {
  const data = await tmdbGet('/search/tv', { query });
  return data.results || [];
};
