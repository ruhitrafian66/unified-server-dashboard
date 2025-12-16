import express from 'express';
import fs from 'fs/promises';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const SHOWS_DB_PATH = '/opt/server-dashboard/data/shows.json';
const execAsync = promisify(exec);

// TMDB API configuration
let TMDB_API_KEY = process.env.TMDB_API_KEY || '064267fc57ae3ffe079b9eea0ab3bf3e';

// qBittorrent API helpers (to avoid self-referencing HTTP calls)
const getQBittorrentServerUrl = () => {
  return process.env.QBITTORRENT_URL || 'http://localhost:8080';
};

let qbSessionCookie = null;
let qbSessionExpiry = null;

const authenticateQBittorrent = async (forceNew = false) => {
  if (qbSessionCookie && qbSessionExpiry && Date.now() < qbSessionExpiry && !forceNew) {
    return qbSessionCookie;
  }
  
  try {
    const serverUrl = getQBittorrentServerUrl();
    const username = process.env.QBITTORRENT_USERNAME || 'admin';
    const password = process.env.QBITTORRENT_PASSWORD || 'adminadmin';
    
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
    
    if (response.headers['set-cookie']) {
      qbSessionCookie = response.headers['set-cookie'][0];
      qbSessionExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes
      return qbSessionCookie;
    }
  } catch (error) {
    console.error('qBittorrent authentication error:', error.message);
  }
  
  return null;
};

const makeQBittorrentRequest = async (method, url, data = null, retryCount = 0) => {
  const cookie = await authenticateQBittorrent();
  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie && { 'Cookie': cookie })
    },
    timeout: 10000
  };
  
  try {
    if (method === 'GET') {
      return await axios.get(url, config);
    } else {
      return await axios.post(url, data, config);
    }
  } catch (error) {
    if ([401, 403, 404].includes(error.response?.status) && retryCount === 0) {
      qbSessionCookie = null;
      qbSessionExpiry = null;
      return makeQBittorrentRequest(method, url, data, 1);
    }
    throw error;
  }
};

// Scheduled episode checks (targeted by air time)
let scheduledChecks = new Map(); // Map of showId -> timeout

