import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import usePolling from '../hooks/usePolling';
import ConfirmModal from './ConfirmModal';
import { formatBytes, apiError } from '../lib/format';
import { isDownloading, isStopped, formatEta, STATE_LABELS, prettyTorrentName } from '../lib/torrents';

const ROTATE_MS = 4000;
const SLIDE_H = 46;

function Progress({ value }) {
  return (
    <div className="dl-progress" aria-hidden="true">
      <span style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  );
}

function SlideContent({ t }) {
  return (
    <>
      <div className="dl-line">
        <span className="dl-name">{prettyTorrentName(t.name)}</span>
        <span className="dl-pct">{(t.progress * 100).toFixed(0)}%</span>
      </div>
      <Progress value={t.progress} />
      <div className="dl-meta">
        {t.dlspeed > 0 ? `↓ ${formatBytes(t.dlspeed)}/s · ${formatEta(t.eta)} left` : STATE_LABELS[t.state] || t.state}
        {' · '}{formatBytes(t.size)}
      </div>
    </>
  );
}

/**
 * Sticky bar under the navigation, shown only while torrents are downloading.
 * With more than one download it auto-scrolls through them; tap to manage.
 */
export default function DownloadsBar() {
  const { showToast } = useToast();
  const [torrents, setTorrents] = useState([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const resumeTimer = useRef(null);

  const fetchTorrents = useCallback(async () => {
    try {
      const res = await axios.get('/api/qbittorrent/torrents', { timeout: 10000 });
      setTorrents(Array.isArray(res.data) ? res.data : []);
    } catch {
      // Keep the last list; the dashboard shows connection problems.
    }
  }, []);

  const active = torrents.filter(isDownloading);
  // Incomplete but stopped: shown in the sheet so they can be resumed.
  const stoppedIncomplete = torrents.filter((t) => isStopped(t) && t.progress < 1);

  usePolling(fetchTorrents, active.length ? 5000 : 15000);

  useEffect(() => {
    if (index >= active.length) setIndex(0);
  }, [active.length, index]);

  useEffect(() => {
    if (active.length < 2 || paused || sheetOpen) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % active.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [active.length, paused, sheetOpen]);

  // Pause auto-scroll while the user touches the bar, resume a bit after.
  const holdRotation = () => {
    setPaused(true);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 6000);
  };
  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  const control = async (action, t, withFiles) => {
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, { hashes: t.hash, deleteFiles: withFiles });
      showToast({ pause: 'Download stopped', resume: 'Download started', delete: 'Download removed' }[action], 'success');
      setTimeout(fetchTorrents, 1000);
    } catch (err) {
      showToast('Error: ' + apiError(err), 'error');
    }
  };

  if (!active.length && !sheetOpen) return null;

  const totalSpeed = active.reduce((a, t) => a + (t.dlspeed || 0), 0);

  return (
    <>
      {active.length > 0 && (
        <button
          type="button"
          className="dl-bar"
          onClick={() => setSheetOpen(true)}
          onTouchStart={holdRotation}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label={`${active.length} download${active.length > 1 ? 's' : ''} in progress. Open downloads.`}
        >
          <span className="dl-icon" aria-hidden="true">⬇</span>
          <div className="dl-viewport">
            {/* Each slide is SLIDE_H px tall (see .dl-slide); % would be relative to the whole track. */}
            <div className="dl-track" style={{ transform: `translateY(-${index * SLIDE_H}px)` }}>
              {active.map((t, i) => (
                <div key={t.hash} className="dl-slide" aria-hidden={i !== index}>
                  <SlideContent t={t} />
                </div>
              ))}
            </div>
          </div>
          {active.length > 1 && (
            <div className="dl-side">
              <span className="dl-count">{index + 1}/{active.length}</span>
              <div className="dl-dots" aria-hidden="true">
                {active.slice(0, 6).map((t, i) => <span key={t.hash} className={i === index ? 'on' : ''} />)}
              </div>
            </div>
          )}
        </button>
      )}

      {sheetOpen && (
        <div className="sheet-overlay fade-in" onClick={() => setSheetOpen(false)}>
          <div className="sheet slide-up" role="dialog" aria-modal="true" aria-labelledby="dl-sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2 id="dl-sheet-title">Downloads</h2>
              <span className="hint">{active.length} active{totalSpeed > 0 ? ` · ↓ ${formatBytes(totalSpeed)}/s` : ''}</span>
              <button className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="sheet-body">
              {[...active, ...stoppedIncomplete].map((t) => {
                const stopped = isStopped(t);
                return (
                  <div key={t.hash} className="dl-row">
                    <div className="dl-line">
                      <span className="dl-name" title={t.name}>{prettyTorrentName(t.name)}</span>
                      <span className="dl-pct">{(t.progress * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={t.progress} />
                    <div className="dl-meta">
                      {stopped ? 'Stopped' : t.dlspeed > 0 ? `↓ ${formatBytes(t.dlspeed)}/s · ${formatEta(t.eta)} left` : STATE_LABELS[t.state] || t.state}
                      {' · '}{formatBytes(t.completed)} of {formatBytes(t.size)}
                      {' · '}{t.num_seeds} seeds
                    </div>
                    <div className="row-actions" style={{ marginTop: '0.5rem' }}>
                      <button className="button button-small button-secondary" onClick={() => control(stopped ? 'resume' : 'pause', t)}>
                        {stopped ? '▶ Start' : '⏹ Stop'}
                      </button>
                      <button className="button button-small button-danger" onClick={() => setConfirm(t)}>Remove</button>
                    </div>
                  </div>
                );
              })}
              {!active.length && !stoppedIncomplete.length && <p className="hint">Nothing downloading right now.</p>}
              <p className="hint" style={{ marginTop: '1rem' }}>Finished downloads are in Storage.</p>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="Remove download?"
          message={`Remove "${prettyTorrentName(confirm.name)}" from qBittorrent?`}
          confirmText={deleteFiles ? 'Remove + delete files' : 'Remove'}
          onConfirm={() => { control('delete', confirm, deleteFiles); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        >
          <label className="check-row">
            <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
            Also delete the partly downloaded files
          </label>
        </ConfirmModal>
      )}
    </>
  );
}
