import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  mockSystemInfo,
  mockServices,
  mockDisks,
  mockContainers,
  mockTorrents,
  mockShows,
  mockSearchResults,
  mockWireGuardInterfaces,
  mockWireGuardStatus,
  mockWireGuardPeers,
  mockQueueItems
} from './mockData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// In-memory storage for development
let devTorrents = [...mockTorrents];
let devShows = [...mockShows];
let devAutoCheckEnabled = true;
let devQueueStatus = { queueLength: 0, processing: false, nextSearchIn: 0 };
let devQueueItems = [...mockQueueItems];

console.log('🚀 Starting Development Server with Mock Data...');

// OMV API endpoints
app.get('/api/omv/system', (req, res) => {
  console.log('📊 GET /api/omv/system');
  res.json(mockSystemInfo);
});

app.get('/api/omv/services', (req, res) => {
  console.log('🔧 GET /api/omv/services');
  res.json({ services: mockServices });
});

app.get('/api/omv/disks', (req, res) => {
  console.log('💾 GET /api/omv/disks');
  res.json({ disks: mockDisks });
});

app.post('/api/omv/power/:action', (req, res) => {
  const { action } = req.params;
  console.log(`⚡ POST /api/omv/power/${action}`);
  res.json({ success: true, message: `Server ${action} initiated (mock)` });
});

// Docker API endpoints
app.get('/api/docker/containers', (req, res) => {
  console.log('🐳 GET /api/docker/containers');
  res.json({ containers: mockContainers });
});

// qBittorrent API endpoints
app.get('/api/qbittorrent/torrents', (req, res) => {
  console.log('📥 GET /api/qbittorrent/torrents');
  res.json(devTorrents);
});

app.post('/api/qbittorrent/torrents/add', (req, res) => {
  const { urls } = req.body;
  console.log('➕ POST /api/qbittorrent/torrents/add', { urls });
  
  // Simulate adding a new torrent
  const newTorrent = {
    hash: Math.random().toString(36).substring(7),
    name: "New.Torrent.Added.Via.Development.Server",
    size: Math.floor(Math.random() * 10000000000), // Random size up to 10GB
    progress: 0,
    dlspeed: 0,
    upspeed: 0,
    eta: 8640000,
    state: "metaDL"
  };
  
  devTorrents.push(newTorrent);
  res.json({ success: true });
});

app.post('/api/qbittorrent/torrents/add-advanced', (req, res) => {
  const { urls, sequentialDownload } = req.body;
  console.log('➕ POST /api/qbittorrent/torrents/add-advanced', { urls, sequentialDownload });
  
  const newTorrent = {
    hash: Math.random().toString(36).substring(7),
    name: "Advanced.Torrent.Added.Via.Development.Server",
    size: Math.floor(Math.random() * 10000000000),
    progress: 0,
    dlspeed: 0,
    upspeed: 0,
    eta: 8640000,
    state: "metaDL"
  };
  
  devTorrents.push(newTorrent);
  res.json({ success: true });
});

app.post('/api/qbittorrent/torrents/add-with-priority', (req, res) => {
  const { urls, sequentialDownload, enableEpisodePriority } = req.body;
  console.log('🎬 POST /api/qbittorrent/torrents/add-with-priority', { 
    urls, 
    sequentialDownload, 
    enableEpisodePriority 
  });
  
  const newTorrent = {
    hash: Math.random().toString(36).substring(7),
    name: "TV.Show.S01.Complete.1080p.WEB-DL.x264-GROUP",
    size: Math.floor(Math.random() * 20000000000), // Larger size for season pack
    progress: 0,
    dlspeed: 0,
    upspeed: 0,
    eta: 8640000,
    state: "metaDL",
    episodePriorityEnabled: enableEpisodePriority
  };
  
  devTorrents.push(newTorrent);
  
  if (enableEpisodePriority) {
    console.log('📺 Episode priority enabled for torrent:', newTorrent.name);
  }
  
  res.json({ 
    success: true, 
    hash: newTorrent.hash,
    episodePriorityApplied: enableEpisodePriority 
  });
});

