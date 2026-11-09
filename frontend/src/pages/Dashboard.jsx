import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';
import QueuePopup from '../components/QueuePopup';
import SearchLogsPopup from '../components/SearchLogsPopup';
import CpuChart from '../components/CpuChart';
import usePolling from '../hooks/usePolling';
import { formatBytes, formatSpeed, formatDuration, levelColor, apiError } from '../lib/format';

const CPU_RANGES = [
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '2d', hours: 48 },
  { label: '4d', hours: 96 },
];

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
  const [cpuRange, setCpuRange] = useState(CPU_RANGES[0]);
  const [cpuSamples, setCpuSamples] = useState([]);
  const [cpuLoading, setCpuLoading] = useState(false);

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

  const fetchCpuHistory = useCallback(async (hours) => {
    setCpuLoading(true);
    try {
      const res = await axios.get(`/api/system/cpu-history?hours=${hours}`);
      setCpuSamples(res.data.samples || []);
    } catch {
      // Chart just keeps its previous data.
    } finally {
      setCpuLoading(false);
    }
  }, []);

  usePolling(fetchOverview, 10000);
  usePolling(() => fetchCpuHistory(cpuRange.hours), 60000);

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
            label="Media storage"
            value={storage ? formatBytes(storage.available, 0) : '—'}
            percent={storage?.percent}
            sub={storage ? `free · ${storage.percent.toFixed(0)}% used of ${formatBytes(storage.size, 0)}` : null}
          />
          <Tile
            label={o.temperature != null ? 'Temperature' : 'Uptime'}
            value={o.temperature != null ? `${o.temperature.toFixed(0)}°C` : formatDuration(o.uptime)}
            percent={o.temperature != null ? Math.min(100, o.temperature) : null}
            sub={o.temperature != null ? `Up ${formatDuration(o.uptime)}` : null}
          />
        </div>
        {root && root.percent > 85 && (
          <div className="inline-alert inline-alert-warn" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            System disk (SD card) is {root.percent.toFixed(0)}% full — {formatBytes(root.available)} left.
          </div>
        )}
      </div>

      {/* Downloads & network */}
      <div className="card">
        <div className="card-header-row">
          <h2>🛡️ Downloads &amp; VPN</h2>
          <button className="link-button" onClick={() => navigate('/downloads')}>Open downloads →</button>
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
          <button className="button" onClick={() => navigate('/downloads?tab=search')}>
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

      {/* CPU history */}
      <div className="card">
        <div className="card-header-row">
          <h2>📈 CPU History</h2>
          {cpuSamples.length > 0 && (
            <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>{cpuSamples.length} samples</span>
          )}
        </div>
        <div className="mobile-tabs mb-2" role="tablist">
          {CPU_RANGES.map((r) => (
            <button
              key={r.label}
              role="tab"
              aria-selected={cpuRange.hours === r.hours}
              className={`mobile-tab ${cpuRange.hours === r.hours ? 'active' : ''}`}
              onClick={() => { setCpuRange(r); fetchCpuHistory(r.hours); }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <CpuChart samples={cpuSamples} hours={cpuRange.hours} loading={cpuLoading} />
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-faint)', flexWrap: 'wrap' }}>
          <span><span style={{ color: '#4caf50' }}>●</span> Normal (&lt;60%)</span>
          <span><span style={{ color: '#ff9800' }}>●</span> High (60–80%)</span>
          <span><span style={{ color: '#f44336' }}>●</span> Critical (&gt;80%)</span>
        </div>
      </div>

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
          {[['Media storage', storage], ['System disk (SD card)', root]].filter(([, d]) => d).map(([label, d]) => (
            <div key={label} className="status-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span className="status-row-title">{label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBytes(d.used)} / {formatBytes(d.size)}
                </span>
              </div>
              <div className="meter" style={{ marginTop: 0 }}>
                <span style={{ width: `${d.percent}%`, background: levelColor(d.percent) }} />
              </div>
              <div className="status-row-sub">{d.mountPoint} · {formatBytes(d.available)} free</div>
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
