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

export const authenticate = async (forceNew = false) => {
  if (sessionCookie && sessionExpiry && Date.now() < sessionExpiry && !forceNew) {
    return sessionCookie;
  }

  try {
    const serverUrl = getServerUrl();
    const username  = process.env.QBITTORRENT_USERNAME || 'admin';
    const password  = process.env.QBITTORRENT_PASSWORD;

    const response = await axios.post(
      `${serverUrl}/api/v2/auth/login`,
      `username=${username}&password=${password}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      }
    );

    if (response.headers['set-cookie']) {
      sessionCookie = response.headers['set-cookie'][0];
      sessionExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      return sessionCookie;
    }
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
    if ([401, 403, 404].includes(error.response?.status) && retryCount === 0) {
      sessionCookie = null;
      sessionExpiry = null;
      return makeRequest(method, url, data, 1);
    }
    throw error;
  }
};
