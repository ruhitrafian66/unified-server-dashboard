import { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';

const SettingsContext = createContext();

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

const STORAGE_KEYS = {
  tmdbApiKey: 'dashboard_tmdb_key',
  omdbApiKey: 'dashboard_omdb_key',
  serverUrl: 'dashboard_server_url',
  setupComplete: 'dashboard_setup_complete',
  serviceHost: 'dashboard_service_host',
};

export function SettingsProvider({ children }) {
  const [tmdbApiKey, setTmdbApiKeyState] = useState(() => localStorage.getItem(STORAGE_KEYS.tmdbApiKey) || '');
  const [omdbApiKey, setOmdbApiKeyState] = useState(() => localStorage.getItem(STORAGE_KEYS.omdbApiKey) || '');
  const [serverUrl, setServerUrlState] = useState(() => localStorage.getItem(STORAGE_KEYS.serverUrl) || '');
  const [setupComplete, setSetupCompleteState] = useState(
    () => localStorage.getItem(STORAGE_KEYS.setupComplete) === 'true'
  );
  const [serviceHost, setServiceHostState] = useState(
    () => localStorage.getItem(STORAGE_KEYS.serviceHost) || '192.168.0.30'
  );

  const setTmdbApiKey = useCallback((key) => {
    setTmdbApiKeyState(key);
    localStorage.setItem(STORAGE_KEYS.tmdbApiKey, key);
  }, []);

  const setOmdbApiKey = useCallback((key) => {
    setOmdbApiKeyState(key);
    localStorage.setItem(STORAGE_KEYS.omdbApiKey, key);
  }, []);

  const setServiceHost = useCallback((host) => {
    setServiceHostState(host);
    localStorage.setItem(STORAGE_KEYS.serviceHost, host);
  }, []);

  const setServerUrl = useCallback((url) => {
    setServerUrlState(url);
    localStorage.setItem(STORAGE_KEYS.serverUrl, url);
  }, []);

  const completeSetup = useCallback((url) => {
    setServerUrl(url);
    setSetupCompleteState(true);
    localStorage.setItem(STORAGE_KEYS.setupComplete, 'true');
  }, [setServerUrl]);

  const saveTmdbToBackend = useCallback(async (key) => {
    if (!key) return;
    try {
      await axios.post('/api/shows/config/tmdb', { apiKey: key });
    } catch {
      // Best-effort — not fatal
    }
  }, []);

  return (
    <SettingsContext.Provider value={{
      tmdbApiKey,
      omdbApiKey,
      serverUrl,
      serviceHost,
      setupComplete,
      setTmdbApiKey,
      setOmdbApiKey,
      setServerUrl,
      setServiceHost,
      completeSetup,
      saveTmdbToBackend,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
