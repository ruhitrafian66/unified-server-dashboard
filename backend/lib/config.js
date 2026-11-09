/**
 * Shared paths + persisted app settings (DATA_DIR/config.json).
 *
 * config.json may contain keys written by other tools; updates MERGE into the
 * file and never drop keys this app doesn't know about.
 */
import path from 'path';
import { JsonStore } from './jsonStore.js';

export const DATA_DIR = process.env.DATA_DIR || '/opt/server-dashboard/data';
export const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || '/mnt/storage';
// Folder qBittorrent downloads into and Plex reads from (host path).
export const LIBRARY_PATH = process.env.LIBRARY_PATH || '/mnt/storage/Server';

const configStore = new JsonStore(path.join(DATA_DIR, 'config.json'), {});

let cache = {};

export const loadConfig = async () => {
  try {
    cache = await configStore.read();
  } catch (err) {
    console.error('Could not read config.json:', err.message);
  }
  return cache;
};

export const getConfig = () => cache;

export const updateConfig = async (patch) => {
  cache = await configStore.update((cfg) => {
    Object.assign(cfg, patch);
    return { ...cfg };
  });
  return cache;
};

export const getTmdbApiKey = () => cache.tmdbApiKey || process.env.TMDB_API_KEY || null;

// Automatic episode checking is on unless explicitly turned off.
export const isAutoCheckEnabled = () => cache.autoCheckEnabled !== false;
