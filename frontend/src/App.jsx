import { useState, createContext, useContext, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Storage from './pages/Storage';
import Media from './pages/Media';
import Settings from './pages/Settings';

import Toast from './components/Toast';
import DownloadsBar from './components/DownloadsBar';
import { SettingsProvider } from './contexts/SettingsContext';
import './App.css';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'Home', end: true },
  { to: '/media', icon: '🎬', label: 'Media' },
  { to: '/storage', icon: '💾', label: 'Storage' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

/** Old /downloads links: search → Media › Torrents, list → Storage. */
function LegacyDownloads() {
  const [params] = useSearchParams();
  const q = params.get('q');
  if (q) return <Navigate to={`/media?tab=torrents&q=${encodeURIComponent(q)}`} replace />;
  if (params.get('tab') === 'search') return <Navigate to="/media?tab=torrents" replace />;
  return <Navigate to="/storage" replace />;
}

function AppHeader() {
  const location = useLocation();
  return (
    <header className="app-header">
      {location.pathname !== '/settings' && <NavBar />}
      <DownloadsBar />
    </header>
  );
}

function NavBar() {
  return (
    <nav className="navbar" aria-label="Main">
      <h1>Server Dashboard</h1>
      <div className="nav-links">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span aria-hidden="true">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function App() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++nextId.current;
    // Keep at most 3 toasts on screen.
    setToasts((prev) => [...prev.slice(-2), { id, message, type, duration }]);
  }, []);

  const toastApi = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={toastApi}>
      <SettingsProvider>
        <BrowserRouter>
          <div className="app">
            <AppHeader />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/downloads" element={<LegacyDownloads />} />
                <Route path="/media" element={<Media />} />
                <Route path="/settings" element={<Settings />} />
                {/* Legacy redirects — keep old URLs working */}
                <Route path="/shows" element={<Navigate to="/media?tab=tracked" replace />} />
                <Route path="/add-torrent" element={<Navigate to="/media?tab=torrents" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <div className="toast-container" role="status" aria-live="polite">
              {toasts.map((toast) => (
                <Toast key={toast.id} id={toast.id} message={toast.message} type={toast.type}
                  duration={toast.duration} onClose={removeToast} />
              ))}
            </div>
          </div>
        </BrowserRouter>
      </SettingsProvider>
    </ToastContext.Provider>
  );
}

export default App;
