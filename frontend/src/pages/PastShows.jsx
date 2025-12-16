import React, { useState } from 'react';
import axios from 'axios';
import { useToast } from '../App';

function PastShows() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const { showToast } = useToast();

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
      showToast('Error searching shows: ' + error.message, 'error');
    }
    setSearchLoading(false);
  };

  const selectShow = (show) => {
    setSelectedShow(show);
    setSearchResults([]);
  };

  const downloadSeason = async () => {
    if (!selectedShow || !seasonNumber) {
      showToast('Please select a show and season number', 'error');
      return;
    }

    setDownloading(true);
    setDownloadProgress('Starting download...');
    setProgressPercent(0);

    try {
      const response = await axios.post('/api/shows/download-season', {
        tmdbId: selectedShow.id,
        showName: selectedShow.name,
        season: seasonNumber
      });

      if (response.data.success && response.data.sessionId) {
        const currentSessionId = response.data.sessionId;
        setSessionId(currentSessionId);
        
        const pollProgress = async () => {
          try {
            const progressResponse = await axios.get(`/api/shows/download-progress/${currentSessionId}`);
            const progress = progressResponse.data;
            
            setDownloadProgress(progress.message || 'Processing...');
            setProgressPercent(progress.progress || 0);
            
            if (progress.status === 'completed') {
              if (progress.success) {
                const downloads = progress.downloads || [];
                if (downloads.length > 0) {
                  showToast(`Downloaded ${downloads.length} items!`, 'success');
                } else {
                  showToast(`Download completed`, 'success');
                }
              } else {
                showToast(progress.message || 'No high-quality content found', 'warning');
                if (progress.qualityNote) {
                  showToast(progress.qualityNote, 'info');
                }
              }
              return;
            } else if (progress.status === 'error') {
              showToast(`Download failed: ${progress.message}`, 'error');
              return;
            }
            
            if (progress.status === 'searching' || progress.status === 'downloading') {
              setTimeout(pollProgress, 2000);
            }
          } catch (pollError) {
            console.error('Error polling progress:', pollError);
            showToast('Error tracking download progress', 'warning');
          }
        };
        
        setTimeout(pollProgress, 1000);
        
      } else {
        showToast('Failed to start download', 'error');
      }
    } catch (error) {
      showToast('Error starting download: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress('');
        setProgressPercent(0);
        setSessionId(null);
      }, 3000);
    }
  };

  const clearSelection = () => {
    setSelectedShow(null);
    setSearchQuery('');
    setSearchResults([]);
    setSeasonNumber(1);
  };

  return (
    <div>
      {/* Search Section */}
      <div className="card">
        <h2>🔍 Search TV Shows</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Search for TV shows to download complete seasons
        </p>
        
        {/* Search Input */}
        <div className="mobile-search-container">
          <div className="mobile-search-icon">🔍</div>
          <input
            className="mobile-search-input"
            type="text"
            placeholder="Search shows..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
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
              <div className="spinner"></div>
            </div>
          )}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div style={{ 
            maxHeight: '300px', 
            overflowY: 'auto', 
            marginTop: '1rem',
            border: '1px solid #2a2a3e',
            borderRadius: '12px'
          }}>
            {searchResults.map((show) => (
              <div
                key={show.id}
                onClick={() => selectShow(show)}
                className="mobile-list-item"
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
                  <div className="mobile-list-title text-wrap">{show.name}</div>
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
      </div>

      {/* Selected Show */}
      {selectedShow && (
        <div className="card" style={{ 
          background: 'rgba(76, 175, 80, 0.1)', 
          borderColor: '#4caf50'
        }}>
          <h2>✅ Selected Show</h2>
          
          <div className="mobile-card mb-2">
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              {selectedShow.posterPath && (
                <img
                  src={`https://image.tmdb.org/t/p/w154${selectedShow.posterPath}`}
                  alt={selectedShow.name}
                  style={{ 
                    width: '60px', 
                    height: '90px', 
                    borderRadius: '8px', 
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mobile-list-title text-wrap" style={{ color: '#4caf50', marginBottom: '0.5rem' }}>
                  {selectedShow.name}
                </div>
                <div className="mobile-list-subtitle">
                  {selectedShow.firstAirDate && `${new Date(selectedShow.firstAirDate).getFullYear()}`}
                  {selectedShow.voteAverage && ` • ${selectedShow.voteAverage.toFixed(1)}/10`}
                </div>
                {selectedShow.overview && (
                  <div className="mobile-list-subtitle text-wrap" style={{ marginTop: '0.5rem' }}>
                    {selectedShow.overview}
                  </div>
                )}
              </div>
            </div>
            
            {/* Season Selection */}
            <div className="form-group">
              <label className="form-label">Season Number</label>
              <input
                className="input"
                type="number"
                min="1"
                max="20"
                value={seasonNumber}
                onChange={(e) => setSeasonNumber(parseInt(e.target.value) || 1)}
              />
            </div>

            {/* Progress */}
            {downloading && (
              <div className="mb-2">
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ color: '#667eea', fontSize: '0.875rem', fontWeight: '600' }}>
                    {downloadProgress || 'Processing...'}
                  </span>
                  <span style={{ color: '#b0b0c0', fontSize: '0.75rem' }}>
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progressPercent}%` }} 
                  />
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="mobile-grid-2">
              <button 
                className="button" 
                onClick={downloadSeason}
                disabled={downloading}
                style={{ 
                  background: downloading ? '#ff9800' : '#4caf50',
                  opacity: downloading ? 0.8 : 1
                }}
              >
                <span>{downloading ? '⬇️' : '📥'}</span>
                <span>{downloading ? 'Downloading' : 'Download'}</span>
              </button>
              <button 
                className="button button-secondary" 
                onClick={clearSelection}
                disabled={downloading}
                style={{ opacity: downloading ? 0.5 : 1 }}
              >
                <span>🗑️</span>
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="card">
        <h2>ℹ️ How Season Downloads Work</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.5' }}>
          <div className="mobile-card mb-1">
            <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem' }}>
              🎯 Search Priority
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              1. Complete season packs (preferred)<br />
              2. Individual episodes if no pack found
            </div>
          </div>
          
          <div className="mobile-card mb-1">
            <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem' }}>
              🏆 Quality Order
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              4K WEB-DL → 1080p WEB-DL → 4K → 1080p<br />
              <em style={{ color: '#ff9800' }}>Only 1080p+ quality accepted</em>
            </div>
          </div>
          
          <div className="mobile-grid-2">
            <div className="mobile-card">
              <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                🌱 Selection
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                Picks torrents with most seeders
              </div>
            </div>
            
            <div className="mobile-card">
              <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                💾 Storage
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                Requires 5GB+ free space
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PastShows;