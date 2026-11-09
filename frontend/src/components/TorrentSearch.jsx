import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import { apiError } from '../lib/format';

// Common shape of malware posing as a video release.
const SUSPICIOUS_NAME = /\.(exe|scr|bat|cmd|msi|lnk|vbs|jar|apk)\b|\bpassword\b/i;

export default function TorrentSearch({ initialQuery }) {
  const { showToast } = useToast();
  const [newTorrent, setNewTorrent] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentSearches') || '[]'); } catch { return []; }
  });
  const [sortBy, setSortBy] = useState('seeders');
  const pollRef = useRef(null);

  // Auto-run search if initialQuery was supplied (handoff from Media)
  useEffect(() => {
    if (initialQuery) searchTorrents(initialQuery);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRecentSearch = (query) => {
    const updated = [query, ...recentSearches.filter(q => q !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const addMagnet = async () => {
    if (!newTorrent.trim()) { showToast('Paste a magnet link or torrent URL', 'warning'); return; }
    try {
      await axios.post('/api/qbittorrent/torrents/add', { urls: newTorrent });
      setNewTorrent('');
      showToast('Torrent added!', 'success');
    } catch (error) {
      showToast('Error: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const searchTorrents = async (query = searchQuery) => {
    if (!query.trim()) { showToast('Enter a search query', 'warning'); return; }
    if (pollRef.current) clearInterval(pollRef.current);
    setSearching(true);
    setSearchResults([]);
    saveRecentSearch(query);
    try {
      const response = await axios.post('/api/qbittorrent/search/start', { pattern: query, plugins: 'enabled', category: 'all' });
      const jobId = response.data.id;
      let pollCount = 0, lastTotal = 0, stableCount = 0;
      pollRef.current = setInterval(async () => {
        try {
          pollCount++;
          const status = await axios.get(`/api/qbittorrent/search/status/${jobId}`);
          if (status.data?.length > 0) {
            const { status: s, total = 0 } = status.data[0];
            total === lastTotal && total > 0 ? stableCount++ : (stableCount = 0);
            lastTotal = total;
            if ((s === 'Stopped' && total > 0) || stableCount >= 3) {
              const res = await axios.get(`/api/qbittorrent/search/results/${jobId}?limit=200`);
              if (res.data?.results?.length > 0) {
                setSearchResults(res.data.results);
                showToast(`Found ${res.data.results.length} results`, 'success');
              } else {
                showToast('No results found', 'warning');
              }
              clearInterval(pollRef.current);
              setSearching(false);
              try { await axios.post('/api/qbittorrent/search/stop', { id: jobId }); } catch {}
              return;
            }
            if (s === 'Stopped' && total === 0) {
              clearInterval(pollRef.current);
              setSearching(false);
              showToast('No results found. Try different keywords.', 'warning');
              return;
            }
          }
          if (pollCount >= 30) {
            clearInterval(pollRef.current);
            setSearching(false);
            try {
              const res = await axios.get(`/api/qbittorrent/search/results/${jobId}?limit=200`);
              if (res.data?.results?.length > 0) {
                setSearchResults(res.data.results);
                showToast(`Found ${res.data.results.length} results`, 'success');
              } else {
                showToast('Search timed out', 'warning');
              }
            } catch {}
            try { await axios.post('/api/qbittorrent/search/stop', { id: jobId }); } catch {}
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setSearching(false);
          showToast('Search failed: ' + (err.response?.data?.error || err.message), 'error');
        }
      }, 1000);
    } catch (error) {
      showToast('Error starting search: ' + (error.response?.data?.error || error.message), 'error');
      setSearching(false);
    }
  };

  const addSearchedTorrent = async () => {
    if (!selectedTorrent) return;
    const url = selectedTorrent.fileUrl;
    if (!url || (!url.startsWith('magnet:') && !url.endsWith('.torrent'))) {
      showToast('Invalid download link', 'error'); return;
    }
    try {
      await axios.post('/api/qbittorrent/torrents/add', { urls: url });
      setSelectedTorrent(null);
      setSearchResults([]);
      setSearchQuery('');
      showToast('Torrent added!', 'success');
    } catch (error) {
      showToast('Error: ' + apiError(error), 'error');
    }
  };

  const getSortedResults = () => {
    const valid = searchResults.filter(r => r.fileUrl && (r.fileUrl.startsWith('magnet:') || r.fileUrl.endsWith('.torrent')));
    return [...valid].sort((a, b) =>
      sortBy === 'seeders' ? b.nbSeeders - a.nbSeeders :
      sortBy === 'size' ? b.fileSize - a.fileSize :
      a.fileName.localeCompare(b.fileName)
    );
  };

  return (
    <>
      {/* Torrent search */}
      <div className="card">
        <h2>🔍 Search Torrents</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Search for movies, TV shows, or any content
        </p>
        <div className="mobile-search-container">
          <div className="mobile-search-icon">🔍</div>
          <input
            className="mobile-search-input"
            type="text"
            placeholder="Breaking Bad, The Matrix, etc..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchTorrents()}
          />
        </div>
        <button className="button mb-2" onClick={() => searchTorrents()} disabled={searching}>
          {searching ? <><span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /><span>Searching...</span></> : <><span>🔍</span><span>Search</span></>}
        </button>
        {recentSearches.length > 0 && !searching && searchResults.length === 0 && (
          <div>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Recent:</p>
            <div className="filter-buttons">
              {recentSearches.map((q, i) => (
                <button key={i} className="filter-button" onClick={() => { setSearchQuery(q); searchTorrents(q); }}>{q}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>📋 Results ({getSortedResults().length})</h2>
          </div>
          <div className="mobile-tabs mb-2">
            {['seeders', 'size', 'name'].map(s => (
              <button key={s} className={`mobile-tab ${sortBy === s ? 'active' : ''}`} onClick={() => setSortBy(s)}>
                {s === 'seeders' ? 'Quality' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="mobile-grid">
            {getSortedResults().map((result, i) => {
              const quality = result.nbSeeders > 50 ? 'Excellent' : result.nbSeeders > 10 ? 'Good' : 'Fair';
              const qColor = result.nbSeeders > 50 ? '#4caf50' : result.nbSeeders > 10 ? '#2196f3' : '#ff9800';
              const isSelected = selectedTorrent === result;
              const suspicious = SUSPICIOUS_NAME.test(result.fileName || '');
              return (
                <div key={i} className="mobile-card"
                  style={{ cursor: 'pointer', border: isSelected ? '1px solid #667eea' : '1px solid #2a2a3e', background: isSelected ? 'rgba(102,126,234,0.1)' : 'rgba(255,255,255,0.02)' }}
                  onClick={() => setSelectedTorrent(isSelected ? null : result)}
                >
                  <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.75rem' }}>{result.fileName}</div>
                  {suspicious && (
                    <div className="inline-alert inline-alert-bad" style={{ padding: '0.5rem 0.75rem' }}>
                      ⚠ Looks like malware (executable or password-protected archive). Don't download.
                    </div>
                  )}
                  <div className="mobile-grid-2" style={{ gap: '0.5rem', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ color: '#b0b0c0' }}>📦 {(result.fileSize / 1073741824).toFixed(2)} GB</div>
                    <div style={{ color: qColor }}>⭐ {quality} ({result.nbSeeders})</div>
                  </div>
                  {isSelected && (
                    <div style={{ background: 'rgba(102,126,234,0.1)', border: '1px solid #667eea', borderRadius: '8px', padding: '0.75rem', marginTop: '0.75rem' }}>
                      <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.75rem' }}>⚙️ Download Options</div>
                      <p style={{ color: '#4caf50', fontSize: '0.75rem', marginBottom: '1rem' }}>✓ Downloads in order (sequential), so playback can start early</p>
                      <div className="mobile-grid-2">
                        <button className="button button-small" onClick={addSearchedTorrent}><span>✓</span><span>Download</span></button>
                        <button className="button button-small button-secondary" onClick={() => setSelectedTorrent(null)}><span>✕</span><span>Cancel</span></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual magnet add */}
      <div className="card">
        <h2>🔗 Add Magnet Link</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>Paste a magnet link or torrent URL directly</p>
        <div className="form-group">
          <input className="input" type="text" placeholder="magnet:?xt=urn:btih:..." value={newTorrent}
            onChange={e => setNewTorrent(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMagnet()} />
        </div>
        <button className="button" onClick={addMagnet}><span>➕</span><span>Add Download</span></button>
        <p style={{ color: '#4caf50', fontSize: '0.75rem', marginTop: '0.75rem' }}>✓ Sequential download automatically enabled</p>
      </div>
    </>
  );
}