// Search Queue System
class SearchQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastSearchTime = 0;
    this.searchInterval = 45000; // 45 seconds between searches
  }

  // Add search request to queue
  enqueue(searchRequest) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        ...searchRequest,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      console.log(`📋 Added search to queue: ${searchRequest.showName} S${searchRequest.season}E${searchRequest.episode} (Queue size: ${this.queue.length})`);
      
      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  // Process queue sequentially with delays
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    console.log(`🔄 Starting search queue processing (${this.queue.length} items)`);

    while (this.queue.length > 0) {
      const searchRequest = this.queue.shift();
      
      try {
        // Ensure minimum time between searches
        const timeSinceLastSearch = Date.now() - this.lastSearchTime;
        if (timeSinceLastSearch < this.searchInterval) {
          const waitTime = this.searchInterval - timeSinceLastSearch;
          console.log(`⏳ Waiting ${Math.round(waitTime/1000)}s before next search (${this.queue.length} remaining)...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const searchDesc = searchRequest.searchType === 'season' 
          ? `${searchRequest.showName} Season ${searchRequest.season}` 
          : `${searchRequest.showName} S${searchRequest.season}E${searchRequest.episode}`;
        
        console.log(`🔍 Processing search (${this.queue.length} remaining): ${searchDesc}`);
        
        // Execute the actual search
        const result = await this.executeSearch(searchRequest);
        this.lastSearchTime = Date.now();
        
        // Resolve the promise with the result
        searchRequest.resolve(result);
        
      } catch (error) {
        console.error(`❌ Search failed for ${searchRequest.showName}:`, error.message);
        searchRequest.reject(error);
      }
    }

    this.processing = false;
    console.log(`✅ Search queue processing completed`);
  }

  // Execute individual search request
  async executeSearch(searchRequest) {
    const { showName, season, episode, searchType = 'episode' } = searchRequest;
    
    if (searchType === 'season') {
      return await this.executeSeasonSearch(searchRequest);
    } else {
      return await this.executeEpisodeSearch(showName, season, episode);
    }
  }

  // Execute episode search (original searchEpisodes logic)
  async executeEpisodeSearch(showName, season, episode) {
    try {
      const serverUrl = getQBittorrentServerUrl();
      
      // Search patterns with quality preference
      const searchPatterns = [
        `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 2160p web-dl`,
        `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 1080p web-dl`,
        `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} 1080p`,
        `${showName} S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`
      ];

      for (const pattern of searchPatterns) {
        console.log(`🔍 Searching pattern: ${pattern}`);
        
        try {
          // Start search (no need to check for active searches since we're queued)
          const searchResponse = await makeQBittorrentRequest(
            'POST',
            `${serverUrl}/api/v2/search/start`,
            `pattern=${encodeURIComponent(pattern)}&plugins=enabled&category=tv`
          );

          const searchId = searchResponse.data.id;
          console.log(`📋 Search started with ID: ${searchId}`);
          
          // Wait for search results with progressive checking
          let attempts = 0;
          let searchComplete = false;
          
          while (attempts < 12 && !searchComplete) { // Max 60 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
            
            try {
              const statusResponse = await makeQBittorrentRequest(
                'GET', 
                `${serverUrl}/api/v2/search/status?id=${searchId}`
              );
              
              if (statusResponse.data && statusResponse.data[0]) {
                const searchStatus = statusResponse.data[0];
                
                if (searchStatus.status === 'Stopped' && searchStatus.total > 0) {
                  searchComplete = true;
                  
                  // Get search results
                  const resultsResponse = await makeQBittorrentRequest(
                    'GET',
                    `${serverUrl}/api/v2/search/results?id=${searchId}&limit=20`
                  );
                  
                  if (resultsResponse.data.results && resultsResponse.data.results.length > 0) {
                    // Filter and sort results
                    const validResults = resultsResponse.data.results
                      .filter(result => result.fileUrl && result.fileUrl.startsWith('magnet:'))
                      .sort((a, b) => {
                        const seedersA = a.nbSeeders || 0;
                        const seedersB = b.nbSeeders || 0;
                        if (seedersB !== seedersA) return seedersB - seedersA;
                        
                        const qualityScoreA = (a.fileName?.toLowerCase().includes('web-dl') ? 10 : 0) +
                                            (a.fileName?.toLowerCase().includes('2160p') ? 20 : 0) +
                                            (a.fileName?.toLowerCase().includes('1080p') ? 15 : 0);
                        const qualityScoreB = (b.fileName?.toLowerCase().includes('web-dl') ? 10 : 0) +
                                            (b.fileName?.toLowerCase().includes('2160p') ? 20 : 0) +
                                            (b.fileName?.toLowerCase().includes('1080p') ? 15 : 0);
                        return qualityScoreB - qualityScoreA;
                      });
                    
                    if (validResults.length > 0) {
                      console.log(`✅ Found ${validResults.length} results, selected: ${validResults[0].fileName}`);
                      
                      // Stop the search to clean up
                      try {
                        await makeQBittorrentRequest(
                          'POST',
                          `${serverUrl}/api/v2/search/stop`,
                          `id=${searchId}`
                        );
                      } catch (stopError) {
                        console.log('Note: Could not stop search (may have already completed)');
                      }
                      
                      return validResults[0];
                    }
                  }
                } else if (searchStatus.status === 'Stopped' && searchStatus.total === 0) {
                  console.log(`❌ No results for pattern: ${pattern}`);
                  searchComplete = true;
                }
              }
            } catch (statusError) {
              console.error('Error checking search status:', statusError.message);
              break;
            }
          }
          
          if (!searchComplete) {
            console.log(`⏰ Search timed out for pattern: ${pattern}`);
          }
          
        } catch (searchError) {
          console.error(`Error searching pattern "${pattern}":`, searchError.message);
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in executeEpisodeSearch:', error);
      return null;
    }
  }

  // Execute season search (for Past Shows)
  async executeSeasonSearch(searchRequest) {
    const { showName, season, patterns } = searchRequest;
    
    try {
      const serverUrl = getQBittorrentServerUrl();
      
      for (const pattern of patterns) {
        console.log(`🎬 Searching season pattern: ${pattern}`);
        
        try {
          const searchResponse = await makeQBittorrentRequest(
            'POST',
            `${serverUrl}/api/v2/search/start`,
            `pattern=${encodeURIComponent(pattern)}&plugins=enabled&category=tv`
          );

          const searchId = searchResponse.data.id;
          
          // Wait for search results with progressive checking
          let attempts = 0;
          let searchComplete = false;
          
          while (attempts < 15 && !searchComplete) { // Max 75 seconds for season packs
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
            
            try {
              const statusResponse = await makeQBittorrentRequest(
                'GET', 
                `${serverUrl}/api/v2/search/status?id=${searchId}`
              );
              
              if (statusResponse.data && statusResponse.data[0]) {
                const searchStatus = statusResponse.data[0];
                
                if (searchStatus.status === 'Stopped' && searchStatus.total > 0) {
                  searchComplete = true;
                  
                  const resultsResponse = await makeQBittorrentRequest(
                    'GET',
                    `${serverUrl}/api/v2/search/results?id=${searchId}&limit=15`
                  );
                  
                  if (resultsResponse.data.results && resultsResponse.data.results.length > 0) {
                    const validResults = resultsResponse.data.results
                      .filter(result => {
                        if (!result.fileUrl || !result.fileUrl.startsWith('magnet:')) return false;
                        const fileName = result.fileName?.toLowerCase() || '';
                        return fileName.includes('season') || fileName.includes('complete') || 
                               fileName.includes('pack') || fileName.includes('collection');
                      })
                      .sort((a, b) => {
                        const seedersA = a.nbSeeders || 0;
                        const seedersB = b.nbSeeders || 0;
                        if (seedersB !== seedersA) return seedersB - seedersA;
                        
                        const qualityScoreA = (a.fileName?.toLowerCase().includes('web-dl') ? 10 : 0) +
                                            (a.fileName?.toLowerCase().includes('2160p') ? 20 : 0) +
                                            (a.fileName?.toLowerCase().includes('1080p') ? 15 : 0);
                        const qualityScoreB = (b.fileName?.toLowerCase().includes('web-dl') ? 10 : 0) +
                                            (b.fileName?.toLowerCase().includes('2160p') ? 20 : 0) +
                                            (b.fileName?.toLowerCase().includes('1080p') ? 15 : 0);
                        return qualityScoreB - qualityScoreA;
                      });
                    
                    if (validResults.length > 0) {
                      // Stop the search to clean up
                      try {
                        await makeQBittorrentRequest(
                          'POST',
                          `${serverUrl}/api/v2/search/stop`,
                          `id=${searchId}`
                        );
                      } catch (stopError) {
                        console.log('Note: Could not stop search (may have already completed)');
                      }
                      
                      return validResults[0];
                    }
                  }
                } else if (searchStatus.status === 'Stopped' && searchStatus.total === 0) {
                  searchComplete = true;
                }
              }
            } catch (statusError) {
              console.error('Error checking season search status:', statusError.message);
              break;
            }
          }
          
        } catch (searchError) {
          console.error(`Error searching season pattern "${pattern}":`, searchError.message);
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in executeSeasonSearch:', error);
      return null;
    }
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      lastSearchTime: this.lastSearchTime,
      nextSearchIn: this.processing ? Math.max(0, this.searchInterval - (Date.now() - this.lastSearchTime)) : 0,
      queuedItems: this.queue.map(item => ({
        showName: item.showName,
        season: item.season,
        episode: item.episode,
        searchType: item.searchType,
        queuedAt: new Date(item.timestamp).toISOString()
      }))
    };
  }

  // Clear the queue (for maintenance)
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log(`🗑️ Cleared ${clearedCount} items from search queue`);
    return clearedCount;
  }
}

// Global search queue instance
const searchQueue = new SearchQueue();

// Schedule episode check for specific show at specific time
const scheduleEpisodeCheck = (showId, showName, airDate, season, episode) => {
  if (!airDate) return;

  // Clear existing scheduled check for this show
  if (scheduledChecks.has(showId)) {
    clearTimeout(scheduledChecks.get(showId));
  }

  const episodeAirTime = new Date(airDate + 'T00:00:00Z'); // Assume midnight UTC
  const checkTime = new Date(episodeAirTime.getTime() + (60 * 60 * 1000)); // Add 1 hour
  const now = new Date();
  const timeUntilCheck = checkTime.getTime() - now.getTime();

  if (timeUntilCheck > 0) {
    console.log(`📅 Scheduled check for ${showName} S${season}E${episode} at ${checkTime.toISOString()}`);
    
    const timeout = setTimeout(async () => {
      try {
        console.log(`🔄 Scheduled episode check for ${showName} S${season}E${episode}`);
        await performSingleShowCheck(showId);
        scheduledChecks.delete(showId);
      } catch (error) {
        console.error(`Error in scheduled check for ${showName}:`, error);
      }
    }, timeUntilCheck);

    scheduledChecks.set(showId, timeout);
  } else {
    console.log(`⏰ Episode ${showName} S${season}E${episode} should already be available`);
  }
};

// Schedule checks for all active shows
const scheduleAllChecks = async () => {
  try {
    const data = await loadShows();
    const activeShows = data.shows.filter(s => s.status === 'active' && s.nextEpisodeAirDate);
    
    console.log(`📋 Scheduling checks for ${activeShows.length} shows with known air dates`);
    
    for (const show of activeShows) {
      const nextEpisode = show.currentEpisode + 1;
      scheduleEpisodeCheck(
        show.id, 
        show.name, 
        show.nextEpisodeAirDate, 
        show.currentSeason, 
        nextEpisode
      );
    }
  } catch (error) {
    console.error('Error scheduling checks:', error);
  }
};

// Clear all scheduled checks
const clearAllScheduledChecks = () => {
  for (const timeout of scheduledChecks.values()) {
    clearTimeout(timeout);
  }
  scheduledChecks.clear();
  console.log('🗑️ Cleared all scheduled episode checks');
};

// Initialize scheduling after a short delay to ensure all functions are loaded
setTimeout(() => {
  scheduleAllChecks();
}, 1000);

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

// Search TMDB for show information
const searchTMDBShow = async (showName) => {
  if (!TMDB_API_KEY) {
    console.log('TMDB API key not configured, skipping show lookup');
    return null;
  }

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        query: showName
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      return response.data.results[0]; // Return first match
    }
    return null;
  } catch (error) {
    console.error('Error searching TMDB:', error);
    return null;
  }
};

// Get episode air date from TMDB
const getEpisodeAirDate = async (tmdbId, season, episode) => {
  if (!TMDB_API_KEY || !tmdbId) {
    return null;
  }

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}`, {
      params: {
        api_key: TMDB_API_KEY
      }
    });

    return response.data.air_date; // Returns YYYY-MM-DD format
  } catch (error) {
    console.error('Error getting episode air date:', error);
    return null;
  }
};

