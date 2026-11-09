import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../App';
import Toggle from '../components/Toggle';
import { apiError } from '../lib/format';

function SectionHeader({ title }) {
  return (
    <h3 style={{
      color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.08em', padding: '1rem 1rem 0.5rem',
    }}>
      {title}
    </h3>
  );
}

function SettingsCard({ children }) {
  return <div className="card" style={{ marginBottom: 0 }}>{children}</div>;
}

function ToggleRow({ title, description, checked, onChange, disabled }) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{title}</div>
        <div className="settings-toggle-desc">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { omdbApiKey, setOmdbApiKey, tmdbConfigured, saveTmdbKey } = useSettings();

  const [tmdbInput, setTmdbInput] = useState('');
  const [tmdbVisible, setTmdbVisible] = useState(false);
  const [isSavingTmdb, setIsSavingTmdb] = useState(false);
  const [omdbInput, setOmdbInput] = useState(omdbApiKey);

  // Seeding limits (stored in qBittorrent itself)
  const [limitsLoaded, setLimitsLoaded] = useState(false);
  const [limitsError, setLimitsError] = useState(null);
  const [autoStopEnabled, setAutoStopEnabled] = useState(false);
  const [seedMinutes, setSeedMinutes] = useState('');
  const [ratioLimit, setRatioLimit] = useState('');
  const [isSavingAutoStop, setIsSavingAutoStop] = useState(false);

  // Auto-check
  const [autoCheck, setAutoCheck] = useState(null);
  const [isSavingAutoCheck, setIsSavingAutoCheck] = useState(false);

  const [health, setHealth] = useState(null);

  useEffect(() => {
    axios.get('/api/qbittorrent/auto-stop/config')
      .then((res) => {
        const cfg = res.data;
        setAutoStopEnabled(Boolean(cfg.enabled));
        setSeedMinutes(cfg.seedTimeLimit != null ? String(cfg.seedTimeLimit) : '');
        setRatioLimit(cfg.ratioLimit != null ? String(cfg.ratioLimit) : '');
        setLimitsLoaded(true);
      })
      .catch((err) => setLimitsError(apiError(err)));
    axios.get('/api/shows/config/auto-check').then((res) => setAutoCheck(res.data)).catch(() => {});
    axios.get('/api/health').then((res) => setHealth(res.data)).catch(() => {});
  }, []);

  const saveTmdb = async () => {
    const key = tmdbInput.trim();
    if (!key) { showToast('Enter a TMDB key', 'error'); return; }
    setIsSavingTmdb(true);
    try {
      await saveTmdbKey(key);
      setTmdbInput('');
      showToast('TMDB key verified and saved on the server', 'success');
    } catch (err) {
      showToast(apiError(err), 'error');
    } finally {
      setIsSavingTmdb(false);
    }
  };

  const saveOmdb = () => {
    setOmdbApiKey(omdbInput.trim());
    showToast('OMDb key saved on this device', 'success');
  };

  const saveAutoStop = async () => {
    setIsSavingAutoStop(true);
    try {
      const res = await axios.post('/api/qbittorrent/auto-stop/config', {
        enabled: autoStopEnabled,
        seedTimeLimit: seedMinutes === '' ? null : parseInt(seedMinutes, 10),
        ratioLimit: ratioLimit === '' ? null : parseFloat(ratioLimit),
      });
      const cfg = res.data.config;
      setAutoStopEnabled(Boolean(cfg.enabled));
      setSeedMinutes(cfg.seedTimeLimit != null ? String(cfg.seedTimeLimit) : '');
      setRatioLimit(cfg.ratioLimit != null ? String(cfg.ratioLimit) : '');
      showToast(res.data.message, 'success');
    } catch (err) {
      showToast('Failed to save: ' + apiError(err), 'error');
    } finally {
      setIsSavingAutoStop(false);
    }
  };

  const toggleAutoCheck = async (enabled) => {
    setIsSavingAutoCheck(true);
    try {
      await axios.post('/api/shows/config/auto-check', { enabled });
      setAutoCheck((prev) => ({ ...(prev || {}), enabled }));
      showToast(enabled ? 'Automatic episode checks on' : 'Automatic episode checks off', 'success');
    } catch (err) {
      showToast('Failed to save: ' + apiError(err), 'error');
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

      {/* TV automation */}
      <SectionHeader title="TV Show Automation" />
      <SettingsCard>
        <ToggleRow
          title="Check for new episodes automatically"
          description={autoCheck
            ? `Searches at each episode's air time, retries every ${autoCheck.sweepIntervalHours ?? 6}h for up to ${autoCheck.retryWindowDays ?? 7} days.`
            : 'Loading…'}
          checked={Boolean(autoCheck?.enabled)}
          onChange={toggleAutoCheck}
          disabled={!autoCheck || isSavingAutoCheck}
        />
        {autoCheck?.lastSweep && (
          <p className="hint" style={{ marginTop: '0.75rem' }}>
            Last run {new Date(autoCheck.lastSweep.at).toLocaleString()} · {autoCheck.lastSweep.downloads?.length || 0} downloaded
          </p>
        )}
      </SettingsCard>

      {/* Seeding limits */}
      <SectionHeader title="Seeding Limits" />
      <SettingsCard>
        <p className="hint" style={{ marginBottom: '0.75rem' }}>
          Saved directly in qBittorrent, so limits apply even when this dashboard is closed.
        </p>
        {limitsError && <div className="inline-alert inline-alert-bad">Couldn&apos;t load limits: {limitsError}</div>}
        <ToggleRow
          title="Stop seeding automatically"
          description="Stops a torrent once it reaches either limit below."
          checked={autoStopEnabled}
          onChange={setAutoStopEnabled}
          disabled={!limitsLoaded}
        />
        {autoStopEnabled && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="settings-field">
              <label className="settings-label" htmlFor="seed-minutes">Seed for (minutes)</label>
              <input id="seed-minutes" className="input" type="number" inputMode="numeric" min="0" placeholder="0 = stop at once"
                value={seedMinutes} onChange={(e) => setSeedMinutes(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="ratio-limit">Or until ratio</label>
              <input id="ratio-limit" className="input" type="number" inputMode="decimal" step="0.1" min="0" placeholder="e.g. 1.0"
                value={ratioLimit} onChange={(e) => setRatioLimit(e.target.value)} />
            </div>
          </div>
        )}
        <button className="button" style={{ width: '100%', marginTop: '1rem' }}
          onClick={saveAutoStop} disabled={isSavingAutoStop || !limitsLoaded}>
          {isSavingAutoStop ? 'Saving…' : 'Save seeding limits'}
        </button>
      </SettingsCard>

      {/* TMDB */}
      <SectionHeader title="TMDB (movie & TV data)" />
      <SettingsCard>
        <p className="hint" style={{ marginBottom: '0.75rem' }}>
          {tmdbConfigured === true && <span style={{ color: 'var(--success)' }}>✓ Configured on the server — works on every device. </span>}
          {tmdbConfigured === false && <span style={{ color: 'var(--warning)' }}>Not configured — Media and TV tracking need it. </span>}
          Enter a new key to replace it. Get one free at themoviedb.org → Settings → API.
        </p>
        <div className="settings-field">
          <label className="settings-label" htmlFor="tmdb-key">TMDB API key (v3)</label>
          <div className="input-with-toggle">
            <input id="tmdb-key" className="input" placeholder={tmdbConfigured ? '•••••••• (saved)' : 'Your TMDB v3 API key'}
              type={tmdbVisible ? 'text' : 'password'} autoComplete="off"
              value={tmdbInput} onChange={(e) => setTmdbInput(e.target.value)} />
            <button className="toggle-visibility" aria-label={tmdbVisible ? 'Hide key' : 'Show key'}
              onClick={() => setTmdbVisible((v) => !v)}>
              {tmdbVisible ? '🙈' : '👁️'}
            </button>
          </div>
          <button className="button" style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={saveTmdb} disabled={isSavingTmdb || !tmdbInput.trim()}>
            {isSavingTmdb ? 'Verifying…' : 'Verify and save'}
          </button>
        </div>
      </SettingsCard>

      {/* OMDb */}
      <SectionHeader title="IMDb Ratings (optional)" />
      <SettingsCard>
        <p className="hint" style={{ marginBottom: '0.75rem' }}>
          Shows IMDb ratings in media details. Free key at omdbapi.com. Stored on this device only.
        </p>
        <div className="settings-field">
          <label className="settings-label" htmlFor="omdb-key">OMDb API key</label>
          <input id="omdb-key" className="input" placeholder="Your OMDb API key" type="password" autoComplete="off"
            value={omdbInput} onChange={(e) => setOmdbInput(e.target.value)} />
          <button className="button button-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={saveOmdb}>
            Save OMDb key
          </button>
        </div>
      </SettingsCard>

      {/* About */}
      <SectionHeader title="About" />
      <SettingsCard>
        <div className="settings-info-row">
          <span>Server</span>
          <span style={{ color: health ? 'var(--success)' : 'var(--danger)' }}>
            {health ? `Online · ${window.location.host}` : 'Unreachable'}
          </span>
        </div>
        <div className="settings-info-row">
          <span>Build</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
            {health?.commit || '—'}
          </span>
        </div>
        <div className="settings-info-row">
          <span>Node</span>
          <span style={{ color: 'var(--text-muted)' }}>{health?.nodeVersion || '—'}</span>
        </div>
      </SettingsCard>

      <div style={{ height: '2rem' }} />
    </div>
  );
}
