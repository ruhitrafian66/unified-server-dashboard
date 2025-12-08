import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';

function AddTorrent() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [newTorrent, setNewTorrent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [sortBy, setSortBy] = useState('seeders');
  const [advancedOptions, setAdvancedOptions] = useState({
    savepath: localStorage.getItem('lastSavePath') || '/media',
    sequentialDownload: true
  });

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const saveRecentSearch = (query) => {
    const updated = [query, ...recentSearches.filter(q => q !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const addTorrent = async () => {
    if (!newTorrent.trim()) {
      showToast('Please enter a magnet link or torrent URL', 'warning');
      return;
    }

    try {
      await axios.post('/api/qbittorrent/torrents/add', {
        urls: newTorrent
      });
      setNewTorrent('');
      showToast('Torrent added successfully!', 'success');
      setTimeout(() => navigate('/downloads'), 1000);
    } catch (error) {
      showToast('Error adding torrent: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const searchTorrents = async (query = searchQuery) => {
    if (!query.trim()) {
      showToast('Please enter a search query', 'warning');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    saveRecentSearch(query);
    
    try {
      const response = await axios.post('/api/qbittorrent/search/start', {
        pattern: query,
        plugins: 'enabled',
        category: 'all'
      });
      
      const searchJobId = response.data.id;
      
      let pollCount = 0;
      const maxPolls = 30; // Increased from 15 to 30 seconds
      let lastTotal = 0;
      let stableCount = 0;
      
      const pollResults = setInterval(async () => {
        try {
          pollCount++;
          
          const status = await axios.get(`/api/qbittorrent/search/status/${searchJobId}`);
          
          if (status.data && status.data.length > 0) {
            const searchStatus = status.data[0];
            const statusStr = searchStatus.status;
            const total = searchStatus.total || 0;
            
            if (total > 0 && total === lastTotal) {
              stableCount++;
            } else {
              stableCount = 0;
            }
            lastTotal = total;
            
            // Get results when stopped OR when we have results and they're stable
            if ((statusStr === 'Stopped' && total > 0) || (total > 0 && stableCount >= 3)) {
              const results = await axios.get(`/api/qbittorrent/search/results/${searchJobId}?limit=200`);
              
              if (results.data && results.data.results && results.data.results.length > 0) {
                setSearchResults(results.data.results);
                clearInterval(pollResults);
                setSearching(false);
                showToast(`Found ${results.data.results.length} results`, 'success');
                
                try {
                  await axios.post('/api/qbittorrent/search/stop', { id: searchJobId });
                } catch (e) {}
                
                return;
              }
            } else if (statusStr === 'Stopped' && total === 0) {
              clearInterval(pollResults);
              setSearching(false);
              showToast('No results found. Try a different search term.', 'warning');
              return;
            }
          }
          
          if (pollCount >= maxPolls) {
            clearInterval(pollResults);
            setSearching(false);
            
            try {
              const results = await axios.get(`/api/qbittorrent/search/results/${searchJobId}?limit=200`);
              if (results.data && results.data.results && results.data.results.length > 0) {
                setSearchResults(results.data.results);
                showToast(`Found ${results.data.results.length} results`, 'success');
              } else {
                showToast('Search timed out. No results found.', 'warning');
              }
            } catch (e) {
              showToast('Search timed out.', 'error');
            }
            
            try {
              await axios.post('/api/qbittorrent/search/stop', { id: searchJobId });
            } catch (e) {}
          }
        } catch (err) {
          console.error('Error during search:', err);
          clearInterval(pollResults);
          setSearching(false);
          showToast('Search failed: ' + (err.response?.data?.error || err.message), 'error');
        }
      }, 1000);
    } catch (error) {
      showToast('Error starting search: ' + (error.response?.data?.error || error.message), 'error');
      setSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    setSelectedTorrent(result);
    setShowAdvanced(true);
  };

  const addSearchedTorrent = async () => {
    if (!selectedTorrent) return;

    const url = selectedTorrent.fileUrl;
    if (!url || url.trim() === '') {
      showToast('No download link available for this torrent. Try a different result.', 'error');
      return;
    }

    if (!url.startsWith('magnet:') && !url.startsWith('http')) {
      showToast('Invalid download link format. Try a different result.', 'error');
      return;
    }

    try {
      localStorage.setItem('lastSavePath', advancedOptions.savepath);
      
      await axios.post('/api/qbittorrent/torrents/add-advanced', {
        urls: url,
        savepath: advancedOptions.savepath,
        sequentialDownload: advancedOptions.sequentialDownload
      });
      
      setSelectedTorrent(null);
      setShowAdvanced(false);
      setSearchResults([]);
      setSearchQuery('');
      showToast('Torrent added successfully!', 'success');
      setTimeout(() => navigate('/downloads'), 1000);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      const details = error.response?.data?.details;
      showToast('Error: ' + errorMsg + (details ? ' - ' + details : ''), 'error');
    }
  };

  const getSortedResults = () => {
    const sorted = [...searchResults];
    if (sortBy === 'seeders') {
      sorted.sort((a, b) => b.nbSeeders - a.nbSeeders);
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => b.fileSize - a.fileSize);
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
    }
    return sorted;
  };

  return (
    <div>
      <h1>Add Torrent</h1>

      <div className="card">
        <h2>🔍 Search for Movies & TV Shows</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Search for any movie or TV show to download
        </p>
        
        {/* Search Input */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="input"
            type="text"
            placeholder="e.g., Breaking Bad, The Matrix, Game of Thrones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchTorrents()}
            style={{ marginBottom: 0 }}
          />
          <button 
            className="button" 
            onClick={() => searchTorrents()}
            disabled={searching}
            style={{ minWidth: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {searching ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                Searching...
              </>
            ) : (
              '🔍 Search'
            )}
          </button>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && !searching && searchResults.length === 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Recent searches:</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {recentSearches.map((query, i) => (
                <button
                  key={i}
                  className="filter-button"
                  onClick={() => {
                    setSearchQuery(query);
                    searchTorrents(query);
                  }}
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', marginBottom: '1rem' }}>
              <p style={{ color: '#667eea', fontSize: '0.875rem', margin: 0 }}>
                ✓ Found {searchResults.length} results
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: '#b0b0c0', fontSize: '0.875rem' }}>Sort:</span>
                <button 
                  className={`filter-button ${sortBy === 'seeders' ? 'active' : ''}`}
                  onClick={() => setSortBy('seeders')}
                >
                  Quality
                </button>
                <button 
                  className={`filter-button ${sortBy === 'size' ? 'active' : ''}`}
                  onClick={() => setSortBy('size')}
                >
                  Size
                </button>
                <button 
                  className={`filter-button ${sortBy === 'name' ? 'active' : ''}`}
                  onClick={() => setSortBy('name')}
                >
                  Name
                </button>
              </div>
            </div>
            
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {getSortedResults().map((result, index) => {
                const hasValidUrl = result.fileUrl && (result.fileUrl.startsWith('magnet:') || result.fileUrl.startsWith('http'));
                const quality = result.nbSeeders > 50 ? 'Excellent' : result.nbSeeders > 10 ? 'Good' : 'Fair';
                const qualityColor = result.nbSeeders > 50 ? '#4caf50' : result.nbSeeders > 10 ? '#2196f3' : '#ff9800';
                
                return (
                  <div 
                    key={index}
                    onClick={() => hasValidUrl && selectSearchResult(result)}
                    style={{
                      padding: '1rem',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      cursor: hasValidUrl ? 'pointer' : 'not-allowed',
                      border: '1px solid #2a2a3e',
                      transition: 'all 0.2s',
                      opacity: hasValidUrl ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => hasValidUrl && (e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)')}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ color: '#e0e0e0', display: 'block', wordBreak: 'break-word', marginBottom: '0.5rem' }}>
                          {result.fileName}
                        </strong>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                          <span style={{ color: '#b0b0c0' }}>
                            📦 {(result.fileSize / 1024 / 1024 / 1024).toFixed(2)} GB
                          </span>
                          <span style={{ color: qualityColor }}>
                            ⭐ {quality} ({result.nbSeeders} sources)
                          </span>
                          {!hasValidUrl && <span style={{ color: '#f44336' }}>✗ No download link</span>}
                        </div>
                      </div>
                      <button 
                        className="button"
                        disabled={!hasValidUrl}
                        style={{ 
                          flexShrink: 0, 
                          fontSize: '0.875rem', 
                          padding: '0.5rem 1rem',
                          opacity: hasValidUrl ? 1 : 0.5,
                          cursor: hasValidUrl ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {hasValidUrl ? '⬇ Download' : '✗ Unavailable'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Download Settings Modal */}
      {showAdvanced && selectedTorrent && (
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
            zIndex: 1000,
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => {
            setShowAdvanced(false);
            setSelectedTorrent(null);
          }}
        >
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderColor: '#667eea',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              margin: 0,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '1rem' }}>⚙️ Download Settings</h2>
            <p
              style={{
                color: '#e0e0e0',
                marginBottom: '1.5rem',
                wordBreak: 'break-word',
                lineHeight: '1.5'
              }}
            >
              <strong style={{ color: '#667eea' }}>Ready to download:</strong>
              <br />
              {selectedTorrent.fileName}
            </p>

            <label style={{ display: 'block', marginBottom: '1.5rem' }}>
              <strong
                style={{
                  color: '#667eea',
                  display: 'block',
                  marginBottom: '0.5rem'
                }}
              >
                📁 Save to Folder
              </strong>
              <p
                style={{
                  color: '#b0b0c0',
                  fontSize: '0.875rem',
                  marginBottom: '0.5rem'
                }}
              >
                Where should we save this file?
              </p>
              <input
                className="input"
                type="text"
                value={advancedOptions.savepath}
                onChange={(e) =>
                  setAdvancedOptions({
                    ...advancedOptions,
                    savepath: e.target.value
                  })
                }
                style={{ marginBottom: 0 }}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '2rem',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={advancedOptions.sequentialDownload}
                onChange={(e) =>
                  setAdvancedOptions({
                    ...advancedOptions,
                    sequentialDownload: e.target.checked
                  })
                }
                style={{
                  width: 'auto',
                  margin: '0.25rem 0 0 0',
                  flexShrink: 0
                }}
              />
              <div>
                <span style={{ color: '#e0e0e0', display: 'block' }}>
                  ▶️ Download in order (recommended for videos)
                </span>
                <span
                  style={{
                    color: '#b0b0c0',
                    fontSize: '0.875rem',
                    display: 'block',
                    marginTop: '0.25rem'
                  }}
                >
                  Allows you to start watching while downloading
                </span>
              </div>
            </label>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="button"
                onClick={addSearchedTorrent}
                style={{ flex: 1 }}
              >
                ✓ Start Download
              </button>
              <button
                className="button"
                onClick={() => {
                  setShowAdvanced(false);
                  setSelectedTorrent(null);
                }}
                style={{ background: '#6a6a7e', flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add from Magnet Link */}
      <div className="card">
        <h2>🔗 Add from Magnet Link</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Have a magnet link or torrent URL? Paste it here for quick add
        </p>
        <input
          className="input"
          type="text"
          placeholder="Paste magnet link or .torrent URL here..."
          value={newTorrent}
          onChange={(e) => setNewTorrent(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTorrent()}
        />
        <button className="button" onClick={addTorrent}>
          + Add Download
        </button>
      </div>
    </div>
  );
}

export default AddTorrent;