// Get current episode progress for a show (how many episodes have aired)
const getCurrentEpisodeProgress = async (tmdbId) => {
  if (!TMDB_API_KEY || !tmdbId) {
    return { currentSeason: 1, currentEpisode: 0 };
  }

  try {
    // Get show details to find the current season
    const showResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
      params: { api_key: TMDB_API_KEY }
    });

    const numberOfSeasons = showResponse.data.number_of_seasons;
    const today = new Date();
    
    // Start from the latest season and work backwards
    for (let season = numberOfSeasons; season >= 1; season--) {
      try {
        const seasonResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}`, {
          params: { api_key: TMDB_API_KEY }
        });

        const episodes = seasonResponse.data.episodes || [];
        let lastAiredEpisode = 0;

        // Find the last episode that has aired
        for (const episode of episodes) {
          if (episode.air_date) {
            const airDate = new Date(episode.air_date);
            if (airDate <= today) {
              lastAiredEpisode = episode.episode_number;
            }
          }
        }

        // If we found aired episodes in this season, return the progress
        if (lastAiredEpisode > 0) {
          console.log(`Found current progress: S${season}E${lastAiredEpisode} (last aired episode)`);
          return { currentSeason: season, currentEpisode: lastAiredEpisode };
        }
      } catch (seasonError) {
        console.error(`Error getting season ${season} info:`, seasonError.message);
        continue;
      }
    }

    // If no aired episodes found, default to S01E00
    return { currentSeason: 1, currentEpisode: 0 };
  } catch (error) {
    console.error('Error getting current episode progress:', error);
    return { currentSeason: 1, currentEpisode: 0 };
  }
};

// Check if episode should be available (aired + 1 hour)
const isEpisodeAvailable = (airDate) => {
  if (!airDate) return true; // If no air date, assume available

  const episodeAirTime = new Date(airDate + 'T00:00:00Z'); // Assume midnight UTC
  const oneHourAfterAir = new Date(episodeAirTime.getTime() + (60 * 60 * 1000)); // Add 1 hour
  const now = new Date();

  return now >= oneHourAfterAir;
};

// Check if we should try the next season (when current season episodes are not found)
const shouldTryNextSeason = async (tmdbId, currentSeason, currentEpisode) => {
  if (!tmdbId || !TMDB_API_KEY) return false;
  
  try {
    // Check if there's a next season
    const showResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
      params: { api_key: TMDB_API_KEY }
    });
    
    const numberOfSeasons = showResponse.data.number_of_seasons;
    const nextSeason = currentSeason + 1;
    
    if (nextSeason <= numberOfSeasons) {
      // Check if the first episode of next season has aired
      const nextSeasonFirstEpisodeAirDate = await getEpisodeAirDate(tmdbId, nextSeason, 1);
      if (nextSeasonFirstEpisodeAirDate && isEpisodeAvailable(nextSeasonFirstEpisodeAirDate)) {
        console.log(`📅 Season ${nextSeason} Episode 1 has aired (${nextSeasonFirstEpisodeAirDate}), moving to next season`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking next season:', error);
    return false;
  }
};

// Check available disk space
const checkDiskSpace = async () => {
  try {
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

// Search for episodes using the queue system
const searchEpisodes = async (showName, season, episode) => {
  try {
    console.log(`📋 Queueing episode search: ${showName} S${season}E${episode}`);
    
    const result = await searchQueue.enqueue({
      showName,
      season,
      episode,
      searchType: 'episode'
    });
    
    return result;
  } catch (error) {
    console.error('Error queueing episode search:', error);
    return null;
  }
};

// Add torrent to qBittorrent (direct API)
const addTorrent = async (magnetUrl) => {
  try {
    const serverUrl = getQBittorrentServerUrl();
    
    console.log(`📥 Adding torrent: ${magnetUrl.substring(0, 50)}...`);
    
    // Use URLSearchParams for proper encoding
    const params = new URLSearchParams();
    params.set('urls', magnetUrl);
    params.set('sequentialDownload', 'true');
    
    const response = await makeQBittorrentRequest(
      'POST',
      `${serverUrl}/api/v2/torrents/add`,
      params
    );
    
    console.log(`qBittorrent add response:`, response.status, response.data);
    
    // Check if qBittorrent returned "Fails." which means the torrent was rejected
    if (response.data === 'Fails.') {
      console.log('❌ Torrent rejected by qBittorrent');
      return false;
    }
    
    console.log('✅ Torrent added successfully');
    return true;
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
    const { tmdbId, name, currentSeason, currentEpisode, status } = req.body;
    
    if (!tmdbId && !name) {
      return res.status(400).json({ error: 'Either TMDB ID or show name is required' });
    }

    let tmdbShow = null;
    
    // If TMDB ID is provided, get show details directly
    if (tmdbId && TMDB_API_KEY) {
      try {
        const response = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
          params: { api_key: TMDB_API_KEY }
        });
        tmdbShow = response.data;
      } catch (error) {
        console.error('Error fetching TMDB show details:', error);
      }
    } else if (name) {
      // Fallback to search by name
      tmdbShow = await searchTMDBShow(name);
    }

    const showName = tmdbShow?.name || name;
    
    const data = await loadShows();
    
    // Check if show already exists
    const existingShow = data.shows.find(s => 
      s.tmdbId === tmdbShow?.id || 
      s.name.toLowerCase() === showName.toLowerCase()
    );
    
    if (existingShow) {
      return res.status(400).json({ error: 'Show is already being tracked' });
    }

    // Get current episode progress from TMDB (or use provided values as fallback)
    let season = currentSeason || 1;
    let episode = currentEpisode || 0;
    
    if (tmdbShow?.id) {
      console.log(`Found TMDB match: ${tmdbShow.name} (ID: ${tmdbShow.id})`);
      const progress = await getCurrentEpisodeProgress(tmdbShow.id);
      season = progress.currentSeason;
      episode = progress.currentEpisode;
      console.log(`Detected current progress: S${season}E${episode}`);
    }
    
    const newShow = {
      id: Date.now().toString(),
      name: showName,
      currentSeason: parseInt(season),
      currentEpisode: parseInt(episode),
      status: status || 'active',
      dateAdded: new Date().toISOString(),
      lastChecked: null,
      downloadedEpisodes: [],
      tmdbId: tmdbShow?.id || null,
      tmdbName: tmdbShow?.name || null,
      tmdbOverview: tmdbShow?.overview || null,
      firstAirDate: tmdbShow?.first_air_date || null,
      nextEpisodeAirDate: null
    };

    // If we have TMDB info, try to get next episode air date
    if (tmdbShow?.id) {
      const nextEpisode = parseInt(episode) + 1;
      const airDate = await getEpisodeAirDate(tmdbShow.id, season, nextEpisode);
      if (airDate) {
        newShow.nextEpisodeAirDate = airDate;
        console.log(`Next episode (S${season}E${nextEpisode}) airs on: ${airDate}`);
        
        // Schedule the first check for this show
        scheduleEpisodeCheck(newShow.id, newShow.name, airDate, season, nextEpisode);
      }
    }

    data.shows.push(newShow);
    await saveShows(data);
    
    // Perform initial cascading check to catch up on any episodes that have already aired
    console.log(`🔄 Performing initial catch-up check for ${newShow.name}...`);
    
    try {
      const catchUpEpisodes = await performCascadingEpisodeCheck(newShow);
      
      if (catchUpEpisodes.length > 0) {
        // Save the updated show data after catch-up
        await saveShows(data);
        
        const episodeList = catchUpEpisodes.map(ep => `S${ep.season}E${ep.episode}`).join(', ');
        console.log(`✅ Caught up on ${catchUpEpisodes.length} episodes: ${episodeList}`);
        
        res.json({ 
          success: true, 
          show: newShow,
          catchUpEpisodes: catchUpEpisodes.length,
          message: `Show added and caught up on ${catchUpEpisodes.length} episodes: ${episodeList}`
        });
      } else {
        res.json({ 
          success: true, 
          show: newShow,
          catchUpEpisodes: 0,
          message: 'Show added, no episodes to catch up on'
        });
      }
    } catch (catchUpError) {
      console.error('Error during initial catch-up:', catchUpError);
      // Still return success since the show was added
      res.json({ 
        success: true, 
        show: newShow,
        catchUpEpisodes: 0,
        message: 'Show added, but initial catch-up failed'
      });
    }
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
    
    // Clear scheduled check for this show
    if (scheduledChecks.has(id)) {
      clearTimeout(scheduledChecks.get(id));
      scheduledChecks.delete(id);
      console.log(`🗑️ Cleared scheduled check for show ${id}`);
    }
    
    const data = await loadShows();
    data.shows = data.shows.filter(show => show.id !== id);
    await saveShows(data);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cascading episode check - searches for all available episodes until finding unaired one
const performCascadingEpisodeCheck = async (show, startingEpisode = null) => {
  const downloadedEpisodes = [];
  let currentEpisode = startingEpisode || (show.currentEpisode + 1);
  let currentSeason = show.currentSeason;
  
  console.log(`🔄 Starting cascading check for ${show.name} from S${currentSeason}E${currentEpisode}`);
  
  // Continue checking episodes until we find one that hasn't aired yet
  while (true) {
    console.log(`🔍 Checking episode S${currentSeason}E${currentEpisode} for ${show.name}...`);
    
    // Get air date for current episode
    let episodeAirDate = null;
    if (show.tmdbId) {
      episodeAirDate = await getEpisodeAirDate(show.tmdbId, currentSeason, currentEpisode);
      
      if (!episodeAirDate) {
        console.log(`📅 No air date found for S${currentSeason}E${currentEpisode}, assuming end of season/series`);
        break;
      }
      
      // Check if episode has aired (with 1 hour buffer)
      const available = isEpisodeAvailable(episodeAirDate);
      if (!available) {
        console.log(`⏰ Episode S${currentSeason}E${currentEpisode} hasn't aired yet (${episodeAirDate}), stopping cascade`);
        // Update the show's next episode info
        show.nextEpisodeAirDate = episodeAirDate;
        // Schedule check for this episode
        scheduleEpisodeCheck(show.id, show.name, episodeAirDate, currentSeason, currentEpisode);
        break;
      }
      
      console.log(`✅ Episode S${currentSeason}E${currentEpisode} has aired (${episodeAirDate}), searching...`);
    }
    
    // Search for the episode
    const result = await searchEpisodes(show.name, currentSeason, currentEpisode);
    
    if (result) {
      console.log(`✅ Found episode: ${show.name} S${currentSeason}E${currentEpisode}`);
      
      const added = await addTorrent(result.fileUrl);
      if (added) {
        // Update show progress
        show.currentEpisode = currentEpisode;
        show.currentSeason = currentSeason;
        show.lastChecked = new Date().toISOString();
        
        const episodeInfo = {
          season: currentSeason,
          episode: currentEpisode,
          title: result.fileName,
          downloadedAt: new Date().toISOString(),
          airDate: episodeAirDate
        };
        
        show.downloadedEpisodes.push(episodeInfo);
        downloadedEpisodes.push(episodeInfo);
        
        console.log(`📥 Successfully downloaded S${currentSeason}E${currentEpisode}: ${result.fileName}`);
      } else {
        console.log(`❌ Failed to add torrent for S${currentSeason}E${currentEpisode}`);
        break; // Stop if we can't add the torrent
      }
    } else {
      console.log(`❌ No torrent found for S${currentSeason}E${currentEpisode}`);
      
      // If we can't find the episode but it should have aired, still update progress
      // This prevents getting stuck on missing episodes
      if (episodeAirDate && isEpisodeAvailable(episodeAirDate)) {
        console.log(`⚠️ Episode has aired but no torrent found, updating progress anyway`);
        show.currentEpisode = currentEpisode;
        show.currentSeason = currentSeason;
        show.lastChecked = new Date().toISOString();
      } else if (!episodeAirDate) {
        // No air date found - might be end of season, check if next season is available
        const shouldMoveToNextSeason = await shouldTryNextSeason(show.tmdbId, currentSeason, currentEpisode);
        if (shouldMoveToNextSeason) {
          console.log(`🔄 Moving to Season ${currentSeason + 1} Episode 1`);
          currentSeason++;
          currentEpisode = 1;
          continue; // Skip the episode increment below
        } else {
          console.log(`📅 No more episodes available, stopping cascade`);
          break;
        }
      }
    }
    
    // Move to next episode
    currentEpisode++;
    
    // Safety limit to prevent infinite loops
    if (currentEpisode > 50) {
      console.log(`⚠️ Reached episode limit (50) for ${show.name}, stopping cascade`);
      break;
    }
  }
  
  return downloadedEpisodes;
};

