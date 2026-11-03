import { useState, useEffect } from 'react';
import axios from 'axios';
import { useSettings } from '../contexts/SettingsContext';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const TMDB_IMG_BG = 'https://image.tmdb.org/t/p/w780';

export default function MediaDetailModal({ item, onClose, onFindSources }) {
  const { tmdbApiKey, omdbApiKey } = useSettings();
  const [detail, setDetail] = useState(null);
  const [imdbRating, setImdbRating] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);

  const isMovie = (item.media_type || 'movie') === 'movie';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const url = isMovie
          ? `${TMDB_BASE}/movie/${item.id}`
          : `${TMDB_BASE}/tv/${item.id}`;
        const res = await axios.get(url, {
          params: { api_key: tmdbApiKey, append_to_response: 'external_ids' },
        });
        setDetail(res.data);

        // Fetch IMDb rating via OMDb if key configured
        const imdbId = isMovie
          ? res.data.imdb_id || res.data.external_ids?.imdb_id
          : res.data.external_ids?.imdb_id;
        if (imdbId && omdbApiKey) {
          try {
            const omdbRes = await axios.get('https://www.omdbapi.com/', {
              params: { apikey: omdbApiKey, i: imdbId },
            });
            if (omdbRes.data.Response === 'True') setImdbRating(omdbRes.data);
          } catch {
            // OMDb is optional — silent fail
          }
        }
      } catch (e) {
        setError(e.response?.data?.status_message || e.message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [item.id, isMovie, tmdbApiKey, omdbApiKey]);

  const title = detail?.title || detail?.name || item.title || item.name || '';
  const year = (detail?.release_date || detail?.first_air_date || '').slice(0, 4);
  const overview = detail?.overview || item.overview || '';
  const posterUrl = (detail?.poster_path || item.poster_path)
    ? `${TMDB_IMG}${detail?.poster_path || item.poster_path}` : null;
  const backdropUrl = (detail?.backdrop_path || item.backdrop_path)
    ? `${TMDB_IMG_BG}${detail?.backdrop_path || item.backdrop_path}` : null;
  const tmdbScore = detail?.vote_average || item.vote_average;
  const genres = detail?.genres || [];
  const totalSeasons = detail?.number_of_seasons || 1;

  const handleDownload = () => {
    if (isMovie) {
      const query = [title, year].filter(Boolean).join(' ');
      onFindSources(query);
      onClose();
    } else {
      setShowSeasonPicker(true);
    }
  };

  const handleSeasonConfirm = () => {
    const seasonStr = `S${String(selectedSeason).padStart(2, '0')}`;
    const query = [title, seasonStr, year].filter(Boolean).join(' ');
    onFindSources(query);
    setShowSeasonPicker(false);
    onClose();
  };

  return (
    <>
      {/* Season picker dialog */}
      {showSeasonPicker && (
        <div className="modal-overlay" onClick={() => setShowSeasonPicker(false)}>
          <div className="modal-content season-picker" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Season</h3>
              <button className="modal-close" onClick={() => setShowSeasonPicker(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#b0b0c0', marginBottom: '1.25rem', fontSize: '0.875rem' }}>{title}</p>
              <div className="season-picker-controls">
                <button
                  className="season-btn"
                  onClick={() => setSelectedSeason(s => Math.max(1, s - 1))}
                  disabled={selectedSeason <= 1}
                >−</button>
                <div className="season-display">
                  <span style={{ color: '#b0b0c0', fontSize: '0.75rem' }}>Season</span>
                  <span className="season-number">{String(selectedSeason).padStart(2, '0')}</span>
                  <span style={{ color: '#b0b0c0', fontSize: '0.75rem' }}>of {totalSeasons}</span>
                </div>
                <button
                  className="season-btn"
                  onClick={() => setSelectedSeason(s => Math.min(totalSeasons, s + 1))}
                  disabled={selectedSeason >= totalSeasons}
                >+</button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" onClick={() => setShowSeasonPicker(false)}>Cancel</button>
              <button className="button" onClick={handleSeasonConfirm}>
                📥 Find S{String(selectedSeason).padStart(2, '0')} Sources
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main detail sheet */}
      <div className="modal-overlay media-detail-overlay" onClick={onClose}>
        <div className="media-detail-sheet" onClick={e => e.stopPropagation()}>
          {/* Backdrop header */}
          <div className="media-detail-header">
            {backdropUrl ? (
              <img className="media-detail-backdrop" src={backdropUrl} alt="" />
            ) : (
              <div className="media-detail-backdrop-placeholder" />
            )}
            <div className="media-detail-backdrop-gradient" />
            <button className="media-detail-close" onClick={onClose}>✕</button>
            <div className="media-detail-header-content">
              {posterUrl && (
                <img className="media-detail-poster" src={posterUrl} alt={title} />
              )}
              <div className="media-detail-title-block">
                <h2 className="media-detail-title">{title}</h2>
                {year && <span className="media-detail-year">{year}</span>}
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="media-detail-body">
            {isLoading ? (
              <div className="empty-state" style={{ minHeight: '200px' }}>
                <div className="loading-spinner" />
              </div>
            ) : error ? (
              <div style={{ color: '#f44336', padding: '1rem' }}>Error: {error}</div>
            ) : (
              <>
                {/* Rating badges + genres */}
                <div className="media-badge-row">
                  {tmdbScore > 0 && (
                    <span className="media-badge media-badge-blue">⭐ TMDB {tmdbScore.toFixed(1)}</span>
                  )}
                  {imdbRating?.imdbRating && imdbRating.imdbRating !== 'N/A' && (
                    <span className="media-badge media-badge-yellow">⭐ IMDb {imdbRating.imdbRating}</span>
                  )}
                  {genres.slice(0, 2).map(g => (
                    <span key={g.id} className="media-badge media-badge-gray">{g.name}</span>
                  ))}
                </div>

                {/* Meta line */}
                <div className="media-meta-line">
                  {detail?.runtime && <span>{detail.runtime}min</span>}
                  {imdbRating?.Rated && imdbRating.Rated !== 'N/A' && <span>{imdbRating.Rated}</span>}
                  {!isMovie && detail?.number_of_seasons && (
                    <span>{detail.number_of_seasons} season{detail.number_of_seasons !== 1 ? 's' : ''}</span>
                  )}
                  {!isMovie && detail?.number_of_episodes && (
                    <span>{detail.number_of_episodes} episodes</span>
                  )}
                  {detail?.status && <span>{detail.status}</span>}
                </div>

                {/* Tagline */}
                {detail?.tagline && (
                  <p className="media-tagline">"{detail.tagline}"</p>
                )}

                {/* Overview */}
                {overview && (
                  <div className="media-overview-block">
                    <p className="media-section-label">Overview</p>
                    <p className="media-overview">{overview}</p>
                  </div>
                )}

                {/* IMDb extras */}
                {imdbRating?.Response === 'True' && (
                  <div className="media-imdb-extras">
                    {imdbRating.Director && imdbRating.Director !== 'N/A' && (
                      <div className="media-detail-row">
                        <span className="media-detail-label">Director</span>
                        <span className="media-detail-value">{imdbRating.Director}</span>
                      </div>
                    )}
                    {imdbRating.Actors && imdbRating.Actors !== 'N/A' && (
                      <div className="media-detail-row">
                        <span className="media-detail-label">Cast</span>
                        <span className="media-detail-value">{imdbRating.Actors}</span>
                      </div>
                    )}
                    {imdbRating.imdbVotes && imdbRating.imdbVotes !== 'N/A' && (
                      <div className="media-detail-row">
                        <span className="media-detail-label">IMDb Votes</span>
                        <span className="media-detail-value">{imdbRating.imdbVotes}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Download / Find Sources button */}
          <div className="media-detail-footer">
            <button
              className="button"
              style={{ width: '100%', height: '52px', fontSize: '1rem' }}
              onClick={handleDownload}
              disabled={isLoading}
            >
              📥 {isMovie ? 'Find sources' : 'Choose season to download'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
