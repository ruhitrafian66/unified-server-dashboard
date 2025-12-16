import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import AddTorrent from './pages/AddTorrent';
import WireGuard from './pages/WireGuard';
import TVShows from './pages/TVShows';
import Toast from './components/Toast';
import './App.css';

// Toast context for global toast notifications
const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

function App() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('serverUrl') || '');
  const [toasts, setToasts] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Handle window resize for mobile detection
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, isMobile }}>
      <BrowserRouter>
        <div className="app">
          <nav className="navbar">
            <h1>📱 Server Dashboard</h1>
            <div className="nav-links">
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                {isMobile ? '🏠' : '🏠 Dashboard'}
              </NavLink>
              <NavLink to="/shows" className={({ isActive }) => isActive ? 'active' : ''}>
                {isMobile ? '📺' : '📺 TV Shows'}
              </NavLink>
              <NavLink to="/downloads" className={({ isActive }) => isActive ? 'active' : ''}>
                {isMobile ? '📥' : '📥 Downloads'}
              </NavLink>
              <NavLink to="/add-torrent" className={({ isActive }) => isActive ? 'active' : ''}>
                {isMobile ? '➕' : '➕ Add Torrent'}
              </NavLink>
              <NavLink to="/vpn" className={({ isActive }) => isActive ? 'active' : ''}>
                {isMobile ? '🔒' : '🔒 VPN'}
              </NavLink>
            </div>
          </nav>
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard serverUrl={serverUrl} setServerUrl={setServerUrl} />} />
              <Route path="/downloads" element={<MyDownloads />} />
              <Route path="/add-torrent" element={<AddTorrent />} />
              <Route path="/shows" element={<TVShows />} />
              <Route path="/vpn" element={<WireGuard serverUrl={serverUrl} />} />
            </Routes>
          </main>

          {/* Toast notifications - mobile optimized */}
          <div style={{ 
            position: 'fixed', 
            top: isMobile ? '80px' : '20px', 
            right: isMobile ? '10px' : '20px',
            left: isMobile ? '10px' : 'auto',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: isMobile ? 'none' : '500px'
          }}>
            {toasts.map((toast) => (
              <Toast
                key={toast.id}
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={() => removeToast(toast.id)}
              />
            ))}
          </div>
        </div>
      </BrowserRouter>
    </ToastContext.Provider>
  );
}

export default App;