// Perform episode check for a single show (now uses cascading check)
const performSingleShowCheck = async (showId) => {
  const hasSpace = await checkDiskSpace();
  if (!hasSpace) {
    console.log('⚠️ Insufficient disk space, skipping episode check');
    return { success: false, message: 'Insufficient disk space' };
  }

  const data = await loadShows();
  const show = data.shows.find(s => s.id === showId);
  
  if (!show || show.status !== 'active') {
    return { success: false, message: 'Show not found or inactive' };
  }

  console.log(`🔍 Starting cascading episode check for ${show.name}...`);
  
  const downloadedEpisodes = await performCascadingEpisodeCheck(show);
  
  // Save updated show data
  await saveShows(data);
  
  if (downloadedEpisodes.length > 0) {
    const episodeList = downloadedEpisodes.map(ep => `S${ep.season}E${ep.episode}`).join(', ');
    return {
      success: true,
      message: `Downloaded ${downloadedEpisodes.length} episodes: ${episodeList}`,
      episodes: downloadedEpisodes
    };
  } else {
    return { success: false, message: 'No new episodes found or available' };
  }
};

// Perform episode check for all shows (manual trigger) - now uses cascading logic
const performEpisodeCheck = async () => {
  const hasSpace = await checkDiskSpace();
  if (!hasSpace) {
    console.log('⚠️ Insufficient disk space, skipping episode check');
    return { success: false, message: 'Insufficient disk space', downloads: [] };
  }

  const data = await loadShows();
  const allResults = [];
  
  for (const show of data.shows.filter(s => s.status === 'active')) {
    console.log(`🔍 Starting cascading check for ${show.name}...`);
    
    const downloadedEpisodes = await performCascadingEpisodeCheck(show);
    
    // Convert to results format
    for (const episode of downloadedEpisodes) {
      allResults.push({
        show: show.name,
        episode: `S${episode.season}E${episode.episode}`,
        title: episode.title,
        status: 'downloaded',
        airDate: episode.airDate
      });
    }
    
    if (downloadedEpisodes.length > 0) {
      const episodeList = downloadedEpisodes.map(ep => `S${ep.season}E${ep.episode}`).join(', ');
      console.log(`✅ Downloaded ${downloadedEpisodes.length} episodes for ${show.name}: ${episodeList}`);
    } else {
      console.log(`ℹ️ No new episodes available for ${show.name}`);
    }
  }
  
  await saveShows(data);
  
  return {
    success: true,
    message: `Checked ${data.shows.filter(s => s.status === 'active').length} shows, downloaded ${allResults.length} episodes`,
    downloads: allResults
  };
};

