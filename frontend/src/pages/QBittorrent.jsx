import React, { useState, useEffect } from 'react';
import axios from 'axios';

function QBittorrent({ serverUrl }) {
  const [torrents, setTorrents] = useState([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '', url: '' });
  const [newTorrent, setNewTorrent] = useState('');

  const login = async () => {
    try {
      await axios.post('/api/qbittorrent/login', {
        serverUrl: credentials.url,
        username: credentials.username,
        password: credentials.password
      });
      setAuthenticated(true);
      fetchTorrents();
    } catch (error) {
      alert('Login failed: ' + error.message);
    }
  };

  const fetchTorrents = async () => {
    try {
      const response = await axios.post('/api/qbittorrent/torrents', {
        serverUrl: credentials.url
      });
      setTorrents(response.data);
    } catch (error) {
      console.error('Error fetching torrents:', error);
    }
  };

  const addTorrent = async () => {
    try {
      await axios.post('/api/qbittorrent/torrents/add', {
        serverUrl: credentials.url,
        urls: newTorrent
      });
      setNewTorrent('');
      fetchTorrents();
    } catch (error) {
      alert('Error adding torrent: ' + error.message);
    }
  };

  const controlTorrent = async (action, hash) => {
    try {
      await axios.post(`/api/qbittorrent/torrents/${action}`, {
        serverUrl: credentials.url,
        hashes: hash
      });
      fetchTorrents();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  if (!authenticated) {
    return (
      <div className="card">
        <h2>qBittorrent Login</h2>
        <input
          className="input"
          type="text"
          placeholder="Server URL (e.g., http://192.168.1.100:8080)"
          value={credentials.url}
          onChange={(e) => setCredentials({ ...credentials, url: e.target.value })}
        />
        <input
          className="input"
          type="text"
          placeholder="Username"
          value={credentials.username}
          onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={credentials.password}
          onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
        />
        <button className="button" onClick={login}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>qBittorrent</h1>
      
      <div className="card">
        <h2>Add Torrent</h2>
        <input
          className="input"
          type="text"
          placeholder="Magnet link or torrent URL"
          value={newTorrent}
          onChange={(e) => setNewTorrent(e.target.value)}
        />
        <button className="button" onClick={addTorrent}>Add Torrent</button>
      </div>

      <div className="card">
        <h2>Torrents ({torrents.length})</h2>
        {torrents.map((torrent) => (
          <div key={torrent.hash} style={{ 
            padding: '1rem', 
            borderBottom: '1px solid #2a2a3e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '6px',
            marginBottom: '0.5rem'
          }}>
            <div>
              <strong style={{ color: '#e0e0e0' }}>{torrent.name}</strong>
              <p style={{ fontSize: '0.875rem', color: '#b0b0c0' }}>
                {(torrent.size / 1024 / 1024 / 1024).toFixed(2)} GB - 
                {(torrent.progress * 100).toFixed(1)}% - 
                {torrent.state}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="button" onClick={() => controlTorrent('pause', torrent.hash)}>Pause</button>
              <button className="button" onClick={() => controlTorrent('resume', torrent.hash)}>Resume</button>
              <button className="button button-danger" onClick={() => controlTorrent('delete', torrent.hash)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default QBittorrent;
