import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import AddTorrent from './pages/AddTorrent';
import WireGuard from './pages/WireGuard';
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
            <Link to="/downloads">My Downloads</Link>
            <Link to="/add-torrent">Add Torrent</Link>
            <Link to="/vpn">VPN</Link>
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
      </div>
    </BrowserRouter>
  );
}

export default App;
