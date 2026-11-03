import express from 'express';
import axios from 'axios';
import { getServerUrl, authenticate, makeRequest as makeAuthenticatedRequest } from './qbAuth.js';

const getHeaders = async () => {
  const cookie = await authenticate();
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(cookie && { Cookie: cookie }),
  };
};

const router = express.Router();

// In-memory search logs storage
let searchLogs = [];
const MAX_LOGS = 100;

// Auto-stop seeding configuration
let autoStopConfig = {
  enabled: false,
  delayMinutes: 0,
  ratioLimit: null,
  seedTimeLimit: null
};

// Track torrents that have been processed for auto-stop (stopped already)
let processedTorrents = new Set();
// Track completion timestamps for delayMinutes: hash -> Date.now() when first seen seeding
const torrentCompletionTimes = new Map();

// Helper function to add search log
const addSearchLog = (pattern, plugins, category, status, error = null, searchId = null, resultCount = 0) => {
  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    pattern,
    plugins: plugins || 'enabled',
    category: category || 'all',
    status,
    searchId,
    resultCount,
    error,
    duration: null
  };
  searchLogs.unshift(logEntry);
  if (searchLogs.length > MAX_LOGS) searchLogs = searchLogs.slice(0, MAX_LOGS);
  return logEntry;
};