app.post('/api/qbittorrent/torrents/:action', (req, res) => {
  const { action } = req.params;
  const { hashes, deleteFiles } = req.body;
  console.log(`🎛️ POST /api/qbittorrent/torrents/${action}`, { hashes, deleteFiles });
  
  const hashList = hashes.split('|');
  
  if (action === 'delete') {
    devTorrents = devTorrents.filter(t => !hashList.includes(t.hash));
  } else if (action === 'pause') {
    devTorrents.forEach(t => {
      if (hashList.includes(t.hash)) {
        t.state = t.state.includes('DL') ? 'pausedDL' : 'pausedUP';
        t.dlspeed = 0;
        t.upspeed = 0;
      }
    });
  } else if (action === 'resume') {
    devTorrents.forEach(t => {
      if (hashList.includes(t.hash)) {
        if (t.progress >= 1) {
          t.state = 'uploading';
          t.upspeed = Math.floor(Math.random() * 2097152); // Random upload speed
        } else {
          t.state = 'downloading';
          t.dlspeed = Math.floor(Math.random() * 10485760); // Random download speed
        }
      }
    });
  }
  
  res.json({ success: true });
});

// Mock search logs for development
let devSearchLogs = [
  {
    id: Date.now() - 300000,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    pattern: 'The Matrix 1999',
    plugins: 'enabled',
    category: 'movies',
    status: 'completed',
    searchId: 123,
    resultCount: 15,
    error: null,
    duration: 2340
  },
  {
    id: Date.now() - 180000,
    timestamp: new Date(Date.now() - 180000).toISOString(),
    pattern: 'Breaking Bad S01',
    plugins: 'enabled',
    category: 'tv',
    status: 'completed',
    searchId: 124,
    resultCount: 8,
    error: null,
    duration: 1890
  },
  {
    id: Date.now() - 60000,
    timestamp: new Date(Date.now() - 60000).toISOString(),
    pattern: 'Nonexistent Show',
    plugins: 'enabled',
    category: 'all',
    status: 'failed',
    searchId: 125,
    resultCount: 0,
    error: 'Search timeout',
    duration: 5000
  }
];

// qBittorrent search logs endpoints
app.get('/api/qbittorrent/search/logs', (req, res) => {
  const { limit = 50 } = req.query;
  console.log(`📋 GET /api/qbittorrent/search/logs?limit=${limit}`);
  
  const logs = devSearchLogs.slice(0, parseInt(limit));
  res.json({
    logs,
    total: devSearchLogs.length,
    limit: parseInt(limit)
  });
});

app.delete('/api/qbittorrent/search/logs', (req, res) => {
  console.log('🗑️ DELETE /api/qbittorrent/search/logs');
  
  const clearedCount = devSearchLogs.length;
  devSearchLogs = [];
  res.json({
    success: true,
    message: `Cleared ${clearedCount} log entries`,
    clearedCount
  });
});

// qBittorrent search endpoints
app.post('/api/qbittorrent/search/start', (req, res) => {
  const { pattern, plugins, category } = req.body;
  console.log('🔍 POST /api/qbittorrent/search/start', { pattern, plugins, category });
  
  const searchId = Math.floor(Math.random() * 1000);
  
  // Add to dev search logs
  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    pattern,
    plugins: plugins || 'enabled',
    category: category || 'all',
    status: 'completed',
    searchId,
    resultCount: Math.floor(Math.random() * 20) + 1, // Random result count
    error: null,
    duration: Math.floor(Math.random() * 3000) + 1000 // Random duration 1-4 seconds
  };
  
  devSearchLogs.unshift(logEntry);
  
  // Keep only last 100 logs
  if (devSearchLogs.length > 100) {
    devSearchLogs = devSearchLogs.slice(0, 100);
  }
  
  res.json({ id: searchId });
});

app.get('/api/qbittorrent/search/status/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📊 GET /api/qbittorrent/search/status/${id}`);
  
  // Simulate search completion after a short delay
  res.json([{
    id: parseInt(id),
    status: 'Stopped',
    total: 5
  }]);
});

