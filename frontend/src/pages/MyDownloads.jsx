import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';

function MyDownloads() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTorrents, setSelectedTorrents] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  const getSortedTorrents = () => {
    const sorted = [...torrents];
    
    // Default sorting: active downloads first, then by progress
    sorted.sort((a, b) => {
      const aActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(a.state);
      const bActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(b.state);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (a.progress < 1 && b.progress >= 1) return -1;
      if (a.progress >= 1 && b.progress < 1) return 1;
      return 0;
    });
    
    return sorted;
  };

  const controlTorrent = async (action, hash, deleteFiles = true) => {
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, {
        hashes: hash,
        deleteFiles: deleteFiles
      });
      
      const actionMessages = {
        pause: 'Torrent paused',
        resume: 'Torrent resumed',
        delete: 'Torrent removed'
      };
      
      showToast(actionMessages[action] || 'Action completed', 'success');
      setTimeout(fetchTorrents, 500);
    } catch (error) {
      showToast('Error: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedTorrents.size === 0) {
      showToast('No torrents selected', 'warning');
      return;
    }
    
    const hashes = Array.from(selectedTorrents).join('|');
    
    if (action === 'delete') {
      setConfirmDelete({ hashes, count: selectedTorrents.size });
      return;
    }
    
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, { hashes });
      showToast(`${selectedTorrents.size} torrent(s) ${action}d`, 'success');
      setSelectedTorrents(new Set());
      setTimeout(fetchTorrents, 500);
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  };

  const toggleSelectTorrent = (hash) => {
    const newSelected = new Set(selectedTorrents);
    if (newSelected.has(hash)) {
      newSelected.delete(hash);
    } else {
      newSelected.add(hash);
    }
    setSelectedTorrents(newSelected);
  };

  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024 / 1024).toFixed(2);
  };

  const formatSpeed = (bytesPerSec) => {
    const mbps = bytesPerSec / 1024 / 1024;
    return mbps.toFixed(2);
  };

  const formatETA = (seconds) => {
    if (seconds === 8640000 || seconds <= 0) return '∞';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getPriorityIcon = (priority) => {
    if (priority >= 7) return '🔥'; // Maximum priority
    if (priority >= 6) return '⚡'; // High priority
    if (priority >= 4) return '📈'; // Medium-high priority
    return '📊'; // Normal priority
  };

  const getPriorityText = (priority) => {
    if (priority >= 7) return 'Max Priority';
    if (priority >= 6) return 'High Priority';
    if (priority >= 4) return 'Medium Priority';
    return 'Normal';
  };

  const getStatusText = (state) => {
    const statusMap = {
      'downloading': 'Downloading',
      'stalledDL': 'Waiting for peers',
      'pausedDL': 'Paused',
      'pausedUP': 'Paused',
      'uploading': 'Seeding',
      'stalledUP': 'Completed',
      'queuedDL': 'Queued',
      'queuedUP': 'Queued',
      'checkingDL': 'Checking files',
      'checkingUP': 'Checking files',
      'metaDL': 'Getting metadata',
      'forcedDL': 'Force downloading',
      'error': 'Error',
      'missingFiles': 'Missing files',
      'allocating': 'Allocating space'
    };
    return statusMap[state] || state;
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card">
          <h2>📥 Downloads</h2>
          <LoadingSkeleton count={3} height="100px" />
        </div>
      </div>
    );
  }

  const sortedTorrents = getSortedTorrents();
  const downloadingCount = torrents.filter(t => ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(t.state)).length;
  const completedCount = torrents.filter(t => t.progress >= 1).length;

  return (
    <div className="fade-in">
      {/* Error State */}
      {error && (
        <div className="card" style={{ background: 'rgba(244, 67, 54, 0.1)', borderColor: '#f44336' }}>
          <h2>⚠️ Connection Error</h2>
          <p style={{ color: '#f44336', marginBottom: '0.5rem' }}>
            {error}
          </p>
          <p style={{ color: '#b0b0c0', fontSize: '0.875rem' }}>
            The download service isn't responding. Check if it's running.
          </p>
        </div>
      )}



      {/* Torrents List */}
      <div className="card">
        {sortedTorrents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📥</div>
            <div className="empty-state-title">No downloads</div>
            <p className="empty-state-message">
              Start by adding a torrent!
            </p>
            <button className="button" onClick={() => navigate('/add-torrent')}>
              <span>➕</span>
              <span>Add Torrent</span>
            </button>
          </div>
        ) : (
          <div className="mobile-grid">
            {sortedTorrents.map((torrent) => {
              const isActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(torrent.state);
              const isSelected = selectedTorrents.has(torrent.hash);
              const isPaused = torrent.state === 'pausedDL' || torrent.state === 'pausedUP';
              
              return (
                <div 
                  key={torrent.hash} 
                  className="mobile-card"
                  style={{ 
                    background: isSelected 
                      ? 'rgba(102, 126, 234, 0.15)' 
                      : isActive 
                      ? 'rgba(102, 126, 234, 0.05)' 
                      : 'rgba(255,255,255,0.02)',
                    borderLeft: isActive ? '3px solid #667eea' : '3px solid transparent',
                    border: isSelected ? '1px solid #667eea' : '1px solid #2a2a3e'
                  }}
                >
                  {/* Header with Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectTorrent(torrent.hash)}
                      style={{ 
                        cursor: 'pointer',
                        marginTop: '0.25rem',
                        flexShrink: 0
                      }}
                    />
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.5rem' }}>
                        {torrent.name}
                      </div>
                      
                      {/* Status Badge and Priority */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <span className={`status-badge ${
                          torrent.progress >= 1 ? 'status-active' : 
                          isPaused ? 'status-warning' : 
                          isActive ? 'status-active' : 'status-inactive'
                        }`}>
                          {getStatusText(torrent.state)}
                        </span>
                        
                        {torrent.episodePriorityEnabled && (
                          <span 
                            className="status-badge"
                            style={{ 
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              fontSize: '0.7rem'
                            }}
                            title={getPriorityText(torrent.priority || 1)}
                          >
                            {getPriorityIcon(torrent.priority || 1)} Episodes
                          </span>
                        )}
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="progress-bar" style={{ marginBottom: '0.75rem' }}>
                        <div 
                          className="progress-fill" 
                          style={{ 
                            width: `${(torrent.progress * 100).toFixed(1)}%`,
                            background: torrent.progress >= 1 
                              ? 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          }} 
                        />
                      </div>
                      
                      {/* Torrent Meta Information */}
                      <div className="torrent-meta">
                        {/* First line: Size, Progress, ETA */}
                        <div className="torrent-meta-line">
                          <span>{formatBytes(torrent.size)} GB</span>
                          <span>{(torrent.progress * 100).toFixed(1)}%</span>
                          {torrent.eta > 0 && torrent.eta < 8640000 && (
                            <span>ETA: {formatETA(torrent.eta)}</span>
                          )}
                        </div>
                        
                        {/* Second line: Down and Up speeds */}
                        {(torrent.dlspeed > 0 || torrent.upspeed > 0) && (
                          <div className="torrent-meta-line">
                            {torrent.dlspeed > 0 && (
                              <span style={{ color: '#4caf50' }}>
                                ⬇ {formatSpeed(torrent.dlspeed)} MB/s
                              </span>
                            )}
                            {torrent.upspeed > 0 && (
                              <span style={{ color: '#2196f3' }}>
                                ⬆ {formatSpeed(torrent.upspeed)} MB/s
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="mobile-grid-2">
                    <button 
                      className="button button-small" 
                      onClick={() => controlTorrent(isPaused ? 'resume' : 'pause', torrent.hash)}
                    >
                      <span>{isPaused ? '▶️' : '⏸️'}</span>
                      <span>{isPaused ? 'Resume' : 'Pause'}</span>
                    </button>
                    <button 
                      className="button button-small button-danger" 
                      onClick={() => setConfirmDelete({ hashes: torrent.hash, name: torrent.name })}
                    >
                      <span>🗑️</span>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dynamic FAB - Add Torrent or Bulk Actions */}
      {selectedTorrents.size > 0 ? (
        <div className="fab-group">
          <button 
            className="fab fab-bulk" 
            onClick={() => handleBulkAction('resume')}
            title="Resume Selected"
          >
            ▶️
          </button>
          <button 
            className="fab fab-bulk" 
            onClick={() => handleBulkAction('pause')}
            title="Pause Selected"
          >
            ⏸️
          </button>
          <button 
            className="fab fab-bulk fab-danger" 
            onClick={() => handleBulkAction('delete')}
            title="Delete Selected"
          >
            🗑️
          </button>
        </div>
      ) : (
        <button 
          className="fab" 
          onClick={() => navigate('/add-torrent')}
          title="Add Torrent"
        >
          ➕
        </button>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <ConfirmModal
          title="Remove Torrent"
          message={confirmDelete.name 
            ? `Remove "${confirmDelete.name}"? This will delete the downloaded files.`
            : `Remove ${confirmDelete.count} torrent(s)? This will delete the downloaded files.`
          }
          confirmText="Remove"
          cancelText="Cancel"
          type="danger"
          onConfirm={() => {
            controlTorrent('delete', confirmDelete.hashes);
            setConfirmDelete(null);
            setSelectedTorrents(new Set());
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

export default MyDownloads;