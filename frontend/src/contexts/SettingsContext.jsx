import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const SettingsContext = createContext();

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

const OMDB_KEY = 'dashboard_omdb_key';

const readLocal = (key) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
};

/**
 * TMDB is configured once on the server (all TMDB calls go through /api/tmdb),
 * so every device works without entering a key. Only the optional OMDb key is
 * kept per device.
 */
export function SettingsProvider({ children }) {
  const [omdbApiKey, setOmdbApiKeyState] = useState(() => readLocal(OMDB_KEY));
  const [tmdbConfigured, setTmdbConfigured] = useState(null); // null = unknown yet

  const refreshTmdbStatus = useCallback(async () => {
    try {
      const res = await axios.get('/api/shows/config/tmdb');
      setTmdbConfigured(Boolean(res.data.configured));
    } catch {
      setTmdbConfigured(null);
    }
  }, []);

  useEffect(() => { refreshTmdbStatus(); }, [refreshTmdbStatus]);

  const setOmdbApiKey = useCallback((key) => {
    setOmdbApiKeyState(key);
    writeLocal(OMDB_KEY, key);
  }, []);

  const saveTmdbKey = useCallback(async (key) => {
    await axios.post('/api/shows/config/tmdb', { apiKey: key });
    setTmdbConfigured(true);
  }, []);

  return (
    <SettingsContext.Provider value={{
      omdbApiKey,
      setOmdbApiKey,
      tmdbConfigured,
      refreshTmdbStatus,
      saveTmdbKey,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
