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
      
      setSearchId(response.data.id);
      
      // Poll for results
      const pollResults = setInterval(async () => {
        try {
          const results = await axios.get(`/api/qbittorrent/search/results/${response.data.id}`);
          if (results.data.results) {
            setSearchResults(results.data.results);
          }
          if (results.data.status === 'Stopped') {
            clearInterval(pollResults);
            setSearching(false);
          }
        } catch (err) {
          console.error('Error fetching results:', err);
        }
      }, 2000);

      // Stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollResults);
        setSearching(false);
        if (searchId) {
          axios.post('/api/qbittorrent/search/stop', { id: searchId }).catch(() => {});
        }
      }, 30000);
    } catch (error) {
      alert('Error searching: ' + (error.response?.data?.error || error.message));
      setSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    setSelectedTorrent(result);
    setShowAdvanced(true);
  };

  const addSearchedTorrent = async () => {
    if (!selectedTorrent) return;

    try {
      await axios.post('/api/qbittorrent/torrents/add-advanced', {
        urls: selectedTorrent.descrLink,
        savepath: advancedOptions.savepath,
        sequentialDownload: advancedOptions.sequentialDownload
      });
      
      setSelectedTorrent(null);
      setShowAdvanced(false);
      setSearchResults([]);
      setSearchQuery('');
      setTimeout(fetchTorrents, 1000);
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

  const controlTorrent = async (action, hash) => {
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, {
        hashes: hash
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
      <h1>qBittorrent</h1>
      
      {error && (
        <div className="card" style={{ background: 'rgba(244, 67, 54, 0.1)', borderColor: '#f44336' }}>
          <p style={{ color: '#f44336' }}>
            <strong>Connection Error:</strong> {error}
          </p>
          <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Make sure qBittorrent is running on port 8080
          </p>
        </div>
      )}

      <div className="card">
        <h2>🔍 Search for TV or Movies</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="input"
            type="text"
            placeholder="Search for TV shows or movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchTorrents()}
            style={{ marginBottom: 0 }}
          />
          <button 
            className="button" 
            onClick={searchTorrents}
            disabled={searching}
            style={{ minWidth: '100px' }}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '1rem' }}>
            <p style={{ color: '#667eea', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              Found {searchResults.length} results
            </p>
            {searchResults.map((result, index) => (
              <div 
                key={index}
                onClick={() => selectSearchResult(result)}
                style={{
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '6px',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  border: '1px solid #2a2a3e',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: '#e0e0e0', display: 'block', wordBreak: 'break-word' }}>
                      {result.fileName}
                    </strong>
                    <p style={{ fontSize: '0.75rem', color: '#b0b0c0', marginTop: '0.25rem' }}>
                      {(result.fileSize / 1024 / 1024 / 1024).toFixed(2)} GB • Seeds: {result.nbSeeders} • Peers: {result.nbLeechers}
                    </p>
                  </div>
                  <button 
                    className="button"
                    style={{ flexShrink: 0, fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdvanced && selectedTorrent && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>Advanced Download Options</h2>
          <p style={{ color: '#e0e0e0', marginBottom: '1rem', wordBreak: 'break-word' }}>
            <strong>Selected:</strong> {selectedTorrent.fileName}
          </p>
          
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <strong style={{ color: '#667eea', display: 'block', marginBottom: '0.5rem' }}>
              Download Location
            </strong>
            <input
              className="input"
              type="text"
              value={advancedOptions.savepath}
              onChange={(e) => setAdvancedOptions({ ...advancedOptions, savepath: e.target.value })}
              style={{ marginBottom: 0 }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={advancedOptions.sequentialDownload}
              onChange={(e) => setAdvancedOptions({ ...advancedOptions, sequentialDownload: e.target.checked })}
              style={{ width: 'auto', margin: 0 }}
            />
            <span style={{ color: '#e0e0e0' }}>Enable Sequential Download (for streaming)</span>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={addSearchedTorrent}>
              Add Torrent
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
        <h2>Add Torrent Manually</h2>
        <input
          className="input"
          type="text"
          placeholder="Magnet link or torrent URL"
          value={newTorrent}
          onChange={(e) => setNewTorrent(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTorrent()}
        />
        <button className="button" onClick={addTorrent}>Add Torrent</button>
      </div>

      <div className="card">
        <h2>Torrents ({torrents.length})</h2>
        {torrents.length === 0 ? (
          <p style={{ color: '#b0b0c0', textAlign: 'center', padding: '2rem' }}>
            No torrents found. Add a torrent to get started.
          </p>
        ) : (
          sortedTorrents.map((torrent) => (
            <div key={torrent.hash} style={{ 
              padding: '1rem', 
              borderBottom: '1px solid #2a2a3e',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '6px',
              marginBottom: '0.5rem'
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
                  {formatBytes(torrent.size)} GB • {(torrent.progress * 100).toFixed(1)}% • {torrent.state}
                </p>
                {torrent.dlspeed > 0 && (
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#667eea', 
                    marginTop: '0.25rem',
                    wordBreak: 'break-word'
                  }}>
                    ↓ {formatSpeed(torrent.dlspeed)} MB/s
                    {torrent.upspeed > 0 && ` • ↑ ${formatSpeed(torrent.upspeed)} MB/s`}
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
                    Resume
                  </button>
                ) : (
                  <button 
                    className="button" 
                    onClick={() => controlTorrent('pause', torrent.hash)}
                    style={{ width: '100%', whiteSpace: 'nowrap' }}
                  >
                    Pause
                  </button>
                )}
                <button 
                  className="button button-danger" 
                  onClick={() => {
                    if (confirm(`Delete "${torrent.name}"?`)) {
                      controlTorrent('delete', torrent.hash);
                    }
                  }}
                  style={{ width: '100%', whiteSpace: 'nowrap' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default QBittorrent;