// Get search logs
router.get('/search/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    res.json({ logs: searchLogs.slice(0, parseInt(limit)), total: searchLogs.length, limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear search logs
router.delete('/search/logs', async (req, res) => {
  try {
    const clearedCount = searchLogs.length;
    searchLogs = [];
    res.json({ success: true, message: `Cleared ${clearedCount} log entries`, clearedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    
    console.log('Adding torrent with sequential download:', urls.substring(0, 50) + '...');
    
    // Use URLSearchParams which properly handles encoding
    // This ensures & characters in the magnet URL are treated as part of the value
    const params = new URLSearchParams();
    params.set('urls', urls);
    params.set('sequentialDownload', 'true'); // Always enable sequential download
    params.set('firstLastPiecePrio', 'true'); // Always prioritize first and last piece
    
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
    
    const { urls, savepath } = req.body;
    
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
    
    // Always enable sequential download for all torrents
    bodyComponents.push('sequentialDownload=true');
    bodyComponents.push('firstLastPiecePrio=true'); // Always prioritize first and last piece
    
    const body = bodyComponents.join('&');
    
    console.log('Adding torrent with sequential download enabled:', body.substring(0, 100) + '...');
    
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
    
    // Map frontend actions to qBittorrent API endpoints
    let qbAction = action;
    if (action === 'pause') {
      qbAction = 'stop';
    } else if (action === 'resume') {
      qbAction = 'start';
    }
    
    let params = `hashes=${hashes}`;
    
    // For delete action, add deleteFiles parameter
    if (action === 'delete') {
      params += `&deleteFiles=${deleteFiles !== false ? 'true' : 'false'}`;
    }
    
    const response = await axios.post(`${serverUrl}/api/v2/torrents/${qbAction}`,
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
    
    // Log the search start
    const logEntry = addSearchLog(pattern, plugins, category, 'started');
    
    const response = await makeAuthenticatedRequest(
      'POST',
      `${serverUrl}/api/v2/search/start`,
      `pattern=${encodeURIComponent(pattern)}&plugins=${plugins || 'enabled'}&category=${category || 'all'}`
    );
    
    // Update log with search ID
    logEntry.searchId = response.data.id;
    logEntry.status = 'running';
    
    res.json(response.data);
  } catch (error) {
    console.error('Search start error:', error.response?.status, error.message);
    
    // Log the search failure
    addSearchLog(pattern, plugins, category, 'failed', error.message);
    
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
    
    // Update log entry with result count if this is the final results fetch
    const logEntry = searchLogs.find(log => log.searchId === parseInt(id));
    if (logEntry && response.data.results) {
      logEntry.resultCount = response.data.results.length;
      logEntry.status = 'completed';
      logEntry.duration = Date.now() - new Date(logEntry.timestamp).getTime();
    }
    
    res.json(response.data);
  } catch (error) {
    // Update log entry with error
    const logEntry = searchLogs.find(log => log.searchId === parseInt(req.params.id));
    if (logEntry) {
      logEntry.status = 'failed';
      logEntry.error = error.message;
      logEntry.duration = Date.now() - new Date(logEntry.timestamp).getTime();
    }
    
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

// Auto-stop seeding configuration endpoints
router.get('/auto-stop/config', async (req, res) => {
  try {
    res.json(autoStopConfig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/auto-stop/config', async (req, res) => {
  try {
    const { enabled, delayMinutes, ratioLimit, seedTimeLimit } = req.body;
    
    autoStopConfig = {
      enabled: Boolean(enabled),
      delayMinutes: Math.max(0, parseInt(delayMinutes) || 0),
      ratioLimit: ratioLimit ? parseFloat(ratioLimit) : null,
      seedTimeLimit: seedTimeLimit ? parseInt(seedTimeLimit) : null
    };
    
    console.log('Auto-stop config updated:', autoStopConfig);
    
    res.json({ 
      success: true, 
      config: autoStopConfig,
      message: enabled ? 'Auto-stop seeding enabled' : 'Auto-stop seeding disabled'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check and process completed torrents for auto-stop
router.post('/auto-stop/process', async (req, res) => {
  try {
    if (!autoStopConfig.enabled) {
      return res.json({ 
        success: true, 
        message: 'Auto-stop is disabled',
        processed: 0 
      });
    }

    const serverUrl = getServerUrl();
    
    // Get all torrents
    const response = await makeAuthenticatedRequest('GET', `${serverUrl}/api/v2/torrents/info`);
    const torrents = response.data;
    
    let processedCount = 0;
    const results = [];
    
    for (const torrent of torrents) {
      // Skip if already processed
      if (processedTorrents.has(torrent.hash)) {
        continue;
      }
      
      // Check if torrent is completed and seeding
      const isCompleted = torrent.progress >= 1;
      const isSeeding = ['uploading', 'stalledUP', 'queuedUP'].includes(torrent.state);
      
      if (!isCompleted || !isSeeding) {
        // Clean up completion time tracking if torrent is no longer seeding
        if (!isSeeding) torrentCompletionTimes.delete(torrent.hash);
        continue;
      }

      // Record when we first saw this torrent seeding (for delayMinutes)
      if (!torrentCompletionTimes.has(torrent.hash)) {
        torrentCompletionTimes.set(torrent.hash, Date.now());
      }
      
      let shouldStop = false;
      let reason = '';
      
      // Check ratio limit
      if (autoStopConfig.ratioLimit && torrent.ratio >= autoStopConfig.ratioLimit) {
        shouldStop = true;
        reason = `Ratio limit reached (${torrent.ratio.toFixed(2)})`;
      }
      
      // Check seed time limit
      if (autoStopConfig.seedTimeLimit && torrent.seeding_time >= (autoStopConfig.seedTimeLimit * 60)) {
        shouldStop = true;
        reason = `Seed time limit reached (${Math.floor(torrent.seeding_time / 60)}m)`;
      }
      
      // Check delay minutes — stop if enough time has passed since completion
      if (!shouldStop) {
        if (autoStopConfig.delayMinutes === 0) {
          shouldStop = true;
          reason = 'Immediate stop after completion';
        } else {
          const completedAt = torrentCompletionTimes.get(torrent.hash) || Date.now();
          const elapsedMinutes = (Date.now() - completedAt) / 60000;
          if (elapsedMinutes >= autoStopConfig.delayMinutes) {
            shouldStop = true;
            reason = `Delay elapsed (${autoStopConfig.delayMinutes}m after completion)`;
          }
        }
      }
      
      if (shouldStop) {
        try {
          // Stop the torrent
          await makeAuthenticatedRequest(
            'POST',
            `${serverUrl}/api/v2/torrents/stop`,
            `hashes=${torrent.hash}`
          );
          
          processedTorrents.add(torrent.hash);
          torrentCompletionTimes.delete(torrent.hash);
          processedCount++;
          
          results.push({
            name: torrent.name,
            hash: torrent.hash,
            reason,
            success: true
          });
          
          console.log(`Auto-stopped torrent: ${torrent.name} (${reason})`);
        } catch (error) {
          results.push({
            name: torrent.name,
            hash: torrent.hash,
            reason,
            success: false,
            error: error.message
          });
          
          console.error(`Failed to auto-stop torrent ${torrent.name}:`, error.message);
        }
      }
    }
    
    res.json({
      success: true,
      processed: processedCount,
      results,
      config: autoStopConfig
    });
  } catch (error) {
    console.error('Auto-stop process error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get auto-stop statistics
router.get('/auto-stop/stats', async (req, res) => {
  try {
    res.json({
      config: autoStopConfig,
      processedTorrents: processedTorrents.size,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
