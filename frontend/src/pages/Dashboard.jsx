import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';
import QueuePopup from '../components/QueuePopup';
import SearchLogsPopup from '../components/SearchLogsPopup';
import HistoryCard from '../components/HistoryCard';
import usePolling from '../hooks/usePolling';
import { formatBytes, formatSpeed, formatDuration, levelColor, apiError } from '../lib/format';

// Links open the real web UIs on the same host the dashboard was loaded from.
const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const EXTERNAL_SERVICES = [
  { name: 'qBittorrent', icon: '⬇️', url: `http://${host}:8080` },
  { name: 'Plex', icon: '🎞️', url: `http://${host}:32400/web` },
];

function Tile({ label, value, sub, percent }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {percent != null && (
        <div className="meter" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.min(100, percent)}%`, background: levelColor(percent) }} />
        </div>
      )}
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function StatusRow({ state, title, sub, right }) {
  return (
    <div className="status-row">
      <span className={`dot dot-${state}`} aria-hidden="true" />
      <div className="status-row-main">
        <div className="status-row-title">{title}</div>
        {sub && <div className="status-row-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const containerState = (c) => {
  if (!c.running) return 'bad';
  if (c.healthy === false) return 'warn';
  return 'ok';
};

// Chart configs live at module level so they don't trigger redraws every render.
const CPU_CHART = {}; // HistoryChart defaults are the CPU % scale
const CPU_LEGEND = [['#4caf50', 'Normal (<60%)'], ['#ff9800', 'High (60–80%)'], ['#f44336', 'Critical (>80%)']];
const pct = (v) => `${Math.round(v)}%`;

// RK3566 SoC: comfortable below 60°C, warm above, throttles around 85°C.
const TEMP_CHART = {
  min: 30,
  max: 90,
  yTicks: [30, 45, 60, 75, 90],
  formatY: (v) => `${v}°`,
  colour: (v) => (v >= 75 ? '#f44336' : v >= 60 ? '#ff9800' : '#4caf50'),
};
const TEMP_LEGEND = [['#4caf50', 'Normal (<60°C)'], ['#ff9800', 'Warm (60–75°C)'], ['#f44336', 'Hot (>75°C)']];
const celsius = (v) => `${v.toFixed(1)}°C`;

const TORRENT_CONNECTION = {
  connected: { state: 'ok', label: 'Connected' },
  firewalled: { state: 'warn', label: 'Firewalled (no incoming peers)' },
  disconnected: { state: 'bad', label: 'Disconnected' },
};

function Dashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [confirmPower, setConfirmPower] = useState(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showSearchLogs, setShowSearchLogs] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/overview', { timeout: 10000 });
      setOverview(res.data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(apiError(err));
    }
  }, []);

  usePolling(fetchOverview, 10000);

  const executePowerAction = async () => {
    const action = confirmPower;
    setConfirmPower(null);
    try {
      const res = await axios.post(`/api/system/power/${action}`);
      showToast(res.data.message || `Server ${action} initiated`, 'success', 6000);
    } catch (err) {
      showToast('Error: ' + apiError(err), 'error');
    }
  };

  if (!overview && !error) {
    return (
      <div className="fade-in">
        <div className="card">
          <h2>🏠 Dashboard</h2>
          <LoadingSkeleton count={4} height="60px" />
        </div>
      </div>
    );
  }

  const o = overview || {};
  const online = !error;
  const storage = o.disks?.storage;
  const root = o.disks?.root;
  // Physical volumes as detected by the server (device type from sysfs).
  // Older servers don't send them: fall back to the two statfs readings.
  const volumes = o.disks?.volumes?.length
    ? o.disks.volumes
    : [
      storage && { id: 'storage', kind: 'Media storage', roles: ['Media'], mounts: [storage.mountPoint], ...storage },
      root && { id: 'root', kind: 'System disk', roles: ['System'], mounts: [root.mountPoint], ...root },
    ].filter(Boolean);
  const systemVol = volumes.find((v) => v.roles.includes('System'));
  const mediaVol = volumes.find((v) => v.roles.includes('Media')) || systemVol;
  const sharedDisk = Boolean(systemVol && mediaVol && systemVol.id === mediaVol.id);
  const fullVolumes = volumes.filter((v) => v.percent > 85 && (v.roles.includes('System') || v.roles.includes('Media')));
  const qb = o.torrentClient;
  const qbConn = qb ? TORRENT_CONNECTION[qb.connection] || { state: 'warn', label: qb.connection } : null;
  const vpn = o.containers?.find((c) => c.name === 'gluetun');
  const sectionErrors = Object.keys(o.errors || {});

  return (
    <div className="fade-in">
      <div className={`health-banner ${online ? 'health-online' : 'health-offline'}`} role="status">
        <span className="health-banner-icon">{online ? '✅' : '❌'}</span>
        <span className="health-banner-text">
          {online ? 'Server online' : `Can't reach server: ${error}`}
        </span>
        {lastUpdated && (
          <span className="health-banner-updated">
            {online ? 'Updated' : 'Last seen'} {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {sectionErrors.length > 0 && online && (
        <div className="inline-alert inline-alert-warn" style={{ margin: '0.75rem 1rem 0' }}>
          Some data is unavailable: {sectionErrors.join(', ')}.
        </div>
      )}

      {/* System */}
      <div className="card">
        <h2>📊 System</h2>
        <div className="tile-grid">
          <Tile
            label="CPU"
            value={o.cpu?.percent != null ? `${o.cpu.percent.toFixed(0)}%` : '—'}
            percent={o.cpu?.percent}
            sub={o.load ? `Load ${o.load.map((l) => l.toFixed(2)).join(' · ')}` : null}
          />
          <Tile
            label="Memory"
            value={o.memory ? `${o.memory.percent.toFixed(0)}%` : '—'}
            percent={o.memory?.percent}
            sub={o.memory ? `${formatBytes(o.memory.used)} of ${formatBytes(o.memory.total)}` : null}
          />
          <Tile
            label={sharedDisk ? `Storage · ${mediaVol.kind}` : 'Media storage'}
            value={mediaVol ? formatBytes(mediaVol.available, 0) : '—'}
            percent={mediaVol?.percent}
            sub={mediaVol ? `free · ${mediaVol.percent.toFixed(0)}% used of ${formatBytes(mediaVol.size, 0)}` : null}
          />
          <Tile
            label={o.temperature != null ? 'Temperature' : 'Uptime'}
            value={o.temperature != null ? `${o.temperature.toFixed(0)}°C` : formatDuration(o.uptime)}
            percent={o.temperature != null ? Math.min(100, o.temperature) : null}
            sub={o.temperature != null ? `Up ${formatDuration(o.uptime)}` : null}
          />
        </div>
        {fullVolumes.map((v) => (
          <div key={v.id} className="inline-alert inline-alert-warn" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            {v.roles.includes('System') && v.roles.includes('Media')
              ? <>The {v.kind} holding both the system and your media is {v.percent.toFixed(0)}% full — {formatBytes(v.available)} left.
                {' '}Downloads stop when it fills{v.reserved > 0 ? `; system services keep a ${formatBytes(v.reserved, 0)} reserve` : ''}.</>
              : <>{v.roles.includes('System') ? 'System disk' : 'Media storage'} ({v.kind}) is {v.percent.toFixed(0)}% full — {formatBytes(v.available)} left.</>}
          </div>
        ))}
      </div>

      {/* Downloads & network */}
      <div className="card">
        <div className="card-header-row">
          <h2>🛡️ Downloads &amp; VPN</h2>
          <button className="link-button" onClick={() => navigate('/storage')}>Storage →</button>
        </div>
        <div className="status-list">
          <StatusRow
            state={vpn ? containerState(vpn) : 'idle'}
            title="VPN tunnel (gluetun)"
            sub={vpn ? vpn.status : 'Container not found'}
          />
          <StatusRow
            state={qbConn ? qbConn.state : 'bad'}
            title="qBittorrent"
            sub={qb ? `${qbConn.label} · ${qb.dhtNodes} DHT nodes` : (o.errors?.torrentClient || 'Unavailable')}
            right={qb && (
              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ color: 'var(--success)' }}>↓ {formatSpeed(qb.dlSpeed)}</div>
                <div style={{ color: 'var(--info)' }}>↑ {formatSpeed(qb.upSpeed)}</div>
              </div>
            )}
          />
        </div>
        <div className="mobile-grid-2 mt-1">
          <button className="button button-secondary" onClick={() => setShowQueue(true)}>
            <span>📋</span><span>Search queue</span>
          </button>
          <button className="button button-secondary" onClick={() => setShowSearchLogs(true)}>
            <span>🧾</span><span>Search logs</span>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2>⚡ Quick Actions</h2>
        <div className="mobile-grid-2">
          <button className="button" onClick={() => navigate('/media?tab=torrents')}>
            <span>🔍</span><span>Find torrent</span>
          </button>
          <button className="button" onClick={() => navigate('/media?tab=tracked')}>
            <span>📺</span><span>TV shows</span>
          </button>
          {EXTERNAL_SERVICES.map((s) => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
              className="button button-secondary" style={{ textDecoration: 'none' }}>
              <span>{s.icon}</span><span>{s.name}</span>
            </a>
          ))}
        </div>
      </div>

      <HistoryCard title="📈 CPU History" endpoint="/api/system/cpu-history"
        chart={CPU_CHART} legend={CPU_LEGEND} formatValue={pct} />

      {o.temperature != null && (
        <HistoryCard title="🌡️ Temperature" endpoint="/api/system/temp-history"
          chart={TEMP_CHART} legend={TEMP_LEGEND} formatValue={celsius} />
      )}

      {/* Containers & services */}
      <div className="card">
        <h2>🐳 Containers &amp; Services</h2>
        <div className="status-list">
          {(o.containers || []).map((c) => (
            <StatusRow key={c.name} state={containerState(c)} title={c.name} sub={`${c.image} · ${c.status}`} />
          ))}
          {(o.services || []).map((s) => (
            <StatusRow
              key={s.service}
              state={s.status === 'active' ? 'ok' : s.status === 'activating' ? 'warn' : 'bad'}
              title={s.service}
              sub={`${s.status} (${s.sub})`}
            />
          ))}
          {!o.containers?.length && !o.services?.length && (
            <p className="hint">No container or service data available.</p>
          )}
        </div>
      </div>

      {/* Storage detail */}
      <div className="card">
        <h2>💾 Storage</h2>
        <div className="status-list">
          {volumes.map((d) => (
            <div key={d.id} className="status-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span className="status-row-title">
                  {d.kind} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {d.roles.join(' + ')}</span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBytes(d.used)} / {formatBytes(d.size)}
                </span>
              </div>
              <div className="meter" style={{ marginTop: 0 }}>
                <span style={{ width: `${d.percent}%`, background: levelColor(d.percent) }} />
              </div>
              <div className="status-row-sub">
                {[d.model, d.device].filter(Boolean).join(' · ')}{d.model || d.device ? ' · ' : ''}
                {d.mounts.join(', ')} · {formatBytes(d.available)} free
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Power */}
      <div className="card">
        <h2>⏻ Power</h2>
        <p className="hint" style={{ marginBottom: '1rem' }}>
          Restarts or turns off the whole server, including Plex and downloads.
        </p>
        <div className="mobile-grid-2">
          <button className="button button-secondary" onClick={() => setConfirmPower('reboot')}>
            <span>🔄</span><span>Reboot</span>
          </button>
          <button className="button button-danger" onClick={() => setConfirmPower('shutdown')}>
            <span>⏻</span><span>Shut down</span>
          </button>
        </div>
        {o.deploy?.commit && (
          <p className="hint" style={{ marginTop: '1rem', fontSize: '0.72rem', color: 'var(--text-faint)' }}>
            Build {o.deploy.commit} · running since {new Date(o.deploy.startedAt).toLocaleString()}
          </p>
        )}
      </div>

      {confirmPower && (
        <ConfirmModal
          title={confirmPower === 'reboot' ? 'Reboot server?' : 'Shut down server?'}
          message={confirmPower === 'reboot'
            ? 'All services will be unavailable for a minute or two while the server restarts.'
            : 'The server will power off. You will need physical access to turn it back on.'}
          confirmText={confirmPower === 'reboot' ? 'Reboot' : 'Shut down'}
          cancelText="Cancel"
          type="danger"
          onConfirm={executePowerAction}
          onCancel={() => setConfirmPower(null)}
        />
      )}

      <QueuePopup isOpen={showQueue} onClose={() => setShowQueue(false)} />
      <SearchLogsPopup isOpen={showSearchLogs} onClose={() => setShowSearchLogs(false)} />
    </div>
  );
}

export default Dashboard;
