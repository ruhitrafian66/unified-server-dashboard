import express from 'express';
import axios from 'axios';

const router = express.Router();

// Get server URL from environment or use default
const getServerUrl = (req) => {
  return process.env.QBITTORRENT_URL || `http://${req.ip.replace('::ffff:', '')}:8080`;
};

// Get torrent list
router.get('/torrents', async (req, res) => {
  try {
    const serverUrl = getServerUrl(req);
    const response = await axios.get(`${serverUrl}/api/v2/torrents/info`, {
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message, serverUrl: getServerUrl(req) });
  }
});

// Add torrent
router.post('/torrents/add', async (req, res) => {
  try {
    const serverUrl = getServerUrl(req);
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
    const serverUrl = getServerUrl(req);
    const { hashes } = req.body;
    const { action } = req.params;
    const response = await axios.post(`${serverUrl}/api/v2/torrents/${action}`,
      `hashes=${hashes}`,
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
