import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../App';
import { useSettings } from '../contexts/SettingsContext';
import { apiError } from '../lib/format';
import TorrentSearch from '../components/TorrentSearch';
import MediaDetailModal from '../components/MediaDetailModal';
import OngoingShows from './OngoingShows';
import PastShows from './PastShows';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const TMDB_IMG_BG = 'https://image.tmdb.org/t/p/w780';
// TMDB requests go through the backend, which holds the API key.
const TMDB_BASE = '/api/tmdb';

function MediaCard({ item, onClick }) {
  const posterUrl = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const title = item.title || item.name || '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <div className="media-card" onClick={() => onClick(item)}>
      <div className="media-card-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={title} loading="lazy" />
        ) : (
          <div className="media-card-no-poster">
            <span>{item.media_type === 'tv' ? '📺' : '🎬'}</span>
          </div>
        )}
        {rating && <div className="media-card-rating">⭐ {rating}</div>}
      </div>
      <div className="media-card-info">
        <div className="media-card-title">{title}</div>
        {year && <div className="media-card-year">{year}</div>}
      </div>
    </div>
  );
}

function MediaListItem({ item, onClick }) {
  const posterUrl = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const title = item.title || item.name || '';
  const overview = item.overview || '';

  return (
    <div className="media-list-item" onClick={() => onClick(item)}>
      <div className="media-list-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={title} loading="lazy" />
        ) : (
          <div className="media-list-no-poster">
            <span>{item.media_type === 'tv' ? '📺' : '🎬'}</span>
          </div>
        )}
      </div>
      <div className="media-list-info">
        <div className="media-list-title">{title}</div>
        <div className="media-list-meta">
          {year && <span>{year}</span>}
          {item.vote_average > 0 && <span>⭐ {item.vote_average.toFixed(1)}</span>}
          <span className="media-type-badge">{item.media_type === 'tv' ? 'TV' : 'Movie'}</span>
        </div>
        {overview && (
          <div className="media-list-overview">{overview}</div>
        )}
      </div>
    </div>
  );
}

