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
    currentSeason: 1,
    currentEpisode: 0
  });
  const [downloadingSeason, setDownloadingSeason] = useState(null);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetchShows();
    fetchAutoCheckStatus();
  }, []);

  const fetchAutoCheckStatus = async () => {
    try {
      const response = await axios.get('/api/shows/config/auto-check');
      setAutoCheckEnabled(response.data.enabled);
    } catch (error) {
      console.error('Error fetching auto-check status:', error);
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

  const addShow = async () => {
    if (!newShow.name.trim()) {
      showToast('Please enter a show name', 'error');
      return;
    }

    try {
      await axios.post('/api/shows', newShow);
      setNewShow({ name: '', currentSeason: 1, currentEpisode: 0 });
      setShowForm(false);
      fetchShows();
      showToast('Show added successfully!', 'success');
    } catch (error) {
      showToast('Error adding show: ' + error.message, 'error');
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
      } else {
        showToast(response.data.message || 'Check failed', 'error');
      }
    } catch (error) {
      showToast('Error checking for episodes: ' + error.message, 'error');
    }
    setChecking(false);
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
        <h1>📺 Ongoing Shows</h1>
        <div className="card">
          <LoadingSkeleton count={3} height="80px" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>📺 Ongoing Shows</h1>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2>Automatic Episode Tracking</h2>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', margin: 0 }}>
              Automatically search and download new episodes as they become available
            </p>
            <p style={{ color: autoCheckEnabled ? '#4caf50' : '#ff9800', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Auto-check: {autoCheckEnabled ? '✅ Enabled (every 2 hours)' : '⏸️ Disabled'}
            </p>
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
              {autoCheckEnabled ? '⏸️ Disable Auto' : '▶️ Enable Auto'}
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
              Enter the show name and your current progress. We'll automatically search for future episodes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                className="input"
                type="text"
                placeholder="Show name (e.g., Breaking Bad)"
                value={newShow.name}
                onChange={(e) => setNewShow({ ...newShow, name: e.target.value })}
                style={{ marginBottom: 0 }}
              />
              <input
                className="input"
                type="number"
                placeholder="Current Season"
                min="1"
                value={newShow.currentSeason}
                onChange={(e) => setNewShow({ ...newShow, currentSeason: parseInt(e.target.value) })}
                style={{ marginBottom: 0 }}
              />
              <input
                className="input"
                type="number"
                placeholder="Last Watched Episode"
                min="0"
                value={newShow.currentEpisode}
                onChange={(e) => setNewShow({ ...newShow, currentEpisode: parseInt(e.target.value) })}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="button" onClick={addShow}>
                ✓ Add Show
              </button>
              <button 
                className="button" 
                onClick={() => setShowForm(false)}
                style={{ background: '#6a6a7e' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>📋 Tracked Shows ({shows.length})</h2>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: '#e0e0e0', margin: '0 0 0.5rem 0' }}>
                    {show.name}
                  </h3>
                  <p style={{ color: '#b0b0c0', fontSize: '0.875rem', margin: 0 }}>
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
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    className="button"
                    onClick={() => downloadSeason(show.id, show.currentSeason)}
                    disabled={downloadingSeason === `${show.id}-${show.currentSeason}`}
                    style={{ fontSize: '0.75rem', padding: '0.5rem' }}
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
                      padding: '0.5rem',
                      background: show.status === 'active' ? '#ff9800' : '#4caf50'
                    }}
                  >
                    {show.status === 'active' ? '⏸️ Pause' : '▶️ Resume'}
                  </button>
                  <button
                    className="button button-danger"
                    onClick={() => deleteShow(show.id)}
                    style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>ℹ️ How It Works</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.6' }}>
          <p><strong style={{ color: '#667eea' }}>Quality Priority:</strong> Searches for 4K/2160p first, then 1080p, then any available quality</p>
          <p><strong style={{ color: '#667eea' }}>Automatic Checking:</strong> Click "Check Now" to search for new episodes of active shows</p>
          <p><strong style={{ color: '#667eea' }}>Season Downloads:</strong> Download entire seasons with episode range selection</p>
          <p><strong style={{ color: '#667eea' }}>Space Management:</strong> Only downloads when at least 5GB of free space is available</p>
          <p><strong style={{ color: '#667eea' }}>Smart Selection:</strong> Automatically picks torrents with the most seeders for reliability</p>
        </div>
      </div>
    </div>
  );
}

export default OngoingShows;