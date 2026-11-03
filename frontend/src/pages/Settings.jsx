import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../App';

function SectionHeader({ title }) {
  return (
    <h3 style={{
      color: '#b0b0c0',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      padding: '1rem 1rem 0.5rem',
    }}>
      {title}
    </h3>
  );
}

function SettingsCard({ children }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    tmdbApiKey, omdbApiKey, serverUrl, serviceHost,
    setTmdbApiKey, setOmdbApiKey, setServerUrl, setServiceHost,
    saveTmdbToBackend,
  } = useSettings();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [serviceHostInput, setServiceHostInput] = useState(serviceHost);
  const [tmdbInput, setTmdbInput] = useState(tmdbApiKey);
  const [omdbInput, setOmdbInput] = useState(omdbApiKey);
  const [tmdbVisible, setTmdbVisible] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingTmdb, setIsSavingTmdb] = useState(false);

  // Auto-stop
  const [autoStopEnabled, setAutoStopEnabled] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [ratioLimit, setRatioLimit] = useState('1.00');
  const [isSavingAutoStop, setIsSavingAutoStop] = useState(false);

  // Auto-check
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [isSavingAutoCheck, setIsSavingAutoCheck] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [stopRes, checkRes] = await Promise.all([
          axios.get('/api/qbittorrent/auto-stop/config'),
          axios.get('/api/shows/config/auto-check'),
        ]);
        const cfg = stopRes.data;
        setAutoStopEnabled(!!cfg.enabled);
        setDelayMinutes(String(cfg.delayMinutes ?? 0));
        setRatioLimit(cfg.ratioLimit != null ? String(cfg.ratioLimit) : '1.00');
        setAutoCheckEnabled(!!checkRes.data.enabled);
      } catch {
        // Non-fatal
      }
    };
    load();
  }, []);

  const testAndSaveServer = async () => {
    const url = urlInput.trim().replace(/\/$/, '');
    if (!url) { showToast('Enter a server URL', 'error'); return; }
    setIsTesting(true);
    try {
      await axios.get(`${url}/api/health`, { timeout: 6000 });
      setServerUrl(url);
      showToast('Server saved and connected ✓', 'success');
    } catch (e) {
      showToast('Could not reach server: ' + (e.message || 'timeout'), 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const saveServiceHost = () => {
    const host = serviceHostInput.trim();
    if (!host) { showToast('Enter a host or IP', 'error'); return; }
    setServiceHost(host);
    showToast('Service host saved ✓', 'success');
  };

  const saveTmdb = async () => {
    const key = tmdbInput.trim();
    if (!key) { showToast('Enter a TMDB key', 'error'); return; }
    setIsSavingTmdb(true);
    try {
      setTmdbApiKey(key);
      await saveTmdbToBackend(key);
      showToast('TMDB key saved ✓', 'success');
    } catch {
      showToast('Saved locally but could not sync to server', 'warning');
    } finally {
      setIsSavingTmdb(false);
    }
  };

  const saveOmdb = () => {
    setOmdbApiKey(omdbInput.trim());
    showToast('OMDb key saved ✓', 'success');
  };

  const saveAutoStop = async () => {
    setIsSavingAutoStop(true);
    try {
      await axios.post('/api/qbittorrent/auto-stop/config', {
        enabled: autoStopEnabled,
        delayMinutes: parseInt(delayMinutes) || 0,
        ratioLimit: ratioLimit ? parseFloat(ratioLimit) : null,
      });
      showToast('Auto-stop config saved ✓', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setIsSavingAutoStop(false);
    }
  };

  const saveAutoCheck = async () => {
    setIsSavingAutoCheck(true);
    try {
      await axios.post('/api/shows/config/auto-check', { enabled: autoCheckEnabled });
      showToast('Auto-check saved ✓', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setIsSavingAutoCheck(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1rem 0' }}>
        <button className="button button-secondary" style={{ minWidth: 0, padding: '0.5rem 0.75rem' }}
          onClick={() => navigate(-1)}>← Back</button>
        <h2 style={{ fontSize: '1.1rem' }}>⚙️ Settings</h2>
      </div>

      {/* Server */}
      <SectionHeader title="Server" />
      <SettingsCard>
        <div className="settings-field">
          <label className="settings-label">Server URL</label>
          <input
            className="input"
            placeholder="http://192.168.0.30:3001"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
          />
          <button
            className="button"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={testAndSaveServer}
            disabled={isTesting || !urlInput.trim()}
          >
            {isTesting ? 'Testing connection…' : 'Test and save server'}
          </button>
          {serverUrl && (
            <p style={{ color: '#4caf50', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              ✓ Connected to {serverUrl}
            </p>
          )}
        </div>
      </SettingsCard>

      {/* Service Host */}
      <SectionHeader title="External Services Host" />
      <SettingsCard>
        <p style={{ color: '#b0b0c0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          LAN IP or hostname where Prowlarr, Sonarr, Radarr and qBittorrent run.
        </p>
        <div className="settings-field">
          <label className="settings-label">Host / IP</label>
          <input
            className="input"
            placeholder="192.168.0.30"
            value={serviceHostInput}
            onChange={e => setServiceHostInput(e.target.value)}
          />
          <button
            className="button button-secondary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={saveServiceHost}
          >
            Save Host
          </button>
        </div>
      </SettingsCard>

      {/* TMDB */}
      <SectionHeader title="TMDB Integration" />
      <SettingsCard>
        <p style={{ color: '#b0b0c0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Required for Movies, TV discovery, and tracked shows. Saved to device and server.
        </p>
        <div className="settings-field">
          <label className="settings-label">TMDB API Key</label>
          <div className="input-with-toggle">
            <input
              className="input"
              placeholder="Your TMDB v3 API key"
              type={tmdbVisible ? 'text' : 'password'}
              value={tmdbInput}
              onChange={e => setTmdbInput(e.target.value)}
            />
            <button className="toggle-visibility" onClick={() => setTmdbVisible(v => !v)}>
              {tmdbVisible ? '🙈' : '👁️'}
            </button>
          </div>
          <button
            className="button"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={saveTmdb}
            disabled={isSavingTmdb}
          >
            {isSavingTmdb ? 'Saving…' : 'Save TMDB Key'}
          </button>
        </div>
      </SettingsCard>

      {/* OMDb */}
      <SectionHeader title="Optional IMDb Ratings (OMDb)" />
      <SettingsCard>
        <p style={{ color: '#b0b0c0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Enables IMDb ratings in media detail. Get a free key at omdbapi.com.
        </p>
        <div className="settings-field">
          <label className="settings-label">OMDb API Key (optional)</label>
          <input
            className="input"
            placeholder="Your OMDb API key"
            type="password"
            value={omdbInput}
            onChange={e => setOmdbInput(e.target.value)}
          />
          <button
            className="button button-secondary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={saveOmdb}
          >
            Save OMDb Key
          </button>
        </div>
      </SettingsCard>

      {/* Auto-Stop Seeding */}
      <SectionHeader title="Auto-Stop Seeding" />
      <SettingsCard>
        <div className="settings-toggle-row">
          <div>
            <div className="settings-toggle-label">Enable Auto-Stop</div>
            <div className="settings-toggle-desc">Automatically stop seeding based on limits</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={autoStopEnabled} onChange={e => setAutoStopEnabled(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        {autoStopEnabled && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="settings-field">
              <label className="settings-label">Stop delay after completion (minutes, 0 = immediate)</label>
              <input
                className="input"
                type="number"
                min="0"
                value={delayMinutes}
                onChange={e => setDelayMinutes(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Ratio limit</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="0"
                value={ratioLimit}
                onChange={e => setRatioLimit(e.target.value)}
              />
            </div>
          </div>
        )}
        <button
          className="button"
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={saveAutoStop}
          disabled={isSavingAutoStop}
        >
          {isSavingAutoStop ? 'Saving…' : 'Save Auto-Stop Config'}
        </button>
      </SettingsCard>

      {/* Auto-Check Episodes */}
      <SectionHeader title="TV Show Auto-Check" />
      <SettingsCard>
        <div className="settings-toggle-row">
          <div>
            <div className="settings-toggle-label">Auto-check Episodes</div>
            <div className="settings-toggle-desc">Automatically search for new episodes on a schedule</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={autoCheckEnabled} onChange={e => setAutoCheckEnabled(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <button
          className="button"
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={saveAutoCheck}
          disabled={isSavingAutoCheck}
        >
          {isSavingAutoCheck ? 'Saving…' : 'Save Auto-Check'}
        </button>
      </SettingsCard>

      {/* About */}
      <SectionHeader title="About" />
      <SettingsCard>
        <div className="settings-info-row">
          <span>Dashboard</span>
          <span style={{ color: '#b0b0c0' }}>Unified Server Dashboard</span>
        </div>
        <div className="settings-info-row">
          <span>Connection</span>
          <span style={{ color: serverUrl ? '#4caf50' : '#f44336' }}>
            {serverUrl || 'Not configured'}
          </span>
        </div>
      </SettingsCard>

      <div style={{ height: '2rem' }} />
    </div>
  );
}
