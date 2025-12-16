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
  const [trackedShowsCollapsed, setTrackedShowsCollapsed] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchShows();
    fetchAutoCheckStatus();
    fetchQueueStatus();
    
    // Poll queue status every 30 seconds
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
      showToast('Please select a show from the search results', 'error');
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
      fetchQueueStatus(); // Refresh queue status after adding show
      
      // Show appropriate message based on catch-up results
      if (response.data.catchUpEpisodes > 0) {
        showToast(`Show added! Caught up on ${response.data.catchUpEpisodes} episodes that had already aired.`, 'success');
      } else {
        showToast('Show added successfully! We\'ll track new episodes from here.', 'success');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      showToast('Error adding show: ' + errorMsg, 'error');
    }
  };

  const deleteShow = async (id) => {
    if (!confirm('Are you sure you want to remove this show?')) return;

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
          showToast(`Found and downloaded ${downloads.length} new episodes!`, 'success');
        } else {
          showToast('No new episodes found', 'info');
        }
        fetchShows();
        fetchQueueStatus(); // Refresh queue status
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
        showToast(`Cleared ${response.data.clearedCount} items from search queue`, 'success');
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
    const startEp = prompt('Start from episode number:', '1');
    const endEp = prompt('End at episode number:', '24');
    
    if (!startEp || !endEp) return;

    setDownloadingSeason(`${showId}-${season}`);
    try {
      const response = await axios.post(`/api/shows/${showId}/season/${season}`, {
        startEpisode: parseInt(startEp),
        endEpisode: parseInt(endEp)
      });
      
      if (response.data.success) {
        const downloads = response.data.downloads || [];
        showToast(`Downloaded ${downloads.length} episodes from season ${season}!`, 'success');
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
      <div>
        <div className="card">
          <LoadingSkeleton count={3} height="80px" />
        </div>
      </div>
    );
  }

  return (
    <div>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2>Automatic Episode Tracking</h2>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', margin: 0 }}>
              Automatically search and download new episodes as they become available
            </p>
            <p style={{ color: autoCheckEnabled ? '#4caf50' : '#ff9800', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Auto-check: {autoCheckEnabled ? '✅ Enabled (targeted by air time)' : '⏸️ Disabled'}
            </p>
            {queueStatus && (
              <p style={{ color: queueStatus.processing ? '#667eea' : '#b0b0c0', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Search Queue: {queueStatus.queueLength > 0 ? (
                  <>
                    {queueStatus.processing ? '🔄' : '⏳'} {queueStatus.queueLength} pending
                    {queueStatus.processing && queueStatus.nextSearchIn > 0 && 
                      ` (next in ${Math.round(queueStatus.nextSearchIn / 1000)}s)`
                    }
                  </>
                ) : '✅ Empty'}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="button" 
              onClick={toggleAutoCheck}
              style={{ 
                background: autoCheckEnabled ? '#ff9800' : '#4caf50',
                fontSize: '0.875rem'
              }}
            >
              {autoCheckEnabled ? '⏸️ Disable Targeted' : '▶️ Enable Targeted'}
            </button>
            <button 
              className="button" 
              onClick={checkForNewEpisodes}
              disabled={checking}
            >
              {checking ? '🔄 Checking...' : '🔍 Check Now'}
            </button>
            <button 
              className="button" 
              onClick={() => setShowForm(!showForm)}
            >
              ➕ Add Show
            </button>
            {queueStatus && queueStatus.queueLength > 0 && (
              <button 
                className="button" 
                onClick={clearSearchQueue}
                style={{ 
                  background: '#ff5722',
                  fontSize: '0.875rem'
                }}
              >
                🗑️ Clear Queue ({queueStatus.queueLength})
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <div style={{ 
            background: 'rgba(102, 126, 234, 0.1)', 
            borderColor: '#667eea',
            border: '1px solid #667eea',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ color: '#667eea', marginTop: 0 }}>Add New Show</h3>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Search for a TV show and we'll automatically track new episodes for you. We assume you're caught up and will only search for future episodes.
            </p>
            
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <input
                className="input"
                type="text"
                placeholder="Search for TV shows (e.g., Breaking Bad, The Bear)..."
                value={newShow.name}
                onChange={(e) => {
                  setNewShow({ ...newShow, name: e.target.value });
                  searchShows(e.target.value);
                }}
                style={{ marginBottom: 0 }}
              />
              {searchLoading && (
                <div style={{ 
                  position: 'absolute', 
                  right: '10px', 
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
                borderRadius: '6px'
              }}>
                {searchResults.map((show) => (
                  <div
                    key={show.id}
                    onClick={() => selectShow(show)}
                    style={{
                      padding: '0.75rem',
                      borderBottom: '1px solid #2a2a3e',
                      cursor: 'pointer',
                      background: selectedShow?.id === show.id ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.02)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedShow?.id === show.id ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.02)'}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      {show.posterPath && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${show.posterPath}`}
                          alt={show.name}
                          style={{ width: '40px', height: '60px', borderRadius: '4px', objectFit: 'cover' }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#e0e0e0', fontWeight: '600', marginBottom: '0.25rem' }}>
                          {show.name}
                        </div>
                        <div style={{ color: '#b0b0c0', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                          {show.firstAirDate && `First aired: ${new Date(show.firstAirDate).getFullYear()}`}
                          {show.voteAverage && ` • Rating: ${show.voteAverage.toFixed(1)}/10`}
                        </div>
                        {show.overview && (
                          <div style={{ color: '#b0b0c0', fontSize: '0.75rem', lineHeight: '1.3' }}>
                            {show.overview.length > 150 ? show.overview.substring(0, 150) + '...' : show.overview}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Show Info */}
            {selectedShow && (
              <div style={{ 
                background: 'rgba(76, 175, 80, 0.1)', 
                border: '1px solid #4caf50',
                borderRadius: '6px',
                padding: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div style={{ color: '#4caf50', fontWeight: '600', marginBottom: '0.25rem' }}>
                  ✓ Selected: {selectedShow.name}
                </div>
                <div style={{ color: '#b0b0c0', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  {selectedShow.firstAirDate && `First aired: ${new Date(selectedShow.firstAirDate).getFullYear()}`}
                  {selectedShow.voteAverage && ` • Rating: ${selectedShow.voteAverage.toFixed(1)}/10`}
                </div>
                <div style={{ color: '#4caf50', fontSize: '0.75rem' }}>
                  📺 We'll assume you're caught up and track future episodes automatically
                </div>
              </div>
            )}



            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="button" 
                onClick={addShow}
                disabled={!selectedShow}
                style={{ 
                  opacity: selectedShow ? 1 : 0.5,
                  cursor: selectedShow ? 'pointer' : 'not-allowed'
                }}
              >
                ✓ Add Show
              </button>
              <button 
                className="button" 
                onClick={() => {
                  setShowForm(false);
                  setSelectedShow(null);
                  setSearchResults([]);
                  setNewShow({ name: '', tmdbId: null, currentSeason: 1, currentEpisode: 0 });
                }}
                style={{ background: '#6a6a7e' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            cursor: 'pointer',
            marginBottom: trackedShowsCollapsed ? 0 : '1rem'
          }}
          onClick={() => setTrackedShowsCollapsed(!trackedShowsCollapsed)}
        >
          <h2 style={{ margin: 0 }}>📋 Tracked Shows ({shows.length})</h2>
          <span style={{ 
            color: '#667eea', 
            fontSize: '1.2rem',
            transform: trackedShowsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}>
            ▼
          </span>
        </div>
        {!trackedShowsCollapsed && (
          <>
            {shows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📺</div>
                <div className="empty-state-title">No shows being tracked</div>
                <p className="empty-state-message">
                  Add your favorite ongoing shows to automatically download new episodes
                </p>
              </div>
            ) : (
              shows.map((show) => (
                <div key={show.id} style={{
                  padding: '1rem',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  border: '1px solid #2a2a3e'
                }}>
                  {/* Show Information - Full Width */}
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 className="mobile-show-name" style={{ color: '#e0e0e0', margin: '0 0 0.5rem 0' }}>
                      {show.name}
                    </h3>
                    <p style={{ color: '#b0b0c0', fontSize: '0.875rem', margin: 0, lineHeight: '1.4' }}>
                      Current: S{show.currentSeason.toString().padStart(2, '0')}E{show.currentEpisode.toString().padStart(2, '0')} • 
                      Status: <span style={{ color: show.status === 'active' ? '#4caf50' : '#ff9800' }}>
                        {show.status}
                      </span>
                      {show.nextEpisodeAirDate && (
                        <span> • Next episode: {new Date(show.nextEpisodeAirDate).toLocaleDateString()}</span>
                      )}
                      {show.lastChecked && (
                        <span> • Last checked: {new Date(show.lastChecked).toLocaleDateString()}</span>
                      )}
                    </p>
                    {show.downloadedEpisodes && show.downloadedEpisodes.length > 0 && (
                      <p style={{ color: '#667eea', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        Downloaded {show.downloadedEpisodes.length} episodes
                      </p>
                    )}
                  </div>
                  
                  {/* Action Buttons - Below Content */}
                  <div className="mobile-button-row" style={{ 
                    borderTop: '1px solid #2a2a3e',
                    paddingTop: '0.75rem'
                  }}>
                    <button
                      className="button"
                      onClick={() => downloadSeason(show.id, show.currentSeason)}
                      disabled={downloadingSeason === `${show.id}-${show.currentSeason}`}
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.5rem 0.75rem'
                      }}
                    >
                      {downloadingSeason === `${show.id}-${show.currentSeason}` ? '⬇️ Downloading...' : '📥 Season'}
                    </button>
                    <button
                      className="button"
                      onClick={() => updateShow(show.id, { 
                        status: show.status === 'active' ? 'paused' : 'active' 
                      })}
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.5rem 0.75rem',
                        background: show.status === 'active' ? '#ff9800' : '#4caf50'
                      }}
                    >
                      {show.status === 'active' ? '⏸️ Pause' : '▶️ Resume'}
                    </button>
                    <button
                      className="button button-danger"
                      onClick={() => deleteShow(show.id)}
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.5rem 0.75rem'
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>ℹ️ How It Works</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.6' }}>
          <p><strong style={{ color: '#667eea' }}>Quality Priority:</strong> Searches for 4K WEB-DL first, then 1080p WEB-DL, then any available quality</p>
          <p><strong style={{ color: '#667eea' }}>Targeted Checking:</strong> Episodes are automatically searched 1 hour after their air time (no more periodic checking!)</p>
          <p><strong style={{ color: '#667eea' }}>Season Downloads:</strong> Download entire seasons with episode range selection</p>
          <p><strong style={{ color: '#667eea' }}>Space Management:</strong> Only downloads when at least 5GB of free space is available</p>
          <p><strong style={{ color: '#667eea' }}>Smart Selection:</strong> Automatically picks torrents with the most seeders for reliability</p>
        </div>
      </div>
    </div>
  );
}

export default OngoingShows;