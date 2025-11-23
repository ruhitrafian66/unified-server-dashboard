import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import AddTorrent from './pages/AddTorrent';
import WireGuard from './pages/WireGuard';
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

  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      <BrowserRouter>
        <div className="app">
          <nav className="navbar">
            <h1>Server Dashboard</h1>
            <div className="nav-links">
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                Dashboard
              </NavLink>
              <NavLink to="/downloads" className={({ isActive }) => isActive ? 'active' : ''}>
                My Downloads
              </NavLink>
              <NavLink to="/add-torrent" className={({ isActive }) => isActive ? 'active' : ''}>
                Add Torrent
              </NavLink>
              <NavLink to="/vpn" className={({ isActive }) => isActive ? 'active' : ''}>
                VPN
              </NavLink>
            </div>
          </nav>
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard serverUrl={serverUrl} setServerUrl={setServerUrl} />} />
              <Route path="/downloads" element={<MyDownloads />} />
              <Route path="/add-torrent" element={<AddTorrent />} />
              <Route path="/vpn" element={<WireGuard serverUrl={serverUrl} />} />
            </Routes>
          </main>

          {/* Toast notifications */}
          <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 10000 }}>
            {toasts.map((toast, index) => (
              <div key={toast.id} style={{ marginBottom: index > 0 ? '10px' : 0 }}>
                <Toast
                  message={toast.message}
                  type={toast.type}
                  duration={toast.duration}
                  onClose={() => removeToast(toast.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </BrowserRouter>
    </ToastContext.Provider>
  );
}

export default App;
