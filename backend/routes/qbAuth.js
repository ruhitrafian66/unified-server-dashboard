/**
 * Shared qBittorrent Web API client.
 *
 * One session cookie, one login in flight at a time, and a back-off when
 * qBittorrent bans our IP. qBittorrent bans an IP for `web_ui_ban_duration`
 * (1h by default) after `web_ui_max_auth_fail_count` failed logins, so we must
 * never fire parallel logins with bad credentials.
 */
import axios from 'axios';

export const getServerUrl = () =>
  (process.env.QBITTORRENT_URL || 'http://localhost:8080').replace(/\/$/, '');

let sessionCookie = null;
let sessionExpiry = 0;
let loginInFlight = null;

let banUntil = 0;
const BAN_BACKOFF_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;

export class QbUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 503;
  }
}

const login = async () => {
  const serverUrl = getServerUrl();
  const body = new URLSearchParams({
    username: process.env.QBITTORRENT_USERNAME || 'admin',
    password: process.env.QBITTORRENT_PASSWORD || '',
  });

  const response = await axios.post(`${serverUrl}/api/v2/auth/login`, body, {
    headers: {
      // qBittorrent v5+ CSRF check: Referer/Origin must match the WebUI host.
      Referer: serverUrl,
      Origin: serverUrl,
    },
    timeout: 5000,
    maxRedirects: 0,
    validateStatus: () => true,
  });

  if (response.status === 403) {
    banUntil = Date.now() + BAN_BACKOFF_MS;
    console.error(`qBittorrent login: IP banned (403); backing off ${BAN_BACKOFF_MS / 1000}s`);
    return null;
  }
  if (response.status === 401 || response.data === 'Fails.') {
    console.error('qBittorrent login: wrong username or password');
    return null;
  }

  const cookie = response.headers['set-cookie']?.[0]?.split(';')[0];
  if (cookie) {
    sessionCookie = cookie;
    sessionExpiry = Date.now() + SESSION_TTL_MS;
    banUntil = 0;
    return cookie;
  }

  // No cookie but 200 "Ok." means auth is bypassed for our subnet (whitelist).
  if (response.status === 200) return null;

  console.error(`qBittorrent login: unexpected status ${response.status}`);
  return null;
};

export const authenticate = async (forceNew = false) => {
  if (!forceNew && sessionCookie && Date.now() < sessionExpiry) return sessionCookie;
  if (Date.now() < banUntil) return null;

  if (!loginInFlight) {
    loginInFlight = login()
      .catch((err) => {
        console.error('qBittorrent login error:', err.message);
        return null;
      })
      .finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
};

const toBody = (data) => {
  if (data == null) return undefined;
  if (typeof data === 'string' || data instanceof URLSearchParams) return data;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  return params;
};

/**
 * Make an authenticated request. `url` may be absolute or an /api/v2 path.
 * `data` may be a plain object (form-encoded for you), URLSearchParams or a string.
 */
export const makeRequest = async (method, url, data = null, retryCount = 0, { timeout = 10_000 } = {}) => {
  const fullUrl = url.startsWith('http') ? url : `${getServerUrl()}${url}`;
  const cookie = await authenticate();
  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie && { Cookie: cookie }),
    },
    timeout,
  };

  try {
    return method === 'GET'
      ? await axios.get(fullUrl, config)
      : await axios.post(fullUrl, toBody(data), config);
  } catch (error) {
    const status = error.response?.status;
    if ([401, 403].includes(status) && retryCount === 0 && Date.now() >= banUntil) {
      sessionCookie = null;
      sessionExpiry = 0;
      return makeRequest(method, url, data, 1, { timeout });
    }
    if (!error.response) {
      throw new QbUnavailableError(`qBittorrent unreachable at ${getServerUrl()} (${error.code || error.message})`);
    }
    throw error;
  }
};

export const qbGet = (path, params) =>
  makeRequest('GET', params ? `${path}?${new URLSearchParams(params)}` : path);

export const qbPost = (path, data) => makeRequest('POST', path, data);

/** Add a torrent by magnet/URL with the dashboard's standard options. */
export const addTorrentUrl = async (url, { savepath, category } = {}) => {
  try {
    const res = await qbPost('/api/v2/torrents/add', {
      urls: url,
      sequentialDownload: 'true',
      firstLastPiecePrio: 'true',
      savepath: savepath?.trim() || undefined,
      category: category || undefined,
    });
    // qBittorrent < 5 answers 200 "Fails." for a rejected torrent.
    return !(typeof res.data === 'string' && res.data.trim() === 'Fails.');
  } catch (err) {
    // qBittorrent 5.x answers 409/415 for an invalid or duplicate torrent.
    if ([400, 409, 415].includes(err.response?.status)) return false;
    throw err;
  }
};
