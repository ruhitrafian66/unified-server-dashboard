import React, { useState } from 'react';

function Settings({ serverUrl, setServerUrl }) {
  const [url, setUrl] = useState(serverUrl);

  const saveSettings = () => {
    localStorage.setItem('serverUrl', url);
    setServerUrl(url);
    alert('Settings saved!');
  };

  return (
    <div>
      <h1>Settings</h1>
      
      <div className="card">
        <h2>Server Configuration</h2>
        <label>
          <strong>Backend Server URL</strong>
          <input
            className="input"
            type="text"
            placeholder="http://192.168.1.100:3001"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button className="button" onClick={saveSettings}>Save Settings</button>
      </div>

      <div className="card">
        <h2>About</h2>
        <p><strong>Version:</strong> 1.0.0</p>
        <p><strong>Features:</strong></p>
        <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
          <li>qBittorrent torrent management</li>
          <li>WireGuard VPN configuration</li>
          <li>OpenMediaVault server monitoring</li>
          <li>Progressive Web App support</li>
        </ul>
      </div>
    </div>
  );
}

export default Settings;