app.get('/api/qbittorrent/search/results/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 GET /api/qbittorrent/search/results/${id}`);
  
  // Mock search results
  const mockResults = [
    {
      fileName: "The.Matrix.1999.2160p.UHD.BluRay.x265-TERMINAL",
      fileSize: 15728640000,
      nbSeeders: 125,
      fileUrl: "magnet:?xt=urn:btih:abc123def456&dn=The.Matrix.1999.2160p.UHD.BluRay.x265-TERMINAL"
    },
    {
      fileName: "The.Matrix.1999.1080p.BluRay.x264-AMIABLE", 
      fileSize: 8589934592,
      nbSeeders: 89,
      fileUrl: "magnet:?xt=urn:btih:def456ghi789&dn=The.Matrix.1999.1080p.BluRay.x264-AMIABLE"
    },
    {
      fileName: "The.Matrix.1999.720p.BluRay.x264-SiNNERS",
      fileSize: 4294967296,
      nbSeeders: 45,
      fileUrl: "magnet:?xt=urn:btih:ghi789jkl012&dn=The.Matrix.1999.720p.BluRay.x264-SiNNERS"
    }
  ];
  
  res.json({ results: mockResults });
});

app.post('/api/qbittorrent/search/stop', (req, res) => {
  const { id } = req.body;
  console.log(`⏹️ POST /api/qbittorrent/search/stop`, { id });
  res.json({ success: true });
});

// TV Shows API endpoints
app.get('/api/shows', (req, res) => {
  console.log('📺 GET /api/shows');
  res.json({ shows: devShows });
});

app.post('/api/shows', (req, res) => {
  const { tmdbId, name } = req.body;
  console.log('➕ POST /api/shows', { tmdbId, name });
  
  const newShow = {
    id: devShows.length + 1,
    name,
    tmdbId,
    currentSeason: 1,
    currentEpisode: 0,
    status: 'active',
    nextEpisodeAirDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next week
    lastChecked: new Date().toISOString(),
    downloadedEpisodes: []
  };
  
  devShows.push(newShow);
  res.json({ success: true, catchUpEpisodes: 0 });
});

app.put('/api/shows/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  console.log(`✏️ PUT /api/shows/${id}`, updates);
  
  const showIndex = devShows.findIndex(s => s.id === parseInt(id));
  if (showIndex !== -1) {
    devShows[showIndex] = { ...devShows[showIndex], ...updates };
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Show not found' });
  }
});

app.delete('/api/shows/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/shows/${id}`);
  
  devShows = devShows.filter(s => s.id !== parseInt(id));
  res.json({ success: true });
});

app.get('/api/shows/search/:query', (req, res) => {
  const { query } = req.params;
  console.log(`🔍 GET /api/shows/search/${query}`);
  
  // Filter mock results based on query
  const filteredResults = mockSearchResults.filter(show => 
    show.name.toLowerCase().includes(query.toLowerCase())
  );
  
  res.json({ results: filteredResults });
});

app.post('/api/shows/check', (req, res) => {
  console.log('🔍 POST /api/shows/check');
  
  // Simulate finding new episodes
  const downloads = Math.random() > 0.5 ? ['S03E11', 'S05E17'] : [];
  
  res.json({ 
    success: true, 
    downloads,
    message: downloads.length > 0 ? `Found ${downloads.length} new episodes` : 'No new episodes found'
  });
});

app.get('/api/shows/config/auto-check', (req, res) => {
  console.log('⚙️ GET /api/shows/config/auto-check');
  res.json({ enabled: devAutoCheckEnabled });
});

app.post('/api/shows/config/auto-check', (req, res) => {
  const { enabled } = req.body;
  console.log('⚙️ POST /api/shows/config/auto-check', { enabled });
  
  devAutoCheckEnabled = enabled;
  res.json({ 
    success: true, 
    message: enabled ? 'Auto-check enabled' : 'Auto-check disabled'
  });
});

app.get('/api/shows/queue/status', (req, res) => {
  console.log('📊 GET /api/shows/queue/status');
  res.json(devQueueStatus);
});

app.post('/api/shows/queue/clear', (req, res) => {
  console.log('🗑️ POST /api/shows/queue/clear');
  
  const clearedCount = devQueueStatus.queueLength;
  devQueueStatus = { queueLength: 0, processing: false, nextSearchIn: 0 };
  
  res.json({ success: true, clearedCount });
});

app.post('/api/shows/download-season', (req, res) => {
  const { tmdbId, showName, season } = req.body;
  console.log('📥 POST /api/shows/download-season', { tmdbId, showName, season });
  
  const sessionId = Math.random().toString(36).substring(7);
  res.json({ success: true, sessionId });
});

