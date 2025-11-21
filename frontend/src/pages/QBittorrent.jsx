import React, { useState, useEffect } from 'react';
import axios from 'axios';

function QBittorrent({ serverUrl }) {
  const [torrents, setTorrents] = useState([]);
  const [newTorrent, setNewTorrent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState({
    savepath: '/srv/dev-disk-by-uuid-2f521503-8710-48ab-8e68-17875edf1865/Server/',
    sequentialDownload: false
  });

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchTorrents = async () => {
    try {
      const response = await axios.get('/api/qbittorrent/torrents');
      setTorrents(response.data);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching torrents:', error);
      setError(error.response?.data?.error || error.message);
      setLoading(false);
    }
  };

  const addTorrent = async () => {
    if (!newTorrent.trim()) {
      alert('Please enter a magnet link or torrent URL');
      return;
    }

    try {
      await axios.post('/api/qbittorrent/torrents/add', {
        urls: newTorrent
      });
      setNewTorrent('');
      setTimeout(fetchTorrents, 1000); // Refresh after 1 second
    } catch (error) {
      alert('Error adding torrent: ' + (error.response?.data?.error || error.message));
    }
  };



  const sortedTorrents = [...torrents].sort((a, b) => {
    // Active downloads first (downloading, stalledDL, metaDL, forcedDL)
    const aActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(a.state);
    const bActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(b.state);
    
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    
    // Then by progress (incomplete first)
    if (a.progress < 1 && b.progress >= 1) return -1;
    if (a.progress >= 1 && b.progress < 1) return 1;
    
    return 0;
  });

  const controlTorrent = async (action, hash, deleteFiles = true) => {
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, {
        hashes: hash,
        deleteFiles: deleteFiles
      });
      setTimeout(fetchTorrents, 500); // Refresh after 0.5 seconds
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024 / 1024).toFixed(2);
  };

  const formatSpeed = (bytesPerSec) => {
    const mbps = bytesPerSec / 1024 / 1024;
    return mbps.toFixed(2);
  };

  if (loading) {
    return (
      <div>
        <h1>qBittorrent</h1>
        <div className="card">
          <p style={{ color: '#b0b0c0' }}>Loading torrents...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Downloads</h1>
      
      {error && (
        <div className="card" style={{ background: 'rgba(244, 67, 54, 0.1)', borderColor: '#f44336' }}>
          <p style={{ color: '#f44336' }}>
            <strong>Connection Error:</strong> {error}
          </p>
          <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            The download service isn't responding. Please check if it's running.
          </p>
        </div>
      )}

      <div className="card">
        <h2>🔍 Find Movies & TV Shows</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Quick search on popular torrent sites
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="input"
            type="text"
            placeholder="e.g., Breaking Bad, The Matrix, Game of Thrones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchQuery.trim() && window.open(`https://1337x.to/search/${encodeURIComponent(searchQuery)}/1/`, '_blank')}
            style={{ marginBottom: 0 }}
          />
          <button 
            className="button" 
            onClick={() => searchQuery.trim() && window.open(`https://1337x.to/search/${encodeURIComponent(searchQuery)}/1/`, '_blank')}
            style={{ minWidth: '120px' }}
          >
            🔍 Search
          </button>
        </div>
        <p style={{ color: '#b0b0c0', fontSize: '0.75rem', fontStyle: 'italic' }}>
          💡 Tip: Search opens in a new tab. Copy the magnet link and paste it below to download.
        </p>
      </div>

      {showAdvanced && selectedTorrent && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>⚙️ Download Settings</h2>
          <p style={{ color: '#e0e0e0', marginBottom: '1rem', wordBreak: 'break-word' }}>
            <strong>Ready to download:</strong> {selectedTorrent.fileName}
          </p>
          
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong style={{ color: '#667eea', display: 'block', marginBottom: '0.5rem' }}>
              📁 Save to Folder
            </strong>
            <p style={{ color: '#b0b0c0', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Where should we save this file?
            </p>
            <input
              className="input"
              type="text"
              value={advancedOptions.savepath}
              onChange={(e) => setAdvancedOptions({ ...advancedOptions, savepath: e.target.value })}
              style={{ marginBottom: 0 }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={advancedOptions.sequentialDownload}
              onChange={(e) => setAdvancedOptions({ ...advancedOptions, sequentialDownload: e.target.checked })}
              style={{ width: 'auto', margin: '0.25rem 0 0 0', flexShrink: 0 }}
            />
            <div>
              <span style={{ color: '#e0e0e0', display: 'block' }}>▶️ Download in order (recommended for videos)</span>
              <span style={{ color: '#b0b0c0', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                Allows you to start watching while downloading
              </span>
            </div>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={addSearchedTorrent}>
              ✓ Start Download
            </button>
            <button 
              className="button" 
              onClick={() => { setShowAdvanced(false); setSelectedTorrent(null); }}
              style={{ background: '#6a6a7e' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>🔗 Add from Link</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Have a magnet link or torrent URL? Paste it here
        </p>
        <input
          className="input"
          type="text"
          placeholder="Paste magnet link or .torrent URL here..."
          value={newTorrent}
          onChange={(e) => setNewTorrent(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTorrent()}
        />
        <button className="button" onClick={addTorrent}>+ Add Download</button>
      </div>

      <div className="card">
        <h2>📥 My Downloads ({torrents.length})</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Active downloads appear at the top
        </p>
        {torrents.length === 0 ? (
          <p style={{ color: '#b0b0c0', textAlign: 'center', padding: '2rem' }}>
            No downloads yet. Search for movies or TV shows above to get started!
          </p>
        ) : (
          sortedTorrents.map((torrent) => {
            const isActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(torrent.state);
            const getStatusText = (state) => {
              const statusMap = {
                'downloading': '⬇️ Downloading',
                'stalledDL': '⏸️ Waiting',
                'pausedDL': '⏸️ Paused',
                'pausedUP': '⏸️ Paused',
                'uploading': '⬆️ Sharing',
                'stalledUP': '✓ Complete',
                'queuedDL': '⏳ Queued',
                'queuedUP': '⏳ Queued',
                'checkingDL': '🔍 Checking',
                'checkingUP': '🔍 Checking',
                'metaDL': '📋 Getting info',
                'forcedDL': '⬇️ Downloading'
              };
              return statusMap[state] || state;
            };

            return (
              <div key={torrent.hash} style={{ 
                padding: '1rem', 
                borderBottom: '1px solid #2a2a3e',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                background: isActive ? 'rgba(102, 126, 234, 0.05)' : 'rgba(255,255,255,0.02)',
                borderRadius: '6px',
                marginBottom: '0.5rem',
                borderLeft: isActive ? '3px solid #667eea' : 'none'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ 
                    color: '#e0e0e0',
                    display: 'block',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    lineHeight: '1.4'
                  }}>
                    {torrent.name}
                  </strong>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#b0b0c0', 
                    marginTop: '0.5rem',
                    wordBreak: 'break-word'
                  }}>
                    {formatBytes(torrent.size)} GB • {(torrent.progress * 100).toFixed(1)}% complete • {getStatusText(torrent.state)}
                  </p>
                  {torrent.dlspeed > 0 && (
                    <p style={{ 
                      fontSize: '0.75rem', 
                      color: '#4caf50', 
                      marginTop: '0.25rem',
                      wordBreak: 'break-word'
                    }}>
                      ⬇ Downloading at {formatSpeed(torrent.dlspeed)} MB/s
                      {torrent.upspeed > 0 && ` • ⬆ Sharing at ${formatSpeed(torrent.upspeed)} MB/s`}
                    </p>
                  )}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '0.5rem',
                  flexShrink: 0,
                  minWidth: '100px'
                }}>
                  {torrent.state === 'pausedDL' || torrent.state === 'pausedUP' ? (
                    <button 
                      className="button" 
                      onClick={() => controlTorrent('resume', torrent.hash)}
                      style={{ width: '100%', whiteSpace: 'nowrap' }}
                    >
                      ▶️ Resume
                    </button>
                  ) : (
                    <button 
                      className="button" 
                      onClick={() => controlTorrent('pause', torrent.hash)}
                      style={{ width: '100%', whiteSpace: 'nowrap' }}
                    >
                      ⏸️ Pause
                    </button>
                  )}
                  <button 
                    className="button button-danger" 
                    onClick={() => {
                      if (confirm(`Remove "${torrent.name}" from downloads?`)) {
                        controlTorrent('delete', torrent.hash);
                      }
                    }}
                    style={{ width: '100%', whiteSpace: 'nowrap' }}
                  >
                    🗑️ Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default QBittorrent;