export default function Media() {
  const [activeTab, setActiveTab] = useState('movies'); // 'movies' | 'tv' | 'tracked' | 'torrents'
  const [torrentQuery, setTorrentQuery] = useState('');
  const [trackedSubTab, setTrackedSubTab] = useState('ongoing'); // 'ongoing' | 'past'
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingTv, setTrendingTv] = useState([]);
  // Movies tab: newly released for home viewing (no theatrical-only titles).
  const [moviesPage, setMoviesPage] = useState(1);
  const [moviesTotalPages, setMoviesTotalPages] = useState(1);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [trendingError, setTrendingError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const searchDebounce = useRef(null);
  const searchSeq = useRef(0);
  const { tmdbConfigured } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const loadTrending = useCallback(async () => {
    if (tmdbConfigured === false) {
      setTrendingError('Add a TMDB API key in Settings to browse media.');
      return;
    }
    setIsLoadingTrending(true);
    setTrendingError(null);
    try {
      const [tvRes, movRes] = await Promise.all([
        axios.get(`${TMDB_BASE}/trending/tv/week`),
        axios.get(`${TMDB_BASE}/movies/streaming`),
      ]);
      setTrendingTv((tvRes.data.results || []).map(i => ({ ...i, media_type: 'tv' })));
      setTrendingMovies((movRes.data.results || []).map(i => ({ ...i, media_type: 'movie' })));
      setMoviesPage(movRes.data.page || 1);
      setMoviesTotalPages(movRes.data.total_pages || 1);
    } catch (e) {
      setTrendingError(apiError(e));
    } finally {
      setIsLoadingTrending(false);
    }
  }, [tmdbConfigured]);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  const loadMoreMovies = async () => {
    setLoadingMoreMovies(true);
    try {
      const res = await axios.get(`${TMDB_BASE}/movies/streaming`, { params: { page: moviesPage + 1 } });
      setTrendingMovies(prev => {
        const seen = new Set(prev.map(m => m.id));
        return [...prev, ...(res.data.results || []).filter(m => !seen.has(m.id)).map(i => ({ ...i, media_type: 'movie' }))];
      });
      setMoviesPage(res.data.page);
      setMoviesTotalPages(res.data.total_pages);
    } catch (e) {
      showToast('Could not load more: ' + apiError(e), 'error');
    } finally {
      setLoadingMoreMovies(false);
    }
  };

  // Allow deep-linking: /media?tab=tracked
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'tracked' || tab === 'torrents') setActiveTab(tab);
    if (tab === 'torrents') setTorrentQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const runSearch = useCallback(async (query, page = 1) => {
    if (!query.trim()) return;
    if (tmdbConfigured === false) {
      showToast('Add a TMDB API key in Settings', 'error');
      return;
    }
    const seq = ++searchSeq.current;
    setIsSearching(true);
    try {
      let url, params;
      if (activeTab === 'movies') {
        url = `${TMDB_BASE}/search/movie`;
        params = { query, page };
      } else if (activeTab === 'tv') {
        url = `${TMDB_BASE}/search/tv`;
        params = { query, page };
      } else {
        url = `${TMDB_BASE}/search/multi`;
        params = { query, page };
      }
      const res = await axios.get(url, { params });
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      let results = (res.data.results || []).filter(i =>
        activeTab === 'movies' ? true :
        activeTab === 'tv' ? true :
        ['movie', 'tv'].includes(i.media_type)
      ).map(i => ({
        ...i,
        media_type: i.media_type || (activeTab === 'movies' ? 'movie' : 'tv'),
      }));

      if (page === 1) {
        setSearchResults(results);
      } else {
        setSearchResults(prev => {
          const seen = new Set(prev.map(x => `${x.media_type}:${x.id}`));
          return [...prev, ...results.filter(r => !seen.has(`${r.media_type}:${r.id}`))];
        });
      }
      setSearchPage(res.data.page);
      setTotalPages(res.data.total_pages);
      setTotalResults(res.data.total_results);
    } catch (e) {
      if (seq === searchSeq.current) showToast('Search failed: ' + apiError(e), 'error');
    } finally {
      if (seq === searchSeq.current) setIsSearching(false);
    }
  }, [tmdbConfigured, activeTab, showToast]);

  const handleQueryChange = (q) => {
    setSearchQuery(q);
    setSearchResults([]);
    setSearchPage(0);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) { setIsSearching(false); return; }
    setIsSearching(true);
    searchDebounce.current = setTimeout(() => runSearch(q, 1), 400);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchPage(0);
    setTotalPages(0);
    setIsSearching(false);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
  };

  const trending = activeTab === 'tv' ? trendingTv : trendingMovies;

  const handleItemClick = (item) => setSelectedItem(item);

  const handleFindSources = (query) => {
    // Open the Torrents tab with the query pre-filled (and searched).
    setTorrentQuery(query);
    setActiveTab('torrents');
    window.scrollTo({ top: 0 });
  };

  const tabs = [
    { id: 'movies', label: '🎬 Movies' },
    { id: 'tv', label: '📺 TV' },
    { id: 'tracked', label: '📡 Tracked' },
    { id: 'torrents', label: '🔍 Torrents' },
  ];

  return (
    <div className="fade-in">
      {/* Tab bar */}
      <div className="media-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`mobile-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); clearSearch(); setSearching(false); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tracked tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'tracked' && (
        <div className="fade-in">
          <div className="mobile-tabs" style={{ background: '#12122a' }}>
            <button
              className={`mobile-tab ${trackedSubTab === 'ongoing' ? 'active' : ''}`}
              onClick={() => setTrackedSubTab('ongoing')}
            >
              <span>📡</span> Ongoing
            </button>
            <button
              className={`mobile-tab ${trackedSubTab === 'past' ? 'active' : ''}`}
              onClick={() => setTrackedSubTab('past')}
            >
              <span>📚</span> Past Shows
            </button>
          </div>
          <div className="card">
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.4' }}>
              {trackedSubTab === 'ongoing'
                ? <span>📡 <strong style={{ color: '#667eea' }}>Ongoing Shows:</strong> Automatically download new episodes as they air</span>
                : <span>📚 <strong style={{ color: '#667eea' }}>Past Shows:</strong> Download complete seasons with quality packs</span>
              }
            </p>
          </div>
          <div className="slide-up">
            {trackedSubTab === 'ongoing' && <OngoingShows />}
            {trackedSubTab === 'past' && <PastShows />}
          </div>
        </div>
      )}

      {/* ── Torrent search ─────────────────────────────────────────────────── */}
      {activeTab === 'torrents' && (
        <div className="fade-in">
          <TorrentSearch key={torrentQuery} initialQuery={torrentQuery} />
        </div>
      )}

      {/* ── Movies / TV tabs ────────────────────────────────────────────────── */}
      {(activeTab === 'movies' || activeTab === 'tv') && (
        <>
          {/* Search bar */}
          <div className="media-search-bar">
            {searching ? (
              <div className="media-search-input-row">
                <input
                  className="input"
                  autoFocus
                  placeholder={`Search ${activeTab === 'movies' ? 'movies' : 'TV shows'}…`}
                  value={searchQuery}
                  onChange={e => handleQueryChange(e.target.value)}
                />
                <button className="button button-secondary" onClick={() => { setSearching(false); clearSearch(); }}>
                  ✕
                </button>
              </div>
            ) : (
              <div className="media-search-input-row">
                <span className="media-trending-label">
                  {activeTab === 'movies'
                    ? 'New on streaming'
                    : 'Trending this week'}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="button button-secondary" onClick={loadTrending} disabled={isLoadingTrending}>
                    🔄
                  </button>
                  <button className="button" onClick={() => setSearching(true)}>
                    🔍 Search
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          {searching ? (
            <div className="card">
              {isSearching && (
                <div className="empty-state"><div className="loading-spinner" /></div>
              )}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-title">No results</div>
                  <p className="empty-state-message">Try a different title</p>
                </div>
              )}
              {!isSearching && !searchQuery && (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <p className="empty-state-message">Search by title</p>
                </div>
              )}
              {searchResults.length > 0 && (
                <>
                  <p style={{ color: '#b0b0c0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {searchResults.length} of {totalResults} results
                  </p>
                  <div className="media-list">
                    {searchResults.map(item => (
                      <MediaListItem key={`${item.media_type}:${item.id}`} item={item} onClick={handleItemClick} />
                    ))}
                  </div>
                  {searchPage < totalPages && (
                    <button
                      className="button button-secondary"
                      style={{ width: '100%', marginTop: '1rem' }}
                      onClick={() => runSearch(searchQuery, searchPage + 1)}
                      disabled={isSearching}
                    >
                      {isSearching ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {trendingError && (
                <div className="card">
                  <div style={{ color: '#ff9800', padding: '0.5rem 0', fontSize: '0.875rem' }}>
                    ⚠️ {trendingError}
                    {tmdbConfigured === false && (
                      <button className="button button-secondary" style={{ marginTop: '0.75rem', width: '100%' }}
                        onClick={() => navigate('/settings')}>
                        Open Settings
                      </button>
                    )}
                  </div>
                </div>
              )}
              {isLoadingTrending && !trendingError && (
                <div className="card"><div className="empty-state"><div className="loading-spinner" /></div></div>
              )}
              {!isLoadingTrending && trending.length > 0 && (
                <div className="media-grid">
                  {trending.map(item => (
                    <MediaCard key={item.id} item={item} onClick={handleItemClick} />
                  ))}
                </div>
              )}
              {!isLoadingTrending && activeTab === 'movies' && trending.length > 0 && moviesPage < moviesTotalPages && (
                <div style={{ padding: '0 1rem 1rem' }}>
                  <button className="button button-secondary" style={{ width: '100%' }}
                    onClick={loadMoreMovies} disabled={loadingMoreMovies}>
                    {loadingMoreMovies ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
              {!isLoadingTrending && trending.length === 0 && !trendingError && (
                <div className="card">
                  <div className="empty-state">
                    <div className="empty-state-icon">{activeTab === 'tv' ? '📺' : '🎬'}</div>
                    <p className="empty-state-message">No titles available</p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedItem && (
        <MediaDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onFindSources={handleFindSources}
        />
      )}
    </div>
  );
}