app.get('/api/shows/download-progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  console.log(`📊 GET /api/shows/download-progress/${sessionId}`);
  
  // Simulate download progress
  const progress = Math.min(100, Math.floor(Math.random() * 100));
  const isComplete = progress >= 95;
  
  res.json({
    status: isComplete ? 'completed' : 'downloading',
    progress,
    message: isComplete ? 'Download completed successfully!' : `Downloading... ${progress}%`,
    success: isComplete,
    downloads: isComplete ? ['Episode 1', 'Episode 2', 'Episode 3'] : []
  });
});

// WireGuard API endpoints
app.get('/api/wireguard/interfaces', (req, res) => {
  console.log('🔒 GET /api/wireguard/interfaces');
  res.json({ interfaces: mockWireGuardInterfaces });
});

app.get('/api/wireguard/status/:interface', (req, res) => {
  const { interface: iface } = req.params;
  console.log(`📊 GET /api/wireguard/status/${iface}`);
  res.json({ status: mockWireGuardStatus });
});

app.get('/api/wireguard/peers/:interface', (req, res) => {
  const { interface: iface } = req.params;
  console.log(`👥 GET /api/wireguard/peers/${iface}`);
  res.json({ peers: mockWireGuardPeers });
});

app.post('/api/wireguard/interface/:action', (req, res) => {
  const { action } = req.params;
  const { interface: iface } = req.body;
  console.log(`🎛️ POST /api/wireguard/interface/${action}`, { interface: iface });
  
  res.json({ 
    success: true, 
    message: `Interface ${iface} ${action === 'up' ? 'started' : 'stopped'} (mock)`
  });
});

// qBittorrent file management endpoints
app.get('/api/qbittorrent/torrents/:hash/files', (req, res) => {
  const { hash } = req.params;
  console.log(`📁 GET /api/qbittorrent/torrents/${hash}/files`);
  
  // Mock TV show season files
  const mockFiles = [
    { id: 0, name: "The.Bear.S03E01.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 7, progress: 0.0 },
    { id: 1, name: "The.Bear.S03E02.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 6, progress: 0.0 },
    { id: 2, name: "The.Bear.S03E03.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 6, progress: 0.0 },
    { id: 3, name: "The.Bear.S03E04.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 5, progress: 0.0 },
    { id: 4, name: "The.Bear.S03E05.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 4, progress: 0.0 },
    { id: 5, name: "The.Bear.S03E06.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 1, progress: 0.0 },
    { id: 6, name: "The.Bear.S03E07.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 1, progress: 0.0 },
    { id: 7, name: "The.Bear.S03E08.1080p.WEB.H264-SUCCESSORS.mkv", size: 1073741824, priority: 1, progress: 0.0 },
    { id: 8, name: "subtitles/The.Bear.S03E01.srt", size: 52428, priority: 1, progress: 0.0 },
    { id: 9, name: "subtitles/The.Bear.S03E02.srt", size: 52428, priority: 1, progress: 0.0 }
  ];
  
  res.json(mockFiles);
});

app.post('/api/qbittorrent/torrents/:hash/filePrio', (req, res) => {
  const { hash } = req.params;
  const { id, priority } = req.body;
  console.log(`🎯 POST /api/qbittorrent/torrents/${hash}/filePrio`, { id, priority });
  
  res.json({ success: true });
});

// Queue API endpoints
app.get('/api/queue', (req, res) => {
  console.log('📋 GET /api/queue');
  res.json({ items: devQueueItems });
});

app.post('/api/queue/clear', (req, res) => {
  console.log('🗑️ POST /api/queue/clear');
  
  const clearedCount = devQueueItems.length;
  devQueueItems = [];
  
  res.json({ 
    success: true, 
    message: `Cleared ${clearedCount} queue items`,
    clearedCount 
  });
});

app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/queue/${id}`);
  
  const itemIndex = devQueueItems.findIndex(item => item.id === parseInt(id));
  
  if (itemIndex !== -1) {
    const removedItem = devQueueItems.splice(itemIndex, 1)[0];
    res.json({ 
      success: true, 
      message: `Removed "${removedItem.title}" from queue` 
    });
  } else {
    res.status(404).json({ error: 'Queue item not found' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
🎉 Development Server Running!

📱 Frontend: http://localhost:${PORT}
🔧 Backend API: http://localhost:${PORT}/api
📊 Mock Data: Loaded with sample torrents, shows, and system info

🚀 Ready for testing! All API endpoints are mocked with realistic data.
  `);
});

export default app;