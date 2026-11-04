/**
 * Shared qBittorrent authentication helper.
 * Both qbittorrent.js and shows.js import from here so there is
 * one session cookie, one expiry timer, and one retry strategy.
 */
import axios from 'axios';

export const getServerUrl = () =>
  process.env.QBITTORRENT_URL || 'http://localhost:8080';

let sessionCookie = null;
let sessionExpiry = null;

// Ban backoff: if qBittorrent returns 403 (IP banned), stop retrying for a
// while so we don't extend the ban window with repeated failed attempts.
let banUntil = 0;
const BAN_BACKOFF_MS = 60 * 1000; // wait 60s before retrying after a ban

export const authenticate = async (forceNew = false) => {
  if (sessionCookie && sessionExpiry && Date.now() < sessionExpiry && !forceNew) {
    return sessionCookie;
  }

  // Don't hammer qBittorrent while we know we're banned
  if (Date.now() < banUntil) {
    const remaining = Math.ceil((banUntil - Date.now()) / 1000);
    console.error(`qBittorrent auth skipped: IP still banned, retrying in ${remaining}s`);
    return null;
  }

  try {
    const serverUrl = getServerUrl();
    const username  = process.env.QBITTORRENT_USERNAME || 'admin';
    const password  = process.env.QBITTORRENT_PASSWORD;

    const response = await axios.post(
      `${serverUrl}/api/v2/auth/login`,
      `username=${username}&password=${password}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // qBittorrent v5+ requires Referer/Origin to match the WebUI host
          // to prevent CSRF. Without these the login returns 403.
          'Referer': serverUrl,
          'Origin': serverUrl,
        },
        timeout: 5000,
        maxRedirects: 0,
        // Accept all statuses so we can inspect 403 (banned) without throwing
        validateStatus: () => true,
      }
    );

    if (response.status === 403) {
      banUntil = Date.now() + BAN_BACKOFF_MS;
      console.error(`qBittorrent auth error: IP banned (403), backing off for ${BAN_BACKOFF_MS / 1000}s`);
      return null;
    }

    if (response.status === 401) {
      console.error('qBittorrent auth error: wrong username or password (401)');
      return null;
    }

    if (response.headers['set-cookie']) {
      sessionCookie = response.headers['set-cookie'][0];
      sessionExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      banUntil = 0; // clear any previous ban state on success
      return sessionCookie;
    }

    console.error(`qBittorrent auth error: no cookie in response (status ${response.status})`);
  } catch (error) {
    console.error('qBittorrent auth error:', error.message);
  }

  return null;
};

export const makeRequest = async (method, url, data = null, retryCount = 0) => {
  const cookie = await authenticate();
  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie && { Cookie: cookie }),
    },
    timeout: 10000,
  };

  try {
    return method === 'GET'
      ? await axios.get(url, config)
      : await axios.post(url, data, config);
  } catch (error) {
    if ([401, 403].includes(error.response?.status) && retryCount === 0) {
      sessionCookie = null;
      sessionExpiry = null;
      return makeRequest(method, url, data, 1);
    }
    throw error;
  }
};
