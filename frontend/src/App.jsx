import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import QBittorrent from './pages/QBittorrent';
import WireGuard from './pages/WireGuard';
import OMV from './pages/OMV';
import Settings from './pages/Settings';
import './App.css';

function App() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('serverUrl') || '');

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <h1>Server Dashboard</h1>
          <div className="nav-links">
            <Link to="/">Dashboard</Link>
            <Link to="/qbittorrent">qBittorrent</Link>
            <Link to="/wireguard">WireGuard</Link>
            <Link to="/omv">OMV</Link>
            <Link to="/settings">Settings</Link>
          </div>
        </nav>
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard serverUrl={serverUrl} />} />
            <Route path="/qbittorrent" element={<QBittorrent serverUrl={serverUrl} />} />
            <Route path="/wireguard" element={<WireGuard serverUrl={serverUrl} />} />
            <Route path="/omv" element={<OMV serverUrl={serverUrl} />} />
            <Route path="/settings" element={<Settings serverUrl={serverUrl} setServerUrl={setServerUrl} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
