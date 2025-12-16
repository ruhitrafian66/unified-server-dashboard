import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';

function OngoingShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newShow, setNewShow] = useState({
    name: '',
    tmdbId: null,
    currentSeason: 1,
    currentEpisode: 0
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);
  const [downloadingSeason, setDownloadingSeason] = useState(null);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchShows();
    fetchAutoCheckStatus();
    fetchQueueStatus();
    
    const queueInterval = setInterval(fetchQueueStatus, 30000);
    return () => clearInterval(queueInterval);
  }, []);

  const fetchAutoCheckStatus = async () => {
    try {
      const response = await axios.get('/api/shows/config/auto-check');
      setAutoCheckEnabled(response.data.enabled);
    } catch (error) {
      console.error('Error fetching auto-check status:', error);
    }
  };

  const fetchQueueStatus = async () => {
    try {
      const response = await axios.get('/api/shows/queue/status');
      setQueueStatus(response.data);
    } catch (error) {
      console.error('Error fetching queue status:', error);
    }
  };

  const fetchShows = async () => {
    try {
      const response = await axios.get('/api/shows');
      setShows(response.data.shows || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching shows:', error);
      showToast('Error loading shows: ' + error.message, 'error');
      setLoading(false);
    }
  };

  const searchShows = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await axios.get(`/api/shows/search/${encodeURIComponent(query)}`);
      setSearchResults(response.data.results || []);
    } catch (error) {
      console.error('Error searching shows:', error);
      setSearchResults([]);
    }
    setSearchLoading(false);
  };

  const selectShow = (show) => {
    setSelectedShow(show);
    setNewShow({
      name: show.name,
      tmdbId: show.id,
      currentSeason: 1,
      currentEpisode: 0
    });
    setSearchResults([]);
  };

  const addShow = async () => {
    if (!selectedShow && !newShow.name.trim()) {
      showToast('Please select a show from search results', 'error');
      return;
    }

    try {
      const payload = selectedShow 
        ? { 
            tmdbId: selectedShow.id, 
            name: selectedShow.name,
            currentSeason: 1,
            currentEpisode: 0
          }
        : { 
            name: newShow.name,
            currentSeason: 1,
            currentEpisode: 0
          };
        
      const response = await axios.post('/api/shows', payload);
      setNewShow({ name: '', tmdbId: null, currentSeason: 1, currentEpisode: 0 });
      setSelectedShow(null);
      setSearchResults([]);
      setShowForm(false);
      fetchShows();
      fetchQueueStatus();
      
      if (response.data.catchUpEpisodes > 0) {
        showToast(`Show added! Caught up on ${response.data.catchUpEpisodes} episodes`, 'success');
      } else {
        showToast('Show added successfully!', 'success');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      showToast('Error adding show: ' + errorMsg, 'error');
    }
  };

  const deleteShow = async (id) => {
    if (!confirm('Remove this show from tracking?')) return;

    try {
      await axios.delete(`/api/shows/${id}`);
      fetchShows();
      showToast('Show removed successfully!', 'success');
    } catch (error) {
      showToast('Error removing show: ' + error.message, 'error');
    }
  };

  const updateShow = async (id, updates) => {
    try {
      await axios.put(`/api/shows/${id}`, updates);
      fetchShows();
      showToast('Show updated successfully!', 'success');
    } catch (error) {
      showToast('Error updating show: ' + error.message, 'error');
    }
  };

  const checkForNewEpisodes = async () => {
    setChecking(true);
    try {
      const response = await axios.post('/api/shows/check');
      
      if (response.data.success) {
        const downloads = response.data.downloads || [];
        if (downloads.length > 0) {
          showToast(`Found ${downloads.length} new episodes!`, 'success');
        } else {
          showToast('No new episodes found', 'info');
        }
        fetchShows();
        fetchQueueStatus();
      } else {
        showToast(response.data.message || 'Check failed', 'error');
      }
    } catch (error) {
      showToast('Error checking for episodes: ' + error.message, 'error');
    }
    setChecking(false);
  };

  const clearSearchQueue = async () => {
    try {
      const response = await axios.post('/api/shows/queue/clear');
      if (response.data.success) {
        showToast(`Cleared ${response.data.clearedCount} items`, 'success');
        fetchQueueStatus();
      }
    } catch (error) {
      showToast('Error clearing queue: ' + error.message, 'error');
    }
  };

  const toggleAutoCheck = async () => {
    try {
      const response = await axios.post('/api/shows/config/auto-check', {
        enabled: !autoCheckEnabled
      });
      
      if (response.data.success) {
        setAutoCheckEnabled(!autoCheckEnabled);
        showToast(response.data.message, 'success');
      }
    } catch (error) {
      showToast('Error toggling auto-check: ' + error.message, 'error');
    }
  };

  const downloadSeason = async (showId, season) => {
    const startEp = prompt('Start from episode:', '1');
    const endEp = prompt('End at episode:', '24');
    
    if (!startEp || !endEp) return;

    setDownloadingSeason(`${showId}-${season}`);
    try {
      const response = await axios.post(`/api/shows/${showId}/season/${season}`, {
        startEpisode: parseInt(startEp),
        endEpisode: parseInt(endEp)
      });
      
      if (response.data.success) {
        const downloads = response.data.downloads || [];
        showToast(`Downloaded ${downloads.length} episodes!`, 'success');
      } else {
        showToast(response.data.message || 'Download failed', 'error');
      }
    } catch (error) {
      showToast('Error downloading season: ' + error.message, 'error');
    }
    setDownloadingSeason(null);
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card">
          <LoadingSkeleton count={3} height="80px" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Status & Controls */}
      <div className="card">
        <h2>📡 Auto Tracking</h2>
        
        {/* Status Info */}
        <div className="mobile-card mb-2">
          <div className="stat-card">
            <div className="stat-icon">
              {autoCheckEnabled ? '✅' : '⏸️'}
            </div>
            <div className="stat-content">
              <div className="stat-label">Auto Check Status</div>
              <div className="stat-value">
                {autoCheckEnabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
          
          {queueStatus && (
            <div className="stat-card mt-1">
              <div className="stat-icon">
                {queueStatus.processing ? '🔄' : queueStatus.queueLength > 0 ? '⏳' : '✅'}
              </div>
              <div className="stat-content">
                <div className="stat-label">Search Queue</div>
                <div className="stat-value">
                  {queueStatus.queueLength > 0 ? (
                    `${queueStatus.queueLength} pending`
                  ) : 'Empty'}
                </div>
                {queueStatus.processing && queueStatus.nextSearchIn > 0 && (
                  <div className="stat-label">
                    Next in {Math.round(queueStatus.nextSearchIn / 1000)}s
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="mobile-grid">
          <button 
            className="button" 
            onClick={toggleAutoCheck}
            style={{ 
              background: autoCheckEnabled 
                ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' 
                : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
            }}
          >
            <span>{autoCheckEnabled ? '⏸️' : '▶️'}</span>
            <span>{autoCheckEnabled ? 'Disable' : 'Enable'}</span>
          </button>
          
          <button 
            className="button" 
            onClick={checkForNewEpisodes}
            disabled={checking}
          >
            <span>{checking ? '🔄' : '🔍'}</span>
            <span>{checking ? 'Checking...' : 'Check Now'}</span>
          </button>
        </div>

        <div className="mobile-grid mt-1">
          <button 
            className="button" 
            onClick={() => setShowForm(!showForm)}
          >
            <span>➕</span>
            <span>Add Show</span>
          </button>
          
          {queueStatus && queueStatus.queueLength > 0 && (
            <button 
              className="button button-danger" 
              onClick={clearSearchQueue}
            >
              <span>🗑️</span>
              <span>Clear Queue ({queueStatus.queueLength})</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Show Form */}
      {showForm && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>➕ Add New Show</h2>
          <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Search for a TV show to automatically track new episodes
          </p>
          
          {/* Search Input */}
          <div className="mobile-search-container">
            <div className="mobile-search-icon">🔍</div>
            <input
              className="mobile-search-input"
              type="text"
              placeholder="Search TV shows..."
              value={newShow.name}
              onChange={(e) => {
                setNewShow({ ...newShow, name: e.target.value });
                searchShows(e.target.value);
              }}
            />
            {searchLoading && (
              <div style={{ 
                position: 'absolute', 
                right: '1rem', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: '#667eea'
              }}>
                🔄
              </div>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto', 
              marginBottom: '1rem',
              border: '1px solid #2a2a3e',
              borderRadius: '12px'
            }}>
              {searchResults.map((show) => (
                <div
                  key={show.id}
                  className="mobile-list-item"
                  onClick={() => selectShow(show)}
                  style={{
                    background: selectedShow?.id === show.id ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer'
                  }}
                >
                  {show.posterPath && (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${show.posterPath}`}
                      alt={show.name}
                      style={{ 
                        width: '40px', 
                        height: '60px', 
                        borderRadius: '8px', 
                        objectFit: 'cover',
                        flexShrink: 0
                      }}
                    />
                  )}
                  <div className="mobile-list-content">
                    <div className="mobile-list-title">{show.name}</div>
                    <div className="mobile-list-subtitle">
                      {show.firstAirDate && `${new Date(show.firstAirDate).getFullYear()}`}
                      {show.voteAverage && ` • ${show.voteAverage.toFixed(1)}/10`}
                    </div>
                    {show.overview && (
                      <div className="mobile-list-subtitle text-truncate">
                        {show.overview.length > 100 ? show.overview.substring(0, 100) + '...' : show.overview}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Show */}
          {selectedShow && (
            <div className="mobile-card mb-2" style={{ 
              background: 'rgba(76, 175, 80, 0.1)', 
              border: '1px solid #4caf50'
            }}>
              <div style={{ color: '#4caf50', fontWeight: '600', marginBottom: '0.5rem' }}>
                ✓ Selected: {selectedShow.name}
              </div>
              <div style={{ color: '#4caf50', fontSize: '0.875rem' }}>
                We'll track future episodes automatically
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="mobile-grid-2">
            <button 
              className="button" 
              onClick={addShow}
              disabled={!selectedShow}
              style={{ 
                opacity: selectedShow ? 1 : 0.5,
                cursor: selectedShow ? 'pointer' : 'not-allowed'
              }}
            >
              <span>✓</span>
              <span>Add Show</span>
            </button>
            <button 
              className="button button-secondary" 
              onClick={() => {
                setShowForm(false);
                setSelectedShow(null);
                setSearchResults([]);
                setNewShow({ name: '', tmdbId: null, currentSeason: 1, currentEpisode: 0 });
              }}
            >
              <span>✕</span>
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Tracked Shows */}
      <div className="card">
        <h2>📋 Tracked Shows ({shows.length})</h2>
        
        {shows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📺</div>
            <div className="empty-state-title">No shows tracked</div>
            <p className="empty-state-message">
              Add shows to automatically download new episodes
            </p>
          </div>
        ) : (
          <div className="mobile-grid">
            {shows.map((show) => (
              <div key={show.id} className="mobile-card">
                {/* Show Info */}
                <div className="mb-2">
                  <div className="mobile-list-title text-wrap">{show.name}</div>
                  <div className="mobile-list-subtitle">
                    S{show.currentSeason.toString().padStart(2, '0')}E{show.currentEpisode.toString().padStart(2, '0')} • 
                    <span style={{ color: show.status === 'active' ? '#4caf50' : '#ff9800' }}>
                      {show.status}
                    </span>
                  </div>
                  {show.nextEpisodeAirDate && (
                    <div className="mobile-list-subtitle">
                      Next: {new Date(show.nextEpisodeAirDate).toLocaleDateString()}
                    </div>
                  )}
                  {show.downloadedEpisodes && show.downloadedEpisodes.length > 0 && (
                    <div style={{ color: '#667eea', fontSize: '0.75rem' }}>
                      Downloaded {show.downloadedEpisodes.length} episodes
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="mobile-grid-3">
                  <button
                    className="button button-small"
                    onClick={() => downloadSeason(show.id, show.currentSeason)}
                    disabled={downloadingSeason === `${show.id}-${show.currentSeason}`}
                  >
                    {downloadingSeason === `${show.id}-${show.currentSeason}` ? '⬇️' : '📥'}
                  </button>
                  <button
                    className="button button-small"
                    onClick={() => updateShow(show.id, { 
                      status: show.status === 'active' ? 'paused' : 'active' 
                    })}
                    style={{ 
                      background: show.status === 'active' 
                        ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' 
                        : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                    }}
                  >
                    {show.status === 'active' ? '⏸️' : '▶️'}
                  </button>
                  <button
                    className="button button-small button-danger"
                    onClick={() => deleteShow(show.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="card">
        <h2>ℹ️ How It Works</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.5' }}>
          <p><strong style={{ color: '#667eea' }}>Quality:</strong> 4K WEB-DL → 1080p WEB-DL → Any available</p>
          <p><strong style={{ color: '#667eea' }}>Timing:</strong> Episodes searched 1 hour after air time</p>
          <p><strong style={{ color: '#667eea' }}>Storage:</strong> Only downloads with 5GB+ free space</p>
          <p><strong style={{ color: '#667eea' }}>Selection:</strong> Picks torrents with most seeders</p>
        </div>
      </div>
    </div>
  );
}

export default OngoingShows;