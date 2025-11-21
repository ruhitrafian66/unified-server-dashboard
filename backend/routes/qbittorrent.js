import express from 'express';
import axios from 'axios';

const router = express.Router();

// Get server URL from environment or use localhost (qBittorrent runs on same server)
const getServerUrl = () => {
  return process.env.QBITTORRENT_URL || 'http://localhost:8080';
};

// Session cookie storage
let sessionCookie = null;

// Authenticate with qBittorrent
const authenticate = async () => {
  if (sessionCookie) return sessionCookie;
  
  try {
    const serverUrl = getServerUrl();
    const username = process.env.QBITTORRENT_USERNAME || 'admin';
    const password = process.env.QBITTORRENT_PASSWORD || 'adminadmin';
    
    const response = await axios.post(
      `${serverUrl}/api/v2/auth/login`,
      `username=${username}&password=${password}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000
      }
    );
    
    if (response.headers['set-cookie']) {
      sessionCookie = response.headers['set-cookie'][0];
      return sessionCookie;
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
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
    const headers = await getHeaders();
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      `urls=${encodeURIComponent(urls)}`,
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
    const headers = await getHeaders();
    
    const response = await axios.post(`${serverUrl}/api/v2/search/start`,
      `pattern=${encodeURIComponent(pattern)}&plugins=${plugins || 'enabled'}&category=${category || 'all'}`,
      { 
        headers,
        timeout: 5000
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get search status
router.get('/search/status/:id', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { id } = req.params;
    const cookie = await authenticate();
    
    const response = await axios.get(`${serverUrl}/api/v2/search/status?id=${id}`, {
      headers: cookie ? { 'Cookie': cookie } : {},
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get search results
router.get('/search/results/:id', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { id } = req.params;
    const { limit, offset } = req.query;
    const cookie = await authenticate();
    
    let url = `${serverUrl}/api/v2/search/results?id=${id}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;
    
    const response = await axios.get(url, {
      headers: cookie ? { 'Cookie': cookie } : {},
      timeout: 5000
    });
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
    const headers = await getHeaders();
    
    await axios.post(`${serverUrl}/api/v2/search/stop`,
      `id=${id}`,
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

// Add torrent with advanced options
router.post('/torrents/add-advanced', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const { urls, savepath, sequentialDownload } = req.body;
    const headers = await getHeaders();
    
    const params = new URLSearchParams();
    params.append('urls', urls);
    if (savepath) params.append('savepath', savepath);
    if (sequentialDownload) params.append('sequentialDownload', 'true');
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      params.toString(),
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

export default router;
