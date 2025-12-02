import express from 'express';
import axios from 'axios';

const router = express.Router();

// Get server URL from environment or use localhost (qBittorrent runs on same server)
const getServerUrl = () => {
  return process.env.QBITTORRENT_URL || 'http://localhost:8080';
};

// Session cookie storage with expiry tracking
let sessionCookie = null;
let sessionExpiry = null;

// Authenticate with qBittorrent
const authenticate = async (forceNew = false) => {
  // Check if we have a valid session (not expired)
  if (sessionCookie && sessionExpiry && Date.now() < sessionExpiry && !forceNew) {
    return sessionCookie;
  }
  
  try {
    const serverUrl = getServerUrl();
    const username = process.env.QBITTORRENT_USERNAME || 'admin';
    const password = process.env.QBITTORRENT_PASSWORD || 'adminadmin';
    
    console.log('Authenticating with qBittorrent...');
    
    const response = await axios.post(
      `${serverUrl}/api/v2/auth/login`,
      `username=${username}&password=${password}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      }
    );
    
    console.log('Auth response status:', response.status);
    console.log('Auth response headers:', response.headers);
    console.log('Auth response data:', response.data);
    
    if (response.headers['set-cookie']) {
      sessionCookie = response.headers['set-cookie'][0];
      // Set expiry to 10 minutes from now (qBittorrent default is 15 minutes)
      sessionExpiry = Date.now() + (10 * 60 * 1000);
      console.log('Got session cookie:', sessionCookie);
      console.log('Session expires at:', new Date(sessionExpiry).toISOString());
      return sessionCookie;
    }
    
    console.log('No set-cookie header in response');
  } catch (error) {
    console.error('Authentication error:', error.message, error.response?.status);
  }
  
  return null;
};

// Get headers with authentication
const getHeaders = async () => {
  const cookie = await authenticate();
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(cookie && { 'Cookie': cookie })
  };
};

// Make authenticated request with automatic retry on auth failure
const makeAuthenticatedRequest = async (method, url, data = null, retryCount = 0) => {
  const cookie = await authenticate();
  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie && { 'Cookie': cookie })
    },
    timeout: 5000
  };
  
  try {
    if (method === 'GET') {
      return await axios.get(url, config);
    } else {
      return await axios.post(url, data, config);
    }
  } catch (error) {
    // If we get 401/403/404 and haven't retried yet, re-authenticate and try again
    if ([401, 403, 404].includes(error.response?.status) && retryCount === 0) {
      console.log('Auth may have expired, re-authenticating...');
      sessionCookie = null;
      sessionExpiry = null;
      return makeAuthenticatedRequest(method, url, data, 1);
    }
    throw error;
  }
};

// Get torrent list
router.get('/torrents', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const cookie = await authenticate();
    
    const response = await axios.get(`${serverUrl}/api/v2/torrents/info`, {
      headers: cookie ? { 'Cookie': cookie } : {},
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message, serverUrl: getServerUrl() });
  }
});

// Add torrent
router.post('/torrents/add', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { urls } = req.body;
    
    if (!urls || urls.trim() === '') {
      return res.status(400).json({ error: 'No torrent URL provided' });
    }
    
    const headers = await getHeaders();
    
    console.log('Adding torrent:', urls.substring(0, 50) + '...');
    
    // Use URLSearchParams which properly handles encoding
    // This ensures & characters in the magnet URL are treated as part of the value
    const params = new URLSearchParams();
    params.set('urls', urls);
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      params,
      { 
        headers,
        timeout: 10000
      }
    );
    
    console.log('qBittorrent response:', response.status, response.data);
    
    // Check if qBittorrent returned "Fails." which means the torrent was rejected
    if (response.data === 'Fails.') {
      return res.status(400).json({ 
        error: 'Invalid torrent link',
        details: 'The magnet link or torrent URL is not valid. Please check the link and try again.'
      });
    }
    
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error adding torrent:', error.response?.status, error.response?.data, error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.message,
      details: error.response?.data,
      status: error.response?.status
    });
  }
});

// Add torrent with advanced options (must come before /:action route)
router.post('/torrents/add-advanced', async (req, res) => {
  console.log('=== ADD-ADVANCED ENDPOINT HIT ===');
  console.log('Request body:', req.body);
  
  try {
    const serverUrl = getServerUrl();
    console.log('Server URL:', serverUrl);
    
    const { urls, savepath, sequentialDownload } = req.body;
    
    // Validate that we have a URL
    if (!urls || urls.trim() === '') {
      console.log('ERROR: No torrent URL provided');
      return res.status(400).json({ error: 'No torrent URL provided' });
    }
    
    const headers = await getHeaders();
    
    // Build body components - don't encode the magnet URL itself
    const bodyComponents = [`urls=${urls}`];
    
    if (savepath && savepath.trim() !== '') {
      bodyComponents.push(`savepath=${encodeURIComponent(savepath)}`);
    }
    
    if (sequentialDownload) {
      bodyComponents.push('sequentialDownload=true');
    }
    
    const body = bodyComponents.join('&');
    
    console.log('Adding torrent with body:', body.substring(0, 100) + '...');
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      body,
      { 
        headers,
        timeout: 10000
      }
    );
    
    console.log('qBittorrent response:', response.status, response.data);
    
    // Check if qBittorrent returned "Fails." which means the torrent was rejected
    if (response.data === 'Fails.') {
      return res.status(400).json({ 
        error: 'Invalid torrent link',
        details: 'The download link is not valid or the torrent is unavailable. Try a different search result.'
      });
    }
    
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error adding torrent:', error.response?.status, error.response?.data, error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.message,
      details: error.response?.data,
      status: error.response?.status
    });
  }
});

// Control torrent (pause/resume/delete)
router.post('/torrents/:action', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { hashes, deleteFiles } = req.body;
    const { action } = req.params;
    const headers = await getHeaders();
    
    let params = `hashes=${hashes}`;
    
    // For delete action, add deleteFiles parameter
    if (action === 'delete') {
      params += `&deleteFiles=${deleteFiles !== false ? 'true' : 'false'}`;
    }
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/${action}`,
      params,
      { 
        headers,
        timeout: 5000
      }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get search plugins
router.get('/search/plugins', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const response = await axios.get(`${serverUrl}/api/v2/search/plugins`, {
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start search
router.post('/search/start', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { pattern, plugins, category } = req.body;
    
    const response = await makeAuthenticatedRequest(
      'POST',
      `${serverUrl}/api/v2/search/start`,
      `pattern=${encodeURIComponent(pattern)}&plugins=${plugins || 'enabled'}&category=${category || 'all'}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Search start error:', error.response?.status, error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Get search status
router.get('/search/status/:id', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { id } = req.params;
    
    const response = await makeAuthenticatedRequest('GET', `${serverUrl}/api/v2/search/status?id=${id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Search status error:', error.response?.status, error.message);
    
    // If 404, the search job doesn't exist or expired
    if (error.response?.status === 404) {
      // Return empty array to indicate no active search
      res.json([]);
    } else {
      res.status(error.response?.status || 500).json({ 
        error: error.message,
        searchId: req.params.id
      });
    }
  }
});

// Get search results
router.get('/search/results/:id', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { id } = req.params;
    const { limit, offset } = req.query;
    
    let url = `${serverUrl}/api/v2/search/results?id=${id}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;
    
    const response = await makeAuthenticatedRequest('GET', url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop search
router.post('/search/stop', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { id } = req.body;
    
    await makeAuthenticatedRequest(
      'POST',
      `${serverUrl}/api/v2/search/stop`,
      `id=${id}`
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Search stop error:', error.response?.status, error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

export default router;
