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
  const [showInfo, setShowInfo] = useState(false);
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
      // Start the download and get session ID
      const response = await axios.post('/api/shows/download-season', {
        tmdbId: selectedShow.id,
        showName: selectedShow.name,
        season: seasonNumber
      });

      if (response.data.success && response.data.sessionId) {
        const currentSessionId = response.data.sessionId;
        setSessionId(currentSessionId);
        
        // Poll for progress updates
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
                  showToast(`Successfully downloaded ${downloads.length} items for ${selectedShow.name} Season ${seasonNumber}!`, 'success');
                } else {
                  showToast(`Download completed for ${selectedShow.name} Season ${seasonNumber}`, 'success');
                }
              } else {
                showToast(progress.message || 'No high-quality content found', 'warning');
                if (progress.qualityNote) {
                  showToast(progress.qualityNote, 'info');
                }
              }
              return; // Stop polling
            } else if (progress.status === 'error') {
              showToast(`Download failed: ${progress.message}`, 'error');
              return; // Stop polling
            }
            
            // Continue polling if still in progress
            if (progress.status === 'searching' || progress.status === 'downloading') {
              setTimeout(pollProgress, 2000); // Poll every 2 seconds
            }
          } catch (pollError) {
            console.error('Error polling progress:', pollError);
            showToast('Error tracking download progress', 'warning');
          }
        };
        
        // Start polling
        setTimeout(pollProgress, 1000);
        
      } else {
        showToast('Failed to start download', 'error');
      }
    } catch (error) {
      showToast('Error starting download: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      // Reset states after a delay to show final progress
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
      {/* Mobile-Optimized Search Section */}
      <div className="card">
        <h2>🔍 Search TV Shows</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.3' }}>
          Search TV shows to download complete seasons with high-quality packs.
        </p>
        
        {/* Mobile Search Input */}
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

        {/* Mobile-Optimized Search Results */}
        {searchResults.length > 0 && (
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto', 
            marginBottom: '1rem',
            border: '1px solid #2a2a3e',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.02)'
          }}>
            {searchResults.map((show) => (
              <div
                key={show.id}
                onClick={() => selectShow(show)}
                className="mobile-list-item"
                style={{
                  background: selectedShow?.id === show.id ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  margin: '0.5rem',
                  padding: '1rem'
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  {show.posterPath && (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${show.posterPath}`}
                      alt={show.name}
                      style={{ 
                        width: '50px', 
                        height: '75px', 
                        borderRadius: '8px', 
                        objectFit: 'cover',
                        flexShrink: 0
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      color: '#e0e0e0', 
                      fontWeight: '600', 
                      marginBottom: '0.5rem',
                      fontSize: '1rem'
                    }}>
                      {show.name}
                    </div>
                    <div style={{ 
                      color: '#b0b0c0', 
                      fontSize: '0.8rem', 
                      marginBottom: '0.5rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      {show.firstAirDate && (
                        <span>📅 {new Date(show.firstAirDate).getFullYear()}</span>
                      )}
                      {show.voteAverage && (
                        <span>⭐ {show.voteAverage.toFixed(1)}/10</span>
                      )}
                    </div>
                    {show.overview && (
                      <div style={{ 
                        color: '#b0b0c0', 
                        fontSize: '0.8rem', 
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {show.overview}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mobile-Optimized Selected Show */}
        {selectedShow && (
          <div style={{ 
            background: 'rgba(76, 175, 80, 0.1)', 
            border: '1px solid #4caf50',
            borderRadius: '16px',
            padding: '1.25rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              {selectedShow.posterPath && (
                <img
                  src={`https://image.tmdb.org/t/p/w154${selectedShow.posterPath}`}
                  alt={selectedShow.name}
                  style={{ 
                    width: '70px', 
                    height: '105px', 
                    borderRadius: '8px', 
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  color: '#4caf50', 
                  fontWeight: '600', 
                  marginBottom: '0.5rem', 
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  ✅ {selectedShow.name}
                </div>
                <div style={{ 
                  color: '#b0b0c0', 
                  fontSize: '0.8rem', 
                  marginBottom: '0.75rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  {selectedShow.firstAirDate && (
                    <span>📅 {new Date(selectedShow.firstAirDate).getFullYear()}</span>
                  )}
                  {selectedShow.voteAverage && (
                    <span>⭐ {selectedShow.voteAverage.toFixed(1)}/10</span>
                  )}
                </div>
                {selectedShow.overview && (
                  <div style={{ 
                    color: '#b0b0c0', 
                    fontSize: '0.8rem', 
                    lineHeight: '1.4',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {selectedShow.overview}
                  </div>
                )}
              </div>
            </div>
            
            {/* Mobile Season Selection */}
            <div className="mobile-form-group">
              <label className="mobile-form-label">
                Season Number
              </label>
              <input
                className="input"
                type="number"
                min="1"
                max="20"
                value={seasonNumber}
                onChange={(e) => setSeasonNumber(parseInt(e.target.value) || 1)}
                style={{ marginBottom: '1rem' }}
              />
            </div>

            {/* Progress Bar */}
            {downloading && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ color: '#667eea', fontSize: '0.9rem', fontWeight: '600' }}>
                    {downloadProgress || 'Processing...'}
                  </span>
                  <span style={{ color: '#b0b0c0', fontSize: '0.8rem' }}>
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
            
            {/* Mobile Action Buttons */}
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
                {downloading ? '⬇️ Downloading...' : '📥 Download'}
              </button>
              <button 
                className="button" 
                onClick={clearSelection}
                disabled={downloading}
                style={{ 
                  background: '#6a6a7e',
                  opacity: downloading ? 0.5 : 1
                }}
              >
                🗑️ Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-Optimized How It Works */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setShowInfo(!showInfo)}
        >
          <h2 style={{ margin: 0 }}>ℹ️ How Season Downloads Work</h2>
          <span className={`collapsible-icon ${showInfo ? '' : 'collapsed'}`}>▼</span>
        </div>
        {showInfo && (
          <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.6' }}>
            <div className="mobile-card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎯 Search Order
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong>1. Season Packs:</strong> Complete season (preferred)
                </div>
                <div>
                  <strong>2. Episodes:</strong> Individual if no pack found
                </div>
              </div>
            </div>
            
            <div className="mobile-card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏆 Quality
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                4K WEB-DL → 1080p WEB-DL → 4K → 1080p
                <br />
                <em style={{ color: '#ff9800' }}>Only 1080p+ accepted</em>
              </div>
            </div>
            
            <div className="mobile-grid-2">
              <div className="mobile-card">
                <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  🌱 Selection
                </div>
                <div style={{ fontSize: '0.7rem' }}>
                  Most seeders for reliability
                </div>
              </div>
              
              <div className="mobile-card">
                <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  💾 Space
                </div>
                <div style={{ fontSize: '0.7rem' }}>
                  Needs 5GB+ free space
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PastShows;