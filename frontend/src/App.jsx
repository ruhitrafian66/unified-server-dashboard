import { useState, createContext, useContext, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import Media from './pages/Media';
import Settings from './pages/Settings';

import Toast from './components/Toast';
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
  { to: '/downloads', icon: '📥', label: 'Downloads' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

function NavBar() {
  const location = useLocation();
  if (location.pathname === '/settings') return null;

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
            <NavBar />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/downloads" element={<MyDownloads />} />
                <Route path="/media" element={<Media />} />
                <Route path="/settings" element={<Settings />} />
                {/* Legacy redirects — keep old URLs working */}
                <Route path="/shows" element={<Navigate to="/media?tab=tracked" replace />} />
                <Route path="/add-torrent" element={<Navigate to="/downloads" replace />} />
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
