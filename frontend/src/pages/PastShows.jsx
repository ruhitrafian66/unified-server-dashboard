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
    setDownloadProgress('Initializing search...');
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 5 minutes')), 300000);
    });

    // Update progress periodically
    const progressInterval = setInterval(() => {
      const messages = [
        'Searching for season packs...',
        'Checking torrent sources...',
        'Looking for individual episodes...',
        'Processing search results...',
        'Adding torrents to qBittorrent...'
      ];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      setDownloadProgress(randomMessage);
    }, 15000);

    try {
      const requestPromise = axios.post('/api/shows/download-season', {
        tmdbId: selectedShow.id,
        showName: selectedShow.name,
        season: seasonNumber
      });

      // Race between the request and timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);

      if (response.data.success) {
        const downloads = response.data.downloads || [];
        if (downloads.length > 0) {
          showToast(`Successfully downloaded ${downloads.length} items for ${selectedShow.name} Season ${seasonNumber}!`, 'success');
        } else {
          showToast(`Started download for ${selectedShow.name} Season ${seasonNumber}`, 'success');
        }
      } else {
        showToast(response.data.message || 'Download failed', 'error');
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        showToast('Download request timed out. Check qBittorrent for any downloads that may have started.', 'warning');
      } else if (error.code === 'ECONNABORTED') {
        showToast('Request timed out. Check qBittorrent for any downloads that may have started.', 'warning');
      } else {
        showToast('Error downloading season: ' + (error.response?.data?.error || error.message), 'error');
      }
    } finally {
      clearInterval(progressInterval);
      setDownloading(false);
      setDownloadProgress('');
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
          Search for any TV show to download complete seasons. Prioritizes full season packs, falls back to individual episodes.
        </p>
        
        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            className="input"
            type="text"
            placeholder="Search for TV shows (e.g., Stranger Things, Game of Thrones)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
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

        {/* Selected Show */}
        {selectedShow && (
          <div style={{ 
            background: 'rgba(76, 175, 80, 0.1)', 
            border: '1px solid #4caf50',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {selectedShow.posterPath && (
                <img
                  src={`https://image.tmdb.org/t/p/w154${selectedShow.posterPath}`}
                  alt={selectedShow.name}
                  style={{ width: '60px', height: '90px', borderRadius: '6px', objectFit: 'cover' }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ color: '#4caf50', fontWeight: '600', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                  ✓ Selected: {selectedShow.name}
                </div>
                <div style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  {selectedShow.firstAirDate && `First aired: ${new Date(selectedShow.firstAirDate).getFullYear()}`}
                  {selectedShow.voteAverage && ` • Rating: ${selectedShow.voteAverage.toFixed(1)}/10`}
                </div>
                {selectedShow.overview && (
                  <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.4' }}>
                    {selectedShow.overview}
                  </div>
                )}
              </div>
            </div>
            
            {/* Season Selection */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div>
                <label style={{ color: '#4caf50', fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                  Season Number
                </label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="20"
                  value={seasonNumber}
                  onChange={(e) => setSeasonNumber(parseInt(e.target.value) || 1)}
                  style={{ width: '100px', marginBottom: 0 }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
                <button 
                  className="button" 
                  onClick={downloadSeason}
                  disabled={downloading}
                  style={{ 
                    background: downloading ? '#ff9800' : '#4caf50',
                    minWidth: '200px'
                  }}
                >
                  {downloading ? `⬇️ ${downloadProgress || 'Searching & Downloading...'}` : '📥 Download Season'}
                </button>
                <button 
                  className="button" 
                  onClick={clearSelection}
                  style={{ background: '#6a6a7e' }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="card">
        <h2>ℹ️ How Season Downloads Work</h2>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.6' }}>
          <p><strong style={{ color: '#667eea' }}>Priority Order:</strong></p>
          <ol style={{ marginLeft: '1rem', marginBottom: '1rem' }}>
            <li><strong>Full Season Packs:</strong> Complete season in one torrent (preferred)</li>
            <li><strong>Individual Episodes:</strong> Downloads each episode separately if no season pack found</li>
          </ol>
          <p><strong style={{ color: '#667eea' }}>Quality Priority:</strong> 4K WEB-DL → 1080p WEB-DL → Any available quality</p>
          <p><strong style={{ color: '#667eea' }}>Smart Selection:</strong> Automatically picks torrents with the most seeders for reliability</p>
          <p><strong style={{ color: '#667eea' }}>Space Management:</strong> Only downloads when at least 5GB of free space is available</p>
        </div>
      </div>
    </div>
  );
}

export default PastShows;