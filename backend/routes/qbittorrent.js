import express from 'express';
import axios from 'axios';

const router = express.Router();
let qbSession = null;

// Middleware to check authentication
const authenticate = async (req, res, next) => {
  const { serverUrl } = req.body;
  if (!qbSession || !serverUrl) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// Login to qBittorrent
router.post('/login', async (req, res) => {
  try {
    const { serverUrl, username, password } = req.body;
    const response = await axios.post(`${serverUrl}/api/v2/auth/login`, 
      `username=${username}&password=${password}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    qbSession = response.headers['set-cookie'];
    res.json({ success: true, session: qbSession });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get torrent list
router.post('/torrents', authenticate, async (req, res) => {
  try {
    const { serverUrl } = req.body;
    const response = await axios.get(`${serverUrl}/api/v2/torrents/info`, {
      headers: { Cookie: qbSession }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add torrent
router.post('/torrents/add', authenticate, async (req, res) => {
  try {
    const { serverUrl, urls } = req.body;
    const response = await axios.post(`${serverUrl}/api/v2/torrents/add`,
      `urls=${encodeURIComponent(urls)}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: qbSession 
        } 
      }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Control torrent (pause/resume/delete)
router.post('/torrents/:action', authenticate, async (req, res) => {
  try {
    const { serverUrl, hashes } = req.body;
    const { action } = req.params;
    const response = await axios.post(`${serverUrl}/api/v2/torrents/${action}`,
      `hashes=${hashes}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: qbSession 
        } 
      }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
