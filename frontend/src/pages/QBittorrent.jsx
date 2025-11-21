import React, { useState, useEffect } from 'react';
import axios from 'axios';

function QBittorrent({ serverUrl }) {
  const [torrents, setTorrents] = useState([]);
  const [newTorrent, setNewTorrent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        <h2>Add Torrent</h2>
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
          torrents.map((torrent) => (
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