// Check for new episodes (manual trigger)
router.post('/check', async (req, res) => {
  try {
    const result = await performEpisodeCheck();
    res.json(result);
  } catch (error) {
    console.error('Error checking shows:', error);
    res.status(500).json({ error: error.message });
  }
});



// Download season for past shows (prioritizes season packs)
router.post('/download-season', async (req, res) => {
  try {
    const { tmdbId, showName, season } = req.body;
    
    if (!showName || !season) {
      return res.status(400).json({ error: 'Show name and season are required' });
    }

    // Use original show name (no year enhancement)
    console.log(`🎯 Using show name: "${showName}"`);
    console.log(`📊 Will sort results by seeder count to find most relevant matches`);

    const hasSpace = await checkDiskSpace();
    if (!hasSpace) {
      return res.json({ 
        success: false, 
        message: 'Insufficient disk space (less than 5GB available)' 
      });
    }

    const seasonNum = parseInt(season);
    const results = [];
    
    console.log(`🔍 Searching for ${showName} Season ${seasonNum}...`);
    console.log(`📊 Available plugins and search configuration:`);
    
    // Log current qBittorrent search plugins
    try {
      const serverUrl = getQBittorrentServerUrl();
      const pluginsResponse = await makeQBittorrentRequest(
        'GET',
        `${serverUrl}/api/v2/search/plugins`
      );
      
      if (pluginsResponse.data) {
        const enabledPlugins = pluginsResponse.data.filter(p => p.enabled);
        console.log(`🔌 Enabled search plugins: ${enabledPlugins.map(p => p.name).join(', ')}`);
      }
    } catch (pluginError) {
      console.log('Could not fetch plugin info:', pluginError.message);
    }
    
    // First try to find complete season packs
    let seasonPackFound = false;
    
    const seasonPackPatterns = [
      `${showName} Season ${seasonNum} complete`,
      `${showName} S${seasonNum.toString().padStart(2, '0')} complete`,
      `${showName} S${seasonNum.toString().padStart(2, '0')}`
    ];

    // Try season pack patterns first using the queue
    console.log(`🎬 Queueing season pack search for ${showName} Season ${seasonNum}`);
    
    try {
      const seasonResult = await searchQueue.enqueue({
        showName,
        season: seasonNum,
        patterns: seasonPackPatterns,
        searchType: 'season'
      });
      
      if (seasonResult) {
        const added = await addTorrent(seasonResult.fileUrl);
        if (added) {
          console.log(`✅ Found and added season pack: ${seasonResult.fileName}`);
          console.log(`🌱 Seeders: ${seasonResult.nbSeeders}`);
          results.push({
            type: 'season_pack',
            title: seasonResult.fileName,
            status: 'downloaded'
          });
          seasonPackFound = true;
        }
      }
    } catch (seasonError) {
      console.error(`Error searching season pack:`, seasonError.message);
    }
    
    // If no season pack found, try individual episodes
    if (!seasonPackFound) {
      console.log(`📺 No season pack found, queueing individual episode searches...`);
      
      let consecutiveFailures = 0;
      
      for (let ep = 1; ep <= 24; ep++) {
        console.log(`📋 Queueing search for episode ${ep}...`);
        const result = await searchEpisodes(showName, seasonNum, ep);
        
        if (result) {
          const added = await addTorrent(result.fileUrl);
          if (added) {
            console.log(`✅ Added episode: ${showName} S${seasonNum}E${ep}`);
            results.push({
              type: 'episode',
              episode: `S${seasonNum.toString().padStart(2, '0')}E${ep.toString().padStart(2, '0')}`,
              title: result.fileName,
              status: 'downloaded'
            });
            consecutiveFailures = 0; // Reset failure count
          }
        } else {
          consecutiveFailures++;
          console.log(`❌ No result for episode ${ep} (${consecutiveFailures} consecutive failures)`);
          
          // If we can't find 3 consecutive episodes, assume we've reached the end
          if (consecutiveFailures >= 3 && ep > 3) {
            console.log(`🛑 No episodes found for 3 consecutive attempts after episode ${ep-3}, assuming end of season`);
            break;
          }
        }
      }
    }
    
    const message = seasonPackFound 
      ? `Downloaded complete season pack for ${showName} Season ${seasonNum}`
      : `Downloaded ${results.length} episodes of ${showName} Season ${seasonNum}`;
    
    res.json({ 
      success: true, 
      message,
      downloads: results,
      seasonPack: seasonPackFound
    });
  } catch (error) {
    console.error('Error downloading season:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download full season (existing endpoint for ongoing shows)
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

// Set TMDB API key (for configuration)
router.post('/config/tmdb', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Test the API key
    const testResponse = await axios.get(`https://api.themoviedb.org/3/configuration`, {
      params: { api_key: apiKey }
    });

    if (testResponse.status === 200) {
      // Update the runtime variable
      TMDB_API_KEY = apiKey;
      process.env.TMDB_API_KEY = apiKey;
      res.json({ success: true, message: 'TMDB API key configured successfully' });
    } else {
      res.status(400).json({ error: 'Invalid API key' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid API key or network error' });
  }
});

// Search TMDB for shows (live search)
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    
    if (!TMDB_API_KEY) {
      return res.status(400).json({ error: 'TMDB API key not configured' });
    }

    if (!query || query.length < 2) {
      return res.json({ results: [] });
    }

    const response = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        query: query
      }
    });

    const results = response.data.results.slice(0, 10).map(show => ({
      id: show.id,
      name: show.name,
      overview: show.overview,
      firstAirDate: show.first_air_date,
      posterPath: show.poster_path,
      voteAverage: show.vote_average
    }));

    res.json({ results });
  } catch (error) {
    console.error('Error searching TMDB:', error);
    res.status(500).json({ error: error.message, results: [] });
  }
});

