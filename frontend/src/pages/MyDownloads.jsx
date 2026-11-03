import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';

// ─── Torrent list tab ─────────────────────────────────────────────────────────

function TorrentList() {
  const { showToast } = useToast();
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTorrents, setSelectedTorrents] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTorrents = async () => {
    try {
      const response = await axios.get('/api/qbittorrent/torrents');
      setTorrents(response.data);
      setError(null);
      setLoading(false);
    } catch (error) {
      setError(error.response?.data?.error || error.message);
      setLoading(false);
    }
  };

  const getSortedTorrents = () => {
    const sorted = [...torrents];
    sorted.sort((a, b) => {
      const aActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(a.state);
      const bActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(b.state);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (a.progress < 1 && b.progress >= 1) return -1;
      if (a.progress >= 1 && b.progress < 1) return 1;
      return 0;
    });
    return sorted;
  };

  const controlTorrent = async (action, hash, deleteFiles = true) => {
    try {
      if (action === 'pause' || action === 'resume') {
        setTorrents(prev => prev.map(t => {
          if (t.hash !== hash) return t;
          return {
            ...t,
            state: action === 'pause'
              ? (t.state.includes('DL') ? 'pausedDL' : 'pausedUP')
              : (t.progress >= 1 ? 'uploading' : 'downloading'),
            dlspeed: action === 'pause' ? 0 : t.dlspeed,
            upspeed: action === 'pause' ? 0 : t.upspeed,
          };
        }));
      }
      await axios.post(`/api/qbittorrent/torrents/${action}`, { hashes: hash, deleteFiles });
      showToast({ pause: 'Torrent paused', resume: 'Torrent resumed', delete: 'Torrent removed' }[action] || 'Done', 'success');
      setTimeout(fetchTorrents, 1500);
    } catch (error) {
      if (action === 'pause' || action === 'resume') fetchTorrents();
      showToast('Error: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedTorrents.size === 0) { showToast('No torrents selected', 'warning'); return; }
    const hashes = Array.from(selectedTorrents).join('|');
    if (action === 'delete') { setConfirmDelete({ hashes, count: selectedTorrents.size }); return; }
    try {
      if (action === 'pause' || action === 'resume') {
        setTorrents(prev => prev.map(t => {
          if (!selectedTorrents.has(t.hash)) return t;
          return {
            ...t,
            state: action === 'pause'
              ? (t.state.includes('DL') ? 'pausedDL' : 'pausedUP')
              : (t.progress >= 1 ? 'uploading' : 'downloading'),
            dlspeed: action === 'pause' ? 0 : t.dlspeed,
            upspeed: action === 'pause' ? 0 : t.upspeed,
          };
        }));
      }
      await axios.post(`/api/qbittorrent/torrents/${action}`, { hashes });
      showToast(`${selectedTorrents.size} torrent(s) ${action}d`, 'success');
      setSelectedTorrents(new Set());
      setTimeout(fetchTorrents, 1500);
    } catch (error) {
      if (action === 'pause' || action === 'resume') fetchTorrents();
      showToast('Error: ' + error.message, 'error');
    }
  };

  const toggleSelect = (hash) => {
    const s = new Set(selectedTorrents);
    s.has(hash) ? s.delete(hash) : s.add(hash);
    setSelectedTorrents(s);
  };

  const fmt = {
    bytes: b => (b / 1073741824).toFixed(2),
    speed: b => (b / 1048576).toFixed(2),
    eta: s => {
      if (s === 8640000 || s <= 0) return '∞';
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },
    status: state => ({
      downloading: 'Downloading', stalledDL: 'Waiting for peers',
      pausedDL: 'Paused', pausedUP: 'Paused',
      uploading: 'Seeding', stalledUP: 'Completed',
      queuedDL: 'Queued', queuedUP: 'Queued',
      checkingDL: 'Checking', checkingUP: 'Checking',
      metaDL: 'Getting metadata', forcedDL: 'Force DL',
      error: 'Error', missingFiles: 'Missing files', allocating: 'Allocating',
    })[state] || state,
  };

  if (loading) return <div className="card"><LoadingSkeleton count={3} height="100px" /></div>;

  const sortedTorrents = getSortedTorrents();

  return (
    <>
      {error && (
        <div className="card" style={{ background: 'rgba(244,67,54,0.1)', borderColor: '#f44336' }}>
          <h2>⚠️ Connection Error</h2>
          <p style={{ color: '#f44336', marginBottom: '0.5rem' }}>{error}</p>
          <p style={{ color: '#b0b0c0', fontSize: '0.875rem' }}>The download service isn't responding.</p>
        </div>
      )}

      <div className="card">
        {sortedTorrents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📥</div>
            <div className="empty-state-title">No downloads</div>
            <p className="empty-state-message">Switch to the Search tab to find something</p>
          </div>
        ) : (
          <div className="mobile-grid">
            {sortedTorrents.map(torrent => {
              const isActive = ['downloading', 'stalledDL', 'metaDL', 'forcedDL'].includes(torrent.state);
              const isPaused = torrent.state === 'pausedDL' || torrent.state === 'pausedUP';
              const isSelected = selectedTorrents.has(torrent.hash);
              return (
                <div
                  key={torrent.hash}
                  className="mobile-card"
                  style={{
                    background: isSelected ? 'rgba(102,126,234,0.15)' : isActive ? 'rgba(102,126,234,0.05)' : 'rgba(255,255,255,0.02)',
                    borderLeft: isActive ? '3px solid #667eea' : '3px solid transparent',
                    border: isSelected ? '1px solid #667eea' : '1px solid #2a2a3e',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(torrent.hash)}
                      style={{ cursor: 'pointer', marginTop: '0.25rem', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.5rem' }}>{torrent.name}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <span className={`status-badge ${torrent.progress >= 1 ? 'status-active' : isPaused ? 'status-warning' : isActive ? 'status-active' : 'status-inactive'}`}>
                          {fmt.status(torrent.state)}
                        </span>
                      </div>
                      <div className="progress-bar" style={{ marginBottom: '0.75rem' }}>
                        <div className="progress-fill" style={{
                          width: `${(torrent.progress * 100).toFixed(1)}%`,
                          background: torrent.progress >= 1
                            ? 'linear-gradient(135deg,#4caf50,#388e3c)'
                            : 'linear-gradient(135deg,#667eea,#764ba2)',
                        }} />
                      </div>
                      <div className="torrent-meta">
                        <div className="torrent-meta-line">
                          <span>{fmt.bytes(torrent.size)} GB</span>
                          <span>{(torrent.progress * 100).toFixed(1)}%</span>
                          {torrent.eta > 0 && torrent.eta < 8640000 && <span>ETA: {fmt.eta(torrent.eta)}</span>}
                        </div>
                        {(torrent.dlspeed > 0 || torrent.upspeed > 0) && (
                          <div className="torrent-meta-line">
                            {torrent.dlspeed > 0 && <span style={{ color: '#4caf50' }}>⬇ {fmt.speed(torrent.dlspeed)} MB/s</span>}
                            {torrent.upspeed > 0 && <span style={{ color: '#2196f3' }}>⬆ {fmt.speed(torrent.upspeed)} MB/s</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mobile-grid-2">
                    <button className="button button-small" onClick={() => controlTorrent(isPaused ? 'resume' : 'pause', torrent.hash)}>
                      <span>{isPaused ? '▶️' : '⏸️'}</span>
                      <span>{isPaused ? 'Resume' : 'Pause'}</span>
                    </button>
                    <button className="button button-small button-danger" onClick={() => setConfirmDelete({ hashes: torrent.hash, name: torrent.name })}>
                      <span>🗑️</span><span>Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk action FAB */}
      {selectedTorrents.size > 0 && (
        <div className="fab-group">
          <button className="fab fab-bulk" onClick={() => handleBulkAction('resume')} title="Resume Selected">▶️</button>
          <button className="fab fab-bulk" onClick={() => handleBulkAction('pause')} title="Pause Selected">⏸️</button>
          <button className="fab fab-bulk fab-danger" onClick={() => handleBulkAction('delete')} title="Delete Selected">🗑️</button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remove Torrent"
          message={confirmDelete.name
            ? `Remove "${confirmDelete.name}"? This will delete the downloaded files.`
            : `Remove ${confirmDelete.count} torrent(s)? This will delete the downloaded files.`}
          confirmText="Remove" cancelText="Cancel" type="danger"
          onConfirm={() => { controlTorrent('delete', confirmDelete.hashes); setConfirmDelete(null); setSelectedTorrents(new Set()); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ─── Search / Add tab ─────────────────────────────────────────────────────────

function TorrentSearch({ initialQuery }) {
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
  const [advancedOptions, setAdvancedOptions] = useState({ enableEpisodePriority: true });
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
      await axios.post('/api/qbittorrent/torrents/add-advanced', { urls: url, enableEpisodePriority: advancedOptions.enableEpisodePriority });
      setSelectedTorrent(null);
      setSearchResults([]);
      setSearchQuery('');
      showToast('Torrent added!', 'success');
    } catch (error) {
      showToast('Error: ' + (error.response?.data?.error || error.message), 'error');
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
            onKeyPress={e => e.key === 'Enter' && searchTorrents()}
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
              return (
                <div key={i} className="mobile-card"
                  style={{ cursor: 'pointer', border: isSelected ? '1px solid #667eea' : '1px solid #2a2a3e', background: isSelected ? 'rgba(102,126,234,0.1)' : 'rgba(255,255,255,0.02)' }}
                  onClick={() => setSelectedTorrent(isSelected ? null : result)}
                >
                  <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.75rem' }}>{result.fileName}</div>
                  <div className="mobile-grid-2" style={{ gap: '0.5rem', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ color: '#b0b0c0' }}>📦 {(result.fileSize / 1073741824).toFixed(2)} GB</div>
                    <div style={{ color: qColor }}>⭐ {quality} ({result.nbSeeders})</div>
                  </div>
                  {isSelected && (
                    <div style={{ background: 'rgba(102,126,234,0.1)', border: '1px solid #667eea', borderRadius: '8px', padding: '0.75rem', marginTop: '0.75rem' }}>
                      <div style={{ color: '#667eea', fontWeight: '600', marginBottom: '0.75rem' }}>⚙️ Download Options</div>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={advancedOptions.enableEpisodePriority}
                          onChange={e => setAdvancedOptions({ ...advancedOptions, enableEpisodePriority: e.target.checked })}
                          style={{ marginTop: '0.25rem' }} />
                        <div>
                          <div style={{ color: '#e0e0e0', fontSize: '0.875rem' }}>📺 Prioritize episodes (S01E01 first)</div>
                          <div style={{ color: '#b0b0c0', fontSize: '0.75rem' }}>Downloads first episodes first for TV shows</div>
                        </div>
                      </label>
                      <p style={{ color: '#4caf50', fontSize: '0.75rem', marginBottom: '1rem' }}>✓ Sequential download automatically enabled</p>
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
            onChange={e => setNewTorrent(e.target.value)} onKeyPress={e => e.key === 'Enter' && addMagnet()} />
        </div>
        <button className="button" onClick={addMagnet}><span>➕</span><span>Add Download</span></button>
        <p style={{ color: '#4caf50', fontSize: '0.75rem', marginTop: '0.75rem' }}>✓ Sequential download automatically enabled</p>
      </div>
    </>
  );
}

// ─── Combined Downloads page ──────────────────────────────────────────────────

function MyDownloads() {
  const [searchParams] = useSearchParams();
  // Arrive on Search tab when a ?q= param is present (handoff from Media)
  const initialQuery = searchParams.get('q') || '';
  const [activeTab, setActiveTab] = useState(
    initialQuery || searchParams.get('tab') === 'search' ? 'search' : 'downloads'
  );

  return (
    <div className="fade-in">
      <div className="mobile-tabs">
        <button className={`mobile-tab ${activeTab === 'downloads' ? 'active' : ''}`} onClick={() => setActiveTab('downloads')}>
          <span>📥</span> Downloads
        </button>
        <button className={`mobile-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
          <span>🔍</span> Search
        </button>
      </div>

      {activeTab === 'downloads' && <TorrentList />}
      {activeTab === 'search' && <TorrentSearch initialQuery={initialQuery} />}
    </div>
  );
}

export default MyDownloads;
