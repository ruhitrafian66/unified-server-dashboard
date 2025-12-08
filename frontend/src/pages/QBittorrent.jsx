import React, { useState, useEffect } from 'react';
import axios from 'axios';

function QBittorrent({ serverUrl }) {
  const [torrents, setTorrents] = useState([]);
  const [newTorrent, setNewTorrent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchId, setSearchId] = useState(null);
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState({
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

  const searchTorrents = async () => {
    if (!searchQuery.trim()) {
      alert('Please enter a search query');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    
    try {
      const response = await axios.post('/api/qbittorrent/search/start', {
        pattern: searchQuery,
        plugins: 'enabled',
        category: 'all'
      });
      
      const searchJobId = response.data.id;
      setSearchId(searchJobId);
      
      let pollCount = 0;
      const maxPolls = 15; // Poll for 15 seconds
      let lastTotal = 0;
      let stableCount = 0;
      
      // Poll for status and results
      const pollResults = setInterval(async () => {
        try {
          pollCount++;
          
          // Check status first
          const status = await axios.get(`/api/qbittorrent/search/status/${searchJobId}`);
          
          if (status.data && status.data.length > 0) {
            const searchStatus = status.data[0];
            const statusStr = searchStatus.status;
            const total = searchStatus.total || 0;
            
            console.log(`Search status: ${statusStr}, Total: ${total}`);
            
            // Check if results are stable (not increasing)
            if (total > 0 && total === lastTotal) {
              stableCount++;
            } else {
              stableCount = 0;
            }
            lastTotal = total;
            
            // Get results if stopped OR if we have results and they're stable for 2 checks
            if ((statusStr === 'Stopped' && total > 0) || (total > 0 && stableCount >= 2)) {
              // Get results
              const results = await axios.get(`/api/qbittorrent/search/results/${searchJobId}?limit=200`);
              
              if (results.data && results.data.results && results.data.results.length > 0) {
                setSearchResults(results.data.results);
                clearInterval(pollResults);
                setSearching(false);
                
                // Stop search
                try {
                  await axios.post('/api/qbittorrent/search/stop', { id: searchJobId });
                } catch (e) {}
                
                return;
              }
            } else if (statusStr === 'Stopped' && total === 0) {
              clearInterval(pollResults);
              setSearching(false);
              alert('No results found. Try a different search term.');
              return;
            }
          }
          
          // Stop after max polls
          if (pollCount >= maxPolls) {
            clearInterval(pollResults);
            setSearching(false);
            
            // Try to get any results we have
            try {
              const results = await axios.get(`/api/qbittorrent/search/results/${searchJobId}?limit=200`);
              if (results.data && results.data.results && results.data.results.length > 0) {
                setSearchResults(results.data.results);
              } else {
                alert('Search timed out. No results found.');
              }
            } catch (e) {
              alert('Search timed out.');
            }
            
            // Stop the search job
            try {
              await axios.post('/api/qbittorrent/search/stop', { id: searchJobId });
            } catch (e) {}
          }
        } catch (err) {
          console.error('Error during search:', err);
          clearInterval(pollResults);
          setSearching(false);
          alert('Search failed: ' + (err.response?.data?.error || err.message));
        }
      }, 1000); // Poll every 1 second
    } catch (error) {
      alert('Error starting search: ' + (error.response?.data?.error || error.message));
      setSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    setSelectedTorrent(result);
    setShowAdvanced(true);
  };

  const addSearchedTorrent = async () => {
    if (!selectedTorrent) return;

    // Validate that we have a valid magnet link or torrent URL
    const url = selectedTorrent.fileUrl;
    if (!url || url.trim() === '') {
      alert('Error: No download link available for this torrent. Try a different result.');
      return;
    }

    // Only allow magnet links or .torrent file URLs
    if (!url.startsWith('magnet:') && !url.endsWith('.torrent')) {
      alert('Error: Invalid download link. This result does not have a direct download link.');
      return;
    }

    try {
      await axios.post('/api/qbittorrent/torrents/add-advanced', {
        urls: url,
        sequentialDownload: advancedOptions.sequentialDownload
      });
      
      setSelectedTorrent(null);
      setShowAdvanced(false);
      setSearchResults([]);
      setSearchQuery('');
      setTimeout(fetchTorrents, 1000);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      const details = error.response?.data?.details;
      alert('Error adding torrent: ' + errorMsg + (details ? '\nDetails: ' + details : ''));
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
          Search for any movie or TV show to download
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="input"
            type="text"
            placeholder="e.g., Breaking Bad, The Matrix, Game of Thrones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchTorrents()}
            style={{ marginBottom: 0 }}
          />
          <button 
            className="button" 
            onClick={searchTorrents}
            disabled={searching}
            style={{ minWidth: '120px' }}
          >
            {searching ? 'Searching...' : '🔍 Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '1rem' }}>
            <p style={{ color: '#667eea', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              ✓ Found {searchResults.length} results - Click any to download
            </p>
            {searchResults.map((result, index) => {
              const hasValidUrl = result.fileUrl && (result.fileUrl.startsWith('magnet:') || result.fileUrl.endsWith('.torrent'));
              return (
                <div 
                  key={index}
                  onClick={() => hasValidUrl && selectSearchResult(result)}
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                    cursor: hasValidUrl ? 'pointer' : 'not-allowed',
                    border: '1px solid #2a2a3e',
                    transition: 'all 0.2s',
                    opacity: hasValidUrl ? 1 : 0.5
                  }}
                  onMouseEnter={(e) => hasValidUrl && (e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)')}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: '#e0e0e0', display: 'block', wordBreak: 'break-word' }}>
                        {result.fileName}
                      </strong>
                      <p style={{ fontSize: '0.75rem', color: '#b0b0c0', marginTop: '0.25rem' }}>
                        Size: {(result.fileSize / 1024 / 1024 / 1024).toFixed(2)} GB • Quality: {result.nbSeeders > 10 ? 'Good' : 'Fair'} ({result.nbSeeders} sources)
                        {!hasValidUrl && <span style={{ color: '#f44336' }}> • No download link</span>}
                      </p>
                    </div>
                    <button 
                      className="button"
                      disabled={!hasValidUrl}
                      style={{ 
                        flexShrink: 0, 
                        fontSize: '0.875rem', 
                        padding: '0.5rem 1rem',
                        opacity: hasValidUrl ? 1 : 0.5,
                        cursor: hasValidUrl ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {hasValidUrl ? '⬇ Download' : '✗ Unavailable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdvanced && selectedTorrent && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>⚙️ Download Settings</h2>
          <p style={{ color: '#e0e0e0', marginBottom: '1rem', wordBreak: 'break-word' }}>
            <strong>Ready to download:</strong> {selectedTorrent.fileName}
          </p>

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