// Get TMDB configuration status
router.get('/config/tmdb', (req, res) => {
  res.json({ 
    configured: !!TMDB_API_KEY,
    hasKey: !!process.env.TMDB_API_KEY,
    keyLength: TMDB_API_KEY ? TMDB_API_KEY.length : 0
  });
});

// Get automatic checking status
router.get('/config/auto-check', (req, res) => {
  res.json({
    enabled: scheduledChecks.size > 0,
    scheduledChecks: scheduledChecks.size,
    type: 'targeted'
  });
});

// Get search queue status
router.get('/queue/status', (req, res) => {
  const status = searchQueue.getStatus();
  res.json({
    ...status,
    searchInterval: searchQueue.searchInterval / 1000 // Convert to seconds
  });
});

// Clear search queue (for maintenance)
router.post('/queue/clear', (req, res) => {
  try {
    const clearedCount = searchQueue.clearQueue();
    res.json({ 
      success: true, 
      message: `Cleared ${clearedCount} items from search queue`,
      clearedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable automatic checking
router.post('/config/auto-check', (req, res) => {
  const { enabled } = req.body;
  
  if (enabled) {
    scheduleAllChecks();
    res.json({ success: true, message: 'Targeted episode checking enabled' });
  } else {
    clearAllScheduledChecks();
    res.json({ success: true, message: 'Targeted episode checking disabled' });
  }
});

export default router;