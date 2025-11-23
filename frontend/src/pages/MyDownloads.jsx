import React, { useState, useEffect } from 'react';
import axios from 'axios';

function MyDownloads() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, 5000);
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

  const sortedTorrents = [...torrents].sort((a, b) => {
    const aActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(a.state);
    const bActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(b.state);
    
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    
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
      setTimeout(fetchTorrents, 500);
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

  if (loading) {
    return (
      <div>
        <h1>My Downloads</h1>
        <div className="card">
          <p style={{ color: '#b0b0c0' }}>Loading torrents...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>My Downloads</h1>
      
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
        <h2>📥 Active Downloads ({torrents.length})</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Active downloads appear at the top
        </p>
        {torrents.length === 0 ? (
          <p style={{ color: '#b0b0c0', textAlign: 'center', padding: '2rem' }}>
            No downloads yet. Go to "Add Torrent" to search for movies or TV shows!
          </p>
        ) : (
          sortedTorrents.map((torrent) => {
            const isActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(torrent.state);
            
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

export default MyDownloads;
