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
  const [recentSearches, setRecentSearches] = useState([]);
  const [sortBy, setSortBy] = useState('seeders');
  const [advancedOptions, setAdvancedOptions] = useState({
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
      const maxPolls = 30;
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
              showToast('No results found. Try different keywords.', 'warning');
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
  };

  const addSearchedTorrent = async () => {
    if (!selectedTorrent) return;

    const url = selectedTorrent.fileUrl;
    if (!url || url.trim() === '') {
      showToast('No download link available for this torrent.', 'error');
      return;
    }

    if (!url.startsWith('magnet:') && !url.endsWith('.torrent')) {
      showToast('Invalid download link.', 'error');
      return;
    }

    try {
      await axios.post('/api/qbittorrent/torrents/add-advanced', {
        urls: url,
        sequentialDownload: advancedOptions.sequentialDownload
      });
      
      setSelectedTorrent(null);
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
    <div className="fade-in">
      {/* Explanation Section */}
      <div className="card" style={{ background: 'rgba(102, 126, 234, 0.05)', borderColor: 'rgba(102, 126, 234, 0.2)' }}>
        <h2>➕ Manual Search</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.4', margin: 0 }}>
          Manually search for TV shows and movies to be downloaded. Use the search function to find torrents or add magnet links directly.
        </p>
      </div>

      {/* Search Section */}
      <div className="card">
        <h2>🔍 Search Torrents</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Search for movies, TV shows, or any content
        </p>
        
        {/* Search Input */}
        <div className="mobile-search-container">
          <div className="mobile-search-icon">🔍</div>
          <input
            className="mobile-search-input"
            type="text"
            placeholder="Breaking Bad, The Matrix, etc..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchTorrents()}
          />
        </div>

        <button 
          className="button mb-2" 
          onClick={() => searchTorrents()}
          disabled={searching}
        >
          {searching ? (
            <>
              <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
              <span>Searching...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Search</span>
            </>
          )}
        </button>

        {/* Recent Searches */}
        {recentSearches.length > 0 && !searching && searchResults.length === 0 && (
          <div>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Recent:</p>
            <div className="filter-buttons">
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
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>📋 Results ({searchResults.length})</h2>
          </div>
          
          {/* Sort Options */}
          <div className="mobile-tabs mb-2">
            <button 
              className={`mobile-tab ${sortBy === 'seeders' ? 'active' : ''}`}
              onClick={() => setSortBy('seeders')}
            >
              Quality
            </button>
            <button 
              className={`mobile-tab ${sortBy === 'size' ? 'active' : ''}`}
              onClick={() => setSortBy('size')}
            >
              Size
            </button>
            <button 
              className={`mobile-tab ${sortBy === 'name' ? 'active' : ''}`}
              onClick={() => setSortBy('name')}
            >
              Name
            </button>
          </div>
          
          {/* Results List */}
          <div className="mobile-grid">
            {getSortedResults().map((result, index) => {
              const hasValidUrl = result.fileUrl && (result.fileUrl.startsWith('magnet:') || result.fileUrl.endsWith('.torrent'));
              const quality = result.nbSeeders > 50 ? 'Excellent' : result.nbSeeders > 10 ? 'Good' : 'Fair';
              const qualityColor = result.nbSeeders > 50 ? '#4caf50' : result.nbSeeders > 10 ? '#2196f3' : '#ff9800';
              
              return (
                <div 
                  key={index}
                  className="mobile-card"
                  style={{
                    cursor: hasValidUrl ? 'pointer' : 'not-allowed',
                    opacity: hasValidUrl ? 1 : 0.5,
                    border: selectedTorrent === result ? '1px solid #667eea' : '1px solid #2a2a3e',
                    background: selectedTorrent === result ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255,255,255,0.02)'
                  }}
                  onClick={() => hasValidUrl && selectSearchResult(result)}
                >
                  <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.75rem' }}>
                    {result.fileName}
                  </div>
                  
                  <div className="mobile-grid-2" style={{ gap: '0.5rem', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ color: '#b0b0c0' }}>
                        📦 {(result.fileSize / 1024 / 1024 / 1024).toFixed(2)} GB
                      </div>
                    </div>
                    <div>
                      <div style={{ color: qualityColor }}>
                        ⭐ {quality} ({result.nbSeeders})
                      </div>
                    </div>
                  </div>
                  
                  {!hasValidUrl && (
                    <div style={{ color: '#f44336', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                      ✗ No download link available
                    </div>
                  )}
                  
                  {selectedTorrent === result && (
                    <div style={{ 
                      background: 'rgba(102, 126, 234, 0.1)', 
                      border: '1px solid #667eea',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginTop: '0.75rem'
                    }}>
                      <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.75rem' }}>
                        ⚙️ Download Options
                      </div>
                      
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'flex-start', 
                        gap: '0.5rem', 
                        marginBottom: '1rem',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={advancedOptions.sequentialDownload}
                          onChange={(e) => setAdvancedOptions({
                            ...advancedOptions,
                            sequentialDownload: e.target.checked
                          })}
                          className="touchable"
                          style={{ marginTop: '0.25rem' }}
                        />
                        <div>
                          <div style={{ color: '#e0e0e0', fontSize: '0.875rem' }}>
                            ▶️ Download in order
                          </div>
                          <div style={{ color: '#b0b0c0', fontSize: '0.75rem' }}>
                            Recommended for videos
                          </div>
                        </div>
                      </label>

                      <div className="mobile-grid-2">
                        <button
                          className="button button-small"
                          onClick={addSearchedTorrent}
                        >
                          <span>✓</span>
                          <span>Download</span>
                        </button>
                        <button
                          className="button button-small button-secondary"
                          onClick={() => setSelectedTorrent(null)}
                        >
                          <span>✕</span>
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Add Section */}
      <div className="card">
        <h2>🔗 Add Magnet Link</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Paste a magnet link or torrent URL directly
        </p>
        
        <div className="form-group">
          <input
            className="input"
            type="text"
            placeholder="magnet:?xt=urn:btih:... or http://example.com/file.torrent"
            value={newTorrent}
            onChange={(e) => setNewTorrent(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTorrent()}
          />
        </div>
        
        <button className="button" onClick={addTorrent}>
          <span>➕</span>
          <span>Add Download</span>
        </button>
      </div>
    </div>
  );
}

export default AddTorrent;