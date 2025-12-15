import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const router = express.Router();
const SHOWS_DB_PATH = '/opt/server-dashboard/data/shows.json';

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.mkdir('/opt/server-dashboard/data', { recursive: true });
  } catch (error) {
    // Directory already exists
  }
};

// Load shows database
const loadShows = async () => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SHOWS_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { shows: [] };
  }
};

// Save shows database
const saveShows = async (data) => {
  await ensureDataDir();
  await fs.writeFile(SHOWS_DB_PATH, JSON.stringify(data, null, 2));
};

// Check available disk space
const checkDiskSpace = async () => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync('df -h /media | tail -1');
    const parts = stdout.trim().split(/\s+/);
    const available = parts[3];
    const availableGB = parseFloat(available.replace('G', ''));
    
    return availableGB > 5; // Require at least 5GB free space
  } catch (error) {
    console.error('Error checking disk space:', error);
    return false;
  }
};

// Search for episodes with quality preference
const searchEpisodes = async (showName, season, episode) => {
  try {
    // Search patterns with quality preference
    const searchPatterns = [
      `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 2160p`,
      `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 4K`,
      `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 1080p`,
      `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`
    ];

    for (const pattern of searchPatterns) {
      const response = await axios.post('http://localhost:3001/api/qbittorrent/search/start', {
        pattern,
        plugins: 'enabled',
        category: 'tv'
      });

      const searchId = response.data.id;
      
      // Wait for search results
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      const statusResponse = await axios.get(`http://localhost:3001/api/qbittorrent/search/status/${searchId}`);
      if (statusResponse.data && statusResponse.data[0] && statusResponse.data[0].total > 0) {
        const resultsResponse = await axios.get(`http://localhost:3001/api/qbittorrent/search/results/${searchId}?limit=10`);
        
        if (resultsResponse.data.results && resultsResponse.data.results.length > 0) {
          // Filter for valid magnet links and sort by seeders
          const validResults = resultsResponse.data.results
            .filter(result => result.fileUrl && result.fileUrl.startsWith('magnet:'))
            .sort((a, b) => (b.nbSeeders || 0) - (a.nbSeeders || 0));
          
          if (validResults.length > 0) {
            return validResults[0]; // Return best result
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching episodes:', error);
    return null;
  }
};

// Add torrent to qBittorrent
const addTorrent = async (magnetUrl) => {
  try {
    const response = await axios.post('http://localhost:3001/api/qbittorrent/torrents/add-advanced', {
      urls: magnetUrl,
      sequentialDownload: true
    });
    return response.data.success;
  } catch (error) {
    console.error('Error adding torrent:', error);
    return false;
  }
};

// Get all ongoing shows
router.get('/', async (req, res) => {
  try {
    const data = await loadShows();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new show
router.post('/', async (req, res) => {
  try {
    const { name, currentSeason, currentEpisode, status } = req.body;
    
    if (!name || currentSeason === undefined || currentEpisode === undefined) {
      return res.status(400).json({ error: 'Name, current season, and current episode are required' });
    }

    const data = await loadShows();
    const newShow = {
      id: Date.now().toString(),
      name,
      currentSeason: parseInt(currentSeason),
      currentEpisode: parseInt(currentEpisode),
      status: status || 'active',
      dateAdded: new Date().toISOString(),
      lastChecked: null,
      downloadedEpisodes: []
    };

    data.shows.push(newShow);
    await saveShows(data);
    
    res.json({ success: true, show: newShow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update show
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const data = await loadShows();
    const showIndex = data.shows.findIndex(show => show.id === id);
    
    if (showIndex === -1) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    data.shows[showIndex] = { ...data.shows[showIndex], ...updates };
    await saveShows(data);
    
    res.json({ success: true, show: data.shows[showIndex] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete show
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await loadShows();
    data.shows = data.shows.filter(show => show.id !== id);
    await saveShows(data);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check for new episodes (manual trigger)
router.post('/check', async (req, res) => {
  try {
    const hasSpace = await checkDiskSpace();
    if (!hasSpace) {
      return res.json({ 
        success: false, 
        message: 'Insufficient disk space (less than 5GB available)' 
      });
    }

    const data = await loadShows();
    const results = [];
    
    for (const show of data.shows.filter(s => s.status === 'active')) {
      console.log(`Checking for new episodes of ${show.name}...`);
      
      // Check for next episode
      const nextEpisode = show.currentEpisode + 1;
      const result = await searchEpisodes(show.name, show.currentSeason, nextEpisode);
      
      if (result) {
        console.log(`Found new episode: ${show.name} S${show.currentSeason}E${nextEpisode}`);
        
        const added = await addTorrent(result.fileUrl);
        if (added) {
          // Update show progress
          show.currentEpisode = nextEpisode;
          show.lastChecked = new Date().toISOString();
          show.downloadedEpisodes.push({
            season: show.currentSeason,
            episode: nextEpisode,
            title: result.fileName,
            downloadedAt: new Date().toISOString()
          });
          
          results.push({
            show: show.name,
            episode: `S${show.currentSeason}E${nextEpisode}`,
            title: result.fileName,
            status: 'downloaded'
          });
        }
      } else {
        show.lastChecked = new Date().toISOString();
      }
    }
    
    await saveShows(data);
    
    res.json({ 
      success: true, 
      message: `Checked ${data.shows.length} shows`,
      downloads: results
    });
  } catch (error) {
    console.error('Error checking shows:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download full season
router.post('/:id/season/:season', async (req, res) => {
  try {
    const { id, season } = req.params;
    const { startEpisode = 1, endEpisode = 24 } = req.body;
    
    const hasSpace = await checkDiskSpace();
    if (!hasSpace) {
      return res.json({ 
        success: false, 
        message: 'Insufficient disk space (less than 5GB available)' 
      });
    }

    const data = await loadShows();
    const show = data.shows.find(s => s.id === id);
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }

    const results = [];
    const seasonNum = parseInt(season);
    
    for (let ep = parseInt(startEpisode); ep <= parseInt(endEpisode); ep++) {
      const result = await searchEpisodes(show.name, seasonNum, ep);
      
      if (result) {
        const added = await addTorrent(result.fileUrl);
        if (added) {
          results.push({
            episode: `S${seasonNum}E${ep}`,
            title: result.fileName,
            status: 'downloaded'
          });
          
          // Add small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Downloaded ${results.length} episodes of season ${season}`,
      downloads: results
    });
  } catch (error) {
    console.error('Error downloading season:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;