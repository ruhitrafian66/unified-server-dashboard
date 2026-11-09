import { useState, useCallback, useMemo, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';
import usePolling from '../hooks/usePolling';
import { formatBytes, levelColor, apiError } from '../lib/format';
import { STATE_LABELS, isDownloading } from '../lib/torrents';

const POSTER = 'https://image.tmdb.org/t/p/w92';
const POSTER_LG = 'https://image.tmdb.org/t/p/w185';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV' },
  { id: 'other', label: 'Other' },
];
const SORTS = [
  { id: 'size', label: 'Largest' },
  { id: 'recent', label: 'Newest' },
  { id: 'title', label: 'A–Z' },
];
const KIND_ICON = { movie: '🎬', tv: '📺', leftover: '🗂️', other: '📁' };

const pad = (n) => String(n).padStart(2, '0');

/** "S04–S08" or "S01" from a sorted season list; gaps shown as "S01–S03, S05". */
const seasonRange = (nums = []) => {
  if (!nums.length) return '';
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of [...nums.slice(1), null]) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `S${pad(start)}` : `S${pad(start)}–S${pad(prev)}`);
    start = n;
    prev = n;
  }
  return parts.join(', ');
};

const episodeTitle = (file) => {
  const base = file.split('/').pop().replace(/\.[a-z0-9]{2,4}$/i, '');
  const after = base.split(/(?:^|[^a-z0-9])(?:S\d{1,2}[ ._-]?E\d{1,3}|\d{1,2}x\d{2,3})/i)[1] ?? '';
  const cleaned = after.replace(/[._]+/g, ' ')
    .split(/\(|\[|\b(2160p|1080p|720p|480p|web|bluray|bdrip|x26[45]|hevc|ita|eng)\b/i)[0]
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '');
  return cleaned;
};

function TorrentChip({ torrent }) {
  if (!torrent) return null;
  if (isDownloading(torrent)) return <span className="chip chip-info">⬇ {(torrent.progress * 100).toFixed(0)}%</span>;
  if (torrent.progress < 1) return <span className="chip chip-warn">Stopped at {(torrent.progress * 100).toFixed(0)}%</span>;
  const seeding = ['uploading', 'stalledUP', 'forcedUP', 'queuedUP'].includes(torrent.state);
  return <span className={`chip ${seeding ? 'chip-ok' : ''}`}>{seeding ? 'Seeding' : 'In qBittorrent'}</span>;
}

function Poster({ item, large }) {
  const [failed, setFailed] = useState(false);
  if (item.poster && !failed) {
    return (
      <img className={large ? 'lib-poster-lg' : 'lib-poster'} src={`${large ? POSTER_LG : POSTER}${item.poster}`}
        alt="" loading="lazy" onError={() => setFailed(true)} />
    );
  }
  return <div className={`${large ? 'lib-poster-lg' : 'lib-poster'} lib-poster-empty`} aria-hidden="true">{KIND_ICON[item.kind]}</div>;
}

function summaryLine(item) {
  if (item.kind === 'tv') {
    const s = seasonRange(item.seasonNumbers || item.seasons?.map((x) => x.season));
    return `${s} · ${item.episodeCount} episode${item.episodeCount === 1 ? '' : 's'}`;
  }
  if (item.kind === 'movie') return item.videoCount > 1 ? `Movie · ${item.videoCount} videos` : 'Movie';
  if (item.kind === 'leftover') return 'No video files — incomplete or leftover download';
  return `${item.fileCount.toLocaleString()} file${item.fileCount === 1 ? '' : 's'} · not media`;
}

function LibraryRow({ item, onOpen }) {
  return (
    <button type="button" className="lib-row" onClick={() => onOpen(item)}>
      <Poster item={item} />
      <div className="lib-row-main">
        <div className="lib-title">
          {item.kind === 'other' || item.kind === 'leftover' ? item.name : item.title}
          {item.year && item.kind !== 'other' ? <span className="lib-year"> ({item.year})</span> : null}
        </div>
        <div className="lib-sub">{summaryLine(item)}</div>
        <div className="lib-chips">
          {item.quality.slice(0, 3).map((q) => <span key={q} className="chip">{q}</span>)}
          <TorrentChip torrent={item.torrent} />
          {item.duplicateOf?.length > 0 && <span className="chip chip-warn">Duplicate</span>}
          {item.missingSeasons?.length > 0 && <span className="chip chip-warn">Partial</span>}
        </div>
      </div>
      <div className="lib-size">{formatBytes(item.size, item.size >= 10 * 2 ** 30 ? 0 : 1)}</div>
    </button>
  );
}

function ItemSheet({ summary, allItems, onClose, onDeleted }) {
  const { showToast } = useToast();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [openSeason, setOpenSeason] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    axios.get(`/api/library/items/${summary.id}`)
      .then((res) => setItem(res.data))
      .catch((err) => setError(apiError(err)));
  }, [summary.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirmDelete) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete]);

  const doDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const res = await axios.delete(`/api/library/items/${summary.id}`, { timeout: 60000 });
      showToast(`Deleted ${summary.title} · freed ${formatBytes(res.data.freed)}`, 'success');
      onDeleted();
    } catch (err) {
      showToast('Delete failed: ' + apiError(err), 'error');
      setDeleting(false);
    }
  };

  const it = item || summary;
  const others = (summary.duplicateOf || []).map((id) => allItems.find((x) => x.id === id)).filter(Boolean);
  const displayTitle = it.kind === 'other' || it.kind === 'leftover' ? it.name : it.title;

  return (
    <div className="sheet-overlay fade-in" onClick={onClose}>
      <div className="sheet slide-up" role="dialog" aria-modal="true" aria-labelledby="lib-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2 id="lib-sheet-title" className="sr-only">{displayTitle}</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          <div className="lib-detail-head">
            <Poster item={it} large />
            <div style={{ minWidth: 0 }}>
              <div className="lib-detail-title">{displayTitle}{it.year && it.kind !== 'other' ? ` (${it.year})` : ''}</div>
              <div className="lib-sub">{summaryLine(it)}</div>
              <div className="lib-detail-size">{formatBytes(it.size)}</div>
              <div className="lib-chips">
                {it.quality.map((q) => <span key={q} className="chip">{q}</span>)}
                <TorrentChip torrent={it.torrent} />
              </div>
            </div>
          </div>

          {it.torrent && (
            <p className="hint">
              qBittorrent: {STATE_LABELS[it.torrent.state] || it.torrent.state} · ratio {it.torrent.ratio}
            </p>
          )}
          {it.missingSeasons?.length > 0 && (
            <div className="inline-alert inline-alert-warn" style={{ marginTop: '0.75rem' }}>
              The release is named for {seasonRange([...it.missingSeasons, ...(it.seasons || []).map((s) => s.season)].sort((a, b) => a - b))},
              {' '}but {seasonRange(it.missingSeasons)} {it.missingSeasons.length === 1 ? 'is' : 'are'} not on disk.
            </div>
          )}
          {others.length > 0 && (
            <div className="inline-alert inline-alert-warn" style={{ marginTop: '0.75rem' }}>
              Another copy is stored: {others.map((o) => `${o.quality.join(' ') || o.name} · ${formatBytes(o.size)}`).join('; ')}.
              Delete one to free space.
            </div>
          )}

          {!item && !error && <LoadingSkeleton count={2} height="44px" />}
          {error && <div className="inline-alert inline-alert-bad">{error}</div>}

          {item?.kind === 'tv' && (
            <div className="lib-seasons">
              {item.seasons.map((s) => (
                <div key={s.season} className="lib-season">
                  <button type="button" className="lib-season-head" aria-expanded={openSeason === s.season}
                    onClick={() => setOpenSeason(openSeason === s.season ? null : s.season)}>
                    <span>Season {s.season}</span>
                    <span className="lib-sub">{s.episodes.length} ep · {formatBytes(s.size)} {openSeason === s.season ? '▴' : '▾'}</span>
                  </button>
                  {openSeason === s.season && (
                    <ul className="lib-episodes">
                      {s.episodes.map((e) => (
                        <li key={e.file}>
                          <span className="lib-ep-num">E{pad(e.episode)}</span>
                          <span className="lib-ep-title">{episodeTitle(e.file) || e.file.split('/').pop()}</span>
                          <span className="lib-ep-size">{formatBytes(e.size, 0)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {item.extras.length > 0 && <p className="hint">+ {item.extras.length} extra video{item.extras.length === 1 ? '' : 's'} (featurettes, specials)</p>}
            </div>
          )}

          {item?.kind === 'movie' && item.mainFile && (
            <div className="lib-files">
              <div className="lib-file"><span>{item.mainFile.file.split('/').pop()}</span><span>{formatBytes(item.mainFile.size)}</span></div>
              {item.subtitles > 0 && <p className="hint">{item.subtitles} subtitle file{item.subtitles === 1 ? '' : 's'}</p>}
            </div>
          )}

          <div className="lib-raw">
            <span className="settings-label">On disk</span>
            <code>{it.name}{it.isFile ? '' : '/'}</code>
            <span className="hint">{it.fileCount.toLocaleString()} file{it.fileCount === 1 ? '' : 's'} · modified {new Date(it.modified).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="sheet-footer">
          {it.deletable ? (
            <button className="button button-danger" style={{ width: '100%' }} disabled={deleting} onClick={() => setConfirmDelete(true)}>
              {deleting ? 'Deleting…' : `🗑 Delete · free ${formatBytes(it.size)}`}
            </button>
          ) : (
            <p className="hint" style={{ textAlign: 'center' }}>Not media — read-only here. Manage it over the file share.</p>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${displayTitle}?`}
          message={`This permanently deletes ${formatBytes(it.size)} from the server${it.torrent ? ' and removes the torrent from qBittorrent' : ''}. Plex will no longer show it.`}
          confirmText="Delete"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

export default function Storage() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('size');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const res = await axios.get(`/api/library${refresh ? '?refresh=1' : ''}`, { timeout: 60000 });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  usePolling(() => load(false), 60000);

  const cleanup = async () => {
    setConfirmCleanup(false);
    try {
      const res = await axios.post('/api/library/cleanup');
      showToast(`Removed ${res.data.removed} junk item(s) · freed ${formatBytes(res.data.freed)}`, 'success');
      load(true);
    } catch (err) {
      showToast('Cleanup failed: ' + apiError(err), 'error');
    }
  };

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.items.filter((i) => {
      if (filter === 'other' && !['other', 'leftover'].includes(i.kind)) return false;
      if (filter !== 'all' && filter !== 'other' && i.kind !== filter) return false;
      return !q || i.title.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
    });
    const byKind = (i) => (['other', 'leftover'].includes(i.kind) ? 1 : 0); // media first
    return list.sort((a, b) => byKind(a) - byKind(b) || (
      sort === 'size' ? b.size - a.size
        : sort === 'recent' ? new Date(b.modified) - new Date(a.modified)
          : a.title.localeCompare(b.title)));
  }, [data, filter, sort, query]);

  if (!data && !error) {
    return <div className="fade-in"><div className="card"><h2>💾 Storage</h2><LoadingSkeleton count={5} height="72px" /></div></div>;
  }
  if (!data) {
    return (
      <div className="fade-in">
        <div className="card">
          <h2>💾 Storage</h2>
          <div className="inline-alert inline-alert-bad">Couldn&apos;t read the media library: {error}</div>
          <button className="button" onClick={() => load(true)}>Retry</button>
        </div>
      </div>
    );
  }

  const media = data.items.filter((i) => i.kind === 'movie' || i.kind === 'tv');
  const mediaSize = media.reduce((a, i) => a + i.size, 0);
  const counts = {
    movie: data.items.filter((i) => i.kind === 'movie').length,
    tv: data.items.filter((i) => i.kind === 'tv').length,
  };
  const dupSize = data.items.filter((i) => i.duplicateOf?.length).reduce((a, i) => a + i.size, 0);
  const diskPct = data.disk ? (data.disk.used / (data.disk.used + data.disk.available)) * 100 : null;

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-header-row">
          <h2>💾 Storage</h2>
          <button className="link-button" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? 'Scanning…' : '↻ Rescan'}
          </button>
        </div>
        {data.disk && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
              <span className="tile-value">{formatBytes(data.disk.available, 0)} <span className="lib-sub">free</span></span>
              <span className="lib-sub">{formatBytes(data.disk.used, 0)} of {formatBytes(data.disk.used + data.disk.available, 0)} used</span>
            </div>
            <div className="meter"><span style={{ width: `${diskPct}%`, background: levelColor(diskPct) }} /></div>
          </>
        )}
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          {counts.movie} movie{counts.movie === 1 ? '' : 's'} · {counts.tv} show{counts.tv === 1 ? '' : 's'} · {formatBytes(mediaSize, 0)} of media
          {dupSize > 0 && <> · <span style={{ color: 'var(--warning)' }}>duplicates use {formatBytes(dupSize, 0)}</span></>}
        </p>
        {data.junk.count > 0 && (
          <div className="inline-alert inline-alert-info lib-junk">
            <span>{data.junk.count} junk file{data.junk.count === 1 ? '' : 's'} ({formatBytes(data.junk.size)}): macOS/Windows metadata, empty folders, orphaned partial files.</span>
            <button className="button button-small button-secondary" onClick={() => setConfirmCleanup(true)}>Clean up</button>
          </div>
        )}
        {!data.torrentsAvailable && (
          <div className="inline-alert inline-alert-warn">qBittorrent is unreachable, so download status isn&apos;t shown.</div>
        )}
      </div>

      <div className="card">
        <input className="input" type="search" placeholder="Filter by title…" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Filter library" />
        <div className="lib-controls">
          <div className="filter-buttons" role="tablist" aria-label="Type">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id}
                className={`filter-button ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <select className="lib-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="lib-list">
          {items.map((item) => <LibraryRow key={item.id} item={item} onOpen={setSelected} />)}
          {!items.length && <p className="hint" style={{ padding: '1rem 0' }}>Nothing matches.</p>}
        </div>
      </div>

      {selected && (
        <ItemSheet
          summary={selected}
          allItems={data.items}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); load(true); }}
        />
      )}

      {confirmCleanup && (
        <ConfirmModal
          title="Clean up junk files?"
          message={`Deletes ${data.junk.count} item(s) (${formatBytes(data.junk.size)}): ${data.junk.items.slice(0, 4).map((j) => j.name.split('/').pop()).join(', ')}${data.junk.count > 4 ? '…' : ''}. Media files are not touched.`}
          confirmText="Clean up"
          type="primary"
          onConfirm={cleanup}
          onCancel={() => setConfirmCleanup(false)}
        />
      )}
    </div>
  );
}
