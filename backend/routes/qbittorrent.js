import express from 'express';
import axios from 'axios';

const router = express.Router();

// Get server URL from environment or use localhost (qBittorrent runs on same server)
const getServerUrl = () => {
  return process.env.QBITTORRENT_URL || 'http://localhost:8080';
};

// Get torrent list
router.get('/torrents', async (req, res) => {
  try {
    const serverUrl = getServerUrl();
    const response = await axios.get(`${serverUrl}/api/v2/torrents/info`, {
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
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      `urls=${encodeURIComponent(urls)}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        },
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
    
    let params = `hashes=${hashes}`;
    
    // For delete action, add deleteFiles parameter
    if (action === 'delete') {
      params += `&deleteFiles=${deleteFiles !== false ? 'true' : 'false'}`;
    }
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/${action}`,
      params,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        },
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
    const response = await axios.post(`${serverUrl}/api/v2/search/start`,
      `pattern=${encodeURIComponent(pattern)}&plugins=${plugins || 'all'}&category=${category || 'all'}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        },
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
    const response = await axios.get(`${serverUrl}/api/v2/search/status?id=${id}`, {
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
    
    let url = `${serverUrl}/api/v2/search/results?id=${id}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;
    
    const response = await axios.get(url, {
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
    await axios.post(`${serverUrl}/api/v2/search/stop`,
      `id=${id}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        },
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
    
    const params = new URLSearchParams();
    params.append('urls', urls);
    if (savepath) params.append('savepath', savepath);
    if (sequentialDownload) params.append('sequentialDownload', 'true');
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      params.toString(),
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
