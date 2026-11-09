import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import QueuePopup from '../components/QueuePopup';
import ConfirmModal from '../components/ConfirmModal';
import Toggle from '../components/Toggle';
import usePolling from '../hooks/usePolling';
import { apiError } from '../lib/format';

const epCode = (s, e) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;

function OngoingShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
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
  const [autoTrackingCollapsed, setAutoTrackingCollapsed] = useState(false);
  const [trackedShowsCollapsed, setTrackedShowsCollapsed] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchShows();
    fetchAutoCheckStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While a check runs, poll faster and refresh the show list when it ends.
  const pollStatus = useCallback(async () => {
    try {
      const [queueRes, checkRes] = await Promise.all([
        axios.get('/api/shows/queue/status'),
        axios.get('/api/shows/check/status'),
      ]);
      setQueueStatus(queueRes.data);
      const running = checkRes.data.running;
      if (checkingRef.current && !running) {
        const n = checkRes.data.lastSweep?.downloads?.length || 0;
        showToast(n ? `Check finished: ${n} new episode(s) added` : 'Check finished: nothing new yet', n ? 'success' : 'info');
        fetchShows();
      }
      checkingRef.current = running;
      setChecking(running);
    } catch {
      // Keep the last known state.
    }
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  usePolling(pollStatus, checking ? 4000 : 20000);

  const fetchAutoCheckStatus = async () => {
    try {
      const response = await axios.get('/api/shows/config/auto-check');
      setAutoCheckEnabled(response.data.enabled);
    } catch (error) {
      console.error('Error fetching auto-check status:', error);
    }
  };

  const fetchQueueStatus = pollStatus;

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
      
      showToast(response.data.message || 'Show added', 'success');
      // The server looks up the next air date in the background.
      setTimeout(fetchShows, 4000);
    } catch (error) {
      showToast('Error adding show: ' + apiError(error), 'error');
    }
  };

  const deleteShow = async (id) => {
    try {
      await axios.delete(`/api/shows/${id}`);
      fetchShows();
      showToast('Show removed successfully!', 'success');
    } catch (error) {
      showToast('Error removing show: ' + apiError(error), 'error');
    }
  };

  const updateShow = async (id, updates) => {
    try {
      await axios.put(`/api/shows/${id}`, updates);
      fetchShows();
      showToast('Show updated successfully!', 'success');
    } catch (error) {
      showToast('Error updating show: ' + apiError(error), 'error');
    }
  };

  const checkForNewEpisodes = async () => {
    try {
      const response = await axios.post('/api/shows/check');
      checkingRef.current = true;
      setChecking(true);
      showToast(response.data.message || 'Checking in the background…', 'info');
      fetchQueueStatus();
    } catch (error) {
      showToast('Error starting check: ' + apiError(error), 'error');
    }
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

  const toggleAutoCheck = async (enabled) => {
    try {
      const response = await axios.post('/api/shows/config/auto-check', { enabled });
      setAutoCheckEnabled(enabled);
      showToast(response.data.message, 'success');
    } catch (error) {
      showToast('Error saving auto-check: ' + apiError(error), 'error');
    }
  };

  const downloadSeason = async (showId, season) => {
    const startEp = prompt(`Download season ${season} — start from episode:`, '1');
    if (!startEp) return;
    const endEp = prompt('…up to episode (leave as is for all aired):', '99');
    if (!endEp) return;

    setDownloadingSeason(`${showId}-${season}`);
    try {
      const response = await axios.post(`/api/shows/${showId}/season/${season}`, {
        startEpisode: parseInt(startEp, 10),
        endEpisode: parseInt(endEp, 10),
      });
      if (response.data.success) {
        showToast(`${response.data.message}. Progress is in the search queue.`, 'info', 6000);
        fetchQueueStatus();
      } else {
        showToast(response.data.message || 'Download failed', 'error');
      }
    } catch (error) {
      showToast('Error starting season download: ' + apiError(error), 'error');
    } finally {
      setDownloadingSeason(null);
    }
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
      {/* Add Show - Prominent placement */}
      <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
        <h2>➕ Add New Show</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Add TV shows to automatically track and download new episodes
        </p>
        <button 
          className="button" 
          onClick={() => setShowForm(!showForm)}
          style={{ width: '100%' }}
        >
          <span>➕</span>
          <span>Add Show</span>
        </button>
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

      {/* Status & Controls */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setAutoTrackingCollapsed(!autoTrackingCollapsed)}
        >
          <h2>📡 Auto Tracking</h2>
          <span className={`collapsible-icon ${autoTrackingCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        
        {!autoTrackingCollapsed && (
          <div className="slide-up">
            {/* Auto Check Toggle and Queue Info */}
            <div className="mobile-card mb-2">
              <div className="mobile-grid-2">
                {/* Auto Check Toggle */}
                <div>
                  <div className="stat-label mb-1">Auto Check</div>
                  <Toggle checked={autoCheckEnabled} onChange={toggleAutoCheck} label="Automatic episode checks" />
                </div>
                
                {/* Search Queue Info - Clickable */}
                <div 
                  className="queue-link"
                  onClick={() => setShowQueue(true)}
                >
                  <div className="stat-label mb-1">Search Queue</div>
                  <div className="stat-value text-small queue-clickable">
                    {queueStatus ? (
                      queueStatus.queueLength > 0 ? (
                        `${queueStatus.queueLength} pending`
                      ) : 'Empty'
                    ) : 'Loading...'}
                    <span className="queue-icon">📋</span>
                  </div>
                  {queueStatus && queueStatus.processing && queueStatus.nextSearchIn > 0 && (
                    <div className="stat-label">
                      Next in {Math.round(queueStatus.nextSearchIn / 1000)}s
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button className="button" style={{ width: '100%' }} onClick={checkForNewEpisodes} disabled={checking}>
              {checking
                ? <><span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /><span>Checking…</span></>
                : <><span>🔄</span><span>Check all shows now</span></>}
            </button>
            {queueStatus?.current && (
              <p className="hint" style={{ marginTop: '0.5rem' }}>
                Searching: {queueStatus.current.showName}{' '}
                {queueStatus.current.searchType === 'season'
                  ? `season ${queueStatus.current.season} pack`
                  : epCode(queueStatus.current.season, queueStatus.current.episode)}
              </p>
            )}

            {/* Clear Queue Button - Only when queue has items */}
            {queueStatus && queueStatus.queueLength > 0 && (
              <div className="mobile-grid mt-1">
                <button 
                  className="button button-danger" 
                  onClick={clearSearchQueue}
                >
                  <span>🗑️</span>
                  <span>Clear Queue ({queueStatus.queueLength})</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tracked Shows */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setTrackedShowsCollapsed(!trackedShowsCollapsed)}
        >
          <h2>📋 Tracked Shows ({shows.length})</h2>
          <span className={`collapsible-icon ${trackedShowsCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        
        {!trackedShowsCollapsed && (
          <div className="slide-up">
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
                      {(show.pendingEpisode || show.missedEpisodes?.length > 0) && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                          {show.pendingEpisode && (
                            <span className="chip chip-warn" title={`Last tried ${new Date(show.pendingEpisode.lastTried).toLocaleString()}`}>
                              ⏳ {epCode(show.pendingEpisode.season, show.pendingEpisode.episode)} aired, waiting for a release
                            </span>
                          )}
                          {show.missedEpisodes?.length > 0 && (
                            <span className="chip chip-bad" title="Not found within the retry window — search manually">
                              ⚠ Missed {show.missedEpisodes.map((m) => epCode(m.season, m.episode)).join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="mobile-grid-3">
                      <button
                        className="button button-small"
                        onClick={() => downloadSeason(show.id, show.currentSeason)}
                        disabled={downloadingSeason === `${show.id}-${show.currentSeason}`}
                        aria-label={`Download season ${show.currentSeason} of ${show.name}`}
                        title="Download episodes of the current season"
                      >
                        {downloadingSeason === `${show.id}-${show.currentSeason}` ? '⬇️' : '📥'}
                      </button>
                      <button
                        className="button button-small"
                        onClick={() => updateShow(show.id, { 
                          status: show.status === 'active' ? 'paused' : 'active' 
                        })}
                        aria-label={show.status === 'active' ? `Pause tracking ${show.name}` : `Resume tracking ${show.name}`}
                        title={show.status === 'active' ? 'Pause tracking' : 'Resume tracking (catches up on missed episodes)'}
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
                        onClick={() => setConfirmRemove(show)}
                        aria-label={`Stop tracking ${show.name}`}
                        title="Stop tracking"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="card">
        <h2>ℹ️ How It Works</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.5' }}>
          <p><strong style={{ color: '#667eea' }}>Quality:</strong> 2160p → 1080p (WEB-DL preferred); lower qualities are never picked automatically</p>
          <p><strong style={{ color: '#667eea' }}>Timing:</strong> First search on the air date, then retried every 6 hours for 7 days</p>
          <p><strong style={{ color: '#667eea' }}>Missed:</strong> Episodes not found within 7 days are flagged so you can search manually</p>
          <p><strong style={{ color: '#667eea' }}>Storage:</strong> Only downloads with 5 GB+ free space</p>
          <p><strong style={{ color: '#667eea' }}>Selection:</strong> Release must match the show and episode; most seeders wins</p>
        </div>
      </div>

      {/* Queue Popup */}
      <QueuePopup 
        isOpen={showQueue} 
        onClose={() => setShowQueue(false)} 
      />

      {confirmRemove && (
        <ConfirmModal
          title="Stop tracking?"
          message={`${confirmRemove.name} will no longer be downloaded automatically. Files already downloaded are kept.`}
          confirmText="Stop tracking"
          onConfirm={() => { deleteShow(confirmRemove.id); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

export default OngoingShows;