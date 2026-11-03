import React, { useState, createContext, useContext } from 'react';
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

function NavBar() {
  const location = useLocation();
  if (location.pathname === '/settings') return null;

  return (
    <nav className="navbar">
      <h1>📱 Server Dashboard</h1>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          <span>🏠</span>
          <span className="nav-text">Home</span>
        </NavLink>
        <NavLink to="/media" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>🎬</span>
          <span className="nav-text">Media</span>
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>📥</span>
          <span className="nav-text">Downloads</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>⚙️</span>
          <span className="nav-text">Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}

function App() {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
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
              </Routes>
            </main>
            <div className="toast-container">
              {toasts.map(toast => (
                <Toast key={toast.id} message={toast.message} type={toast.type}
                  duration={toast.duration} onClose={() => removeToast(toast.id)} />
              ))}
            </div>
          </div>
        </BrowserRouter>
      </SettingsProvider>
    </ToastContext.Provider>
  );
}

export default App;
