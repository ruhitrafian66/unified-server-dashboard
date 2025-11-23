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
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('status');
  const [selectedTorrents, setSelectedTorrents] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

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

  const getFilteredTorrents = () => {
    let filtered = [...torrents];
    
    // Apply filter
    if (filter === 'downloading') {
      filtered = filtered.filter(t => ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(t.state));
    } else if (filter === 'paused') {
      filtered = filtered.filter(t => ['pausedDL', 'pausedUP'].includes(t.state));
    } else if (filter === 'complete') {
      filtered = filtered.filter(t => t.progress >= 1);
    } else if (filter === 'seeding') {
      filtered = filtered.filter(t => ['uploading', 'stalledUP'].includes(t.state));
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'status') {
        const aActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(a.state);
        const bActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(b.state);
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        if (a.progress < 1 && b.progress >= 1) return -1;
        if (a.progress >= 1 && b.progress < 1) return 1;
        return 0;
      } else if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        return b.size - a.size;
      } else if (sortBy === 'progress') {
        return b.progress - a.progress;
      } else if (sortBy === 'speed') {
        return b.dlspeed - a.dlspeed;
      }
      return 0;
    });
    
    return filtered;
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

  const toggleSelectAll = () => {
    if (selectedTorrents.size === filteredTorrents.length) {
      setSelectedTorrents(new Set());
    } else {
      setSelectedTorrents(new Set(filteredTorrents.map(t => t.hash)));
    }
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
          <LoadingSkeleton count={5} height="100px" />
        </div>
      </div>
    );
  }

  const filteredTorrents = getFilteredTorrents();
  const downloadingCount = torrents.filter(t => ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(t.state)).length;
  const completedCount = torrents.filter(t => t.progress >= 1).length;

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
        {/* Controls Bar */}
        <div className="controls-bar" style={{ marginBottom: '1rem' }}>
          <button 
            className="button"
            onClick={() => setShowFilters(true)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            🎛️ Filters & Sort
          </button>
          
          {selectedTorrents.size > 0 && (
            <>
              <button className="filter-button" onClick={() => handleBulkAction('pause')}>
                ⏸️ Pause ({selectedTorrents.size})
              </button>
              <button className="filter-button" onClick={() => handleBulkAction('resume')}>
                ▶️ Resume ({selectedTorrents.size})
              </button>
              <button className="filter-button" onClick={() => handleBulkAction('delete')} style={{ color: '#f44336' }}>
                🗑️ Delete ({selectedTorrents.size})
              </button>
            </>
          )}
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {(filter !== 'all' || sortBy !== 'status') && (
              <span style={{ fontSize: '0.75rem', color: '#667eea' }}>
                {filter !== 'all' && `Filter: ${filter}`}
                {filter !== 'all' && sortBy !== 'status' && ' • '}
                {sortBy !== 'status' && `Sort: ${sortBy}`}
              </span>
            )}
          </div>
        </div>

        {/* Torrents List */}
        {filteredTorrents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📥</div>
            <div className="empty-state-title">No downloads yet</div>
            <p className="empty-state-message">
              {filter === 'all' 
                ? "Start by searching for movies or TV shows!" 
                : `No ${filter} downloads found`}
            </p>
            <button className="button" onClick={() => navigate('/add-torrent')}>
              ➕ Add New Torrent
            </button>
          </div>
        ) : (
          filteredTorrents.map((torrent) => {
            const isActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(torrent.state);
            const isSelected = selectedTorrents.has(torrent.hash);
            
            return (
              <div key={torrent.hash} style={{ 
                padding: '1rem', 
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                background: isSelected ? 'rgba(102, 126, 234, 0.15)' : isActive ? 'rgba(102, 126, 234, 0.05)' : 'rgba(255,255,255,0.02)',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                borderLeft: isActive ? '3px solid #667eea' : '3px solid transparent',
                border: isSelected ? '1px solid #667eea' : '1px solid #2a2a3e',
                transition: 'all 0.2s'
              }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectTorrent(torrent.hash)}
                  style={{ 
                    width: '18px', 
                    height: '18px', 
                    cursor: 'pointer',
                    marginTop: '0.25rem',
                    flexShrink: 0
                  }}
                />
                
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ 
                    color: '#e0e0e0',
                    display: 'block',
                    wordBreak: 'break-word',
                    lineHeight: '1.4',
                    marginBottom: '0.5rem'
                  }}>
                    {torrent.name}
                  </strong>
                  
                  {/* Progress Bar */}
                  <div className="progress-bar" style={{ marginBottom: '0.5rem' }}>
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
                  
                  <div style={{ 
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    fontSize: '0.875rem', 
                    color: '#b0b0c0'
                  }}>
                    <span>{formatBytes(torrent.size)} GB</span>
                    <span>{(torrent.progress * 100).toFixed(1)}%</span>
                    <span>{getStatusText(torrent.state)}</span>
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
                    {torrent.eta > 0 && torrent.eta < 8640000 && (
                      <span>ETA: {formatETA(torrent.eta)}</span>
                    )}
                  </div>
                </div>
                
                {/* Action Buttons */}
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
                      style={{ width: '100%', whiteSpace: 'nowrap', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      ▶️ Resume
                    </button>
                  ) : (
                    <button 
                      className="button" 
                      onClick={() => controlTorrent('pause', torrent.hash)}
                      style={{ width: '100%', whiteSpace: 'nowrap', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      ⏸️ Pause
                    </button>
                  )}
                  <button 
                    className="button button-danger" 
                    onClick={() => setConfirmDelete({ hashes: torrent.hash, name: torrent.name })}
                    style={{ width: '100%', whiteSpace: 'nowrap', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    🗑️ Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Filters & Sort Modal */}
      {showFilters && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setShowFilters(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: '1px solid #2a2a3e'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '1.5rem', color: '#e0e0e0' }}>🎛️ Filters & Sort</h2>
            
            {/* Filter Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: '#667eea', marginBottom: '0.75rem' }}>Filter by Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <button 
                  className={`filter-button ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                  style={{ width: '100%' }}
                >
                  All ({torrents.length})
                </button>
                <button 
                  className={`filter-button ${filter === 'downloading' ? 'active' : ''}`}
                  onClick={() => setFilter('downloading')}
                  style={{ width: '100%' }}
                >
                  Downloading ({downloadingCount})
                </button>
                <button 
                  className={`filter-button ${filter === 'complete' ? 'active' : ''}`}
                  onClick={() => setFilter('complete')}
                  style={{ width: '100%' }}
                >
                  Complete ({completedCount})
                </button>
                <button 
                  className={`filter-button ${filter === 'paused' ? 'active' : ''}`}
                  onClick={() => setFilter('paused')}
                  style={{ width: '100%' }}
                >
                  Paused
                </button>
                <button 
                  className={`filter-button ${filter === 'seeding' ? 'active' : ''}`}
                  onClick={() => setFilter('seeding')}
                  style={{ width: '100%', gridColumn: 'span 2' }}
                >
                  Seeding
                </button>
              </div>
            </div>

            {/* Sort Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: '#667eea', marginBottom: '0.75rem' }}>Sort by</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <button 
                  className={`filter-button ${sortBy === 'status' ? 'active' : ''}`}
                  onClick={() => setSortBy('status')}
                  style={{ width: '100%' }}
                >
                  Status
                </button>
                <button 
                  className={`filter-button ${sortBy === 'name' ? 'active' : ''}`}
                  onClick={() => setSortBy('name')}
                  style={{ width: '100%' }}
                >
                  Name
                </button>
                <button 
                  className={`filter-button ${sortBy === 'size' ? 'active' : ''}`}
                  onClick={() => setSortBy('size')}
                  style={{ width: '100%' }}
                >
                  Size
                </button>
                <button 
                  className={`filter-button ${sortBy === 'progress' ? 'active' : ''}`}
                  onClick={() => setSortBy('progress')}
                  style={{ width: '100%' }}
                >
                  Progress
                </button>
                <button 
                  className={`filter-button ${sortBy === 'speed' ? 'active' : ''}`}
                  onClick={() => setSortBy('speed')}
                  style={{ width: '100%', gridColumn: 'span 2' }}
                >
                  Speed
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="button"
                onClick={() => {
                  setFilter('all');
                  setSortBy('status');
                }}
                style={{ flex: 1, background: '#6a6a7e' }}
              >
                Reset
              </button>
              <button
                className="button"
                onClick={() => setShowFilters(false)}
                style={{ flex: 1 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <ConfirmModal
          title="Remove Torrent"
          message={confirmDelete.name 
            ? `Are you sure you want to remove "${confirmDelete.name}"? This will also delete the downloaded files.`
            : `Are you sure you want to remove ${confirmDelete.count} torrent(s)? This will also delete the downloaded files.`
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
