import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Dashboard({ serverUrl }) {
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 5000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  const fetchSystemInfo = async () => {
    try {
      const response = await axios.get('/api/omv/system');
      setSystemInfo(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching system info:', error);
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      
      <div className="grid">
        <div className="card">
          <h2>System Status</h2>
          {systemInfo ? (
            <>
              <p style={{ marginBottom: '0.5rem', color: '#e0e0e0' }}><strong style={{ color: '#667eea' }}>CPU:</strong> {systemInfo.cpu}</p>
              <p style={{ marginBottom: '0.5rem', color: '#e0e0e0' }}><strong style={{ color: '#667eea' }}>Memory:</strong> {systemInfo.memory}</p>
              <p style={{ marginBottom: '0.5rem', color: '#e0e0e0' }}><strong style={{ color: '#667eea' }}>Disk:</strong> {systemInfo.disk}</p>
              <p style={{ color: '#e0e0e0' }}><strong style={{ color: '#667eea' }}>Uptime:</strong> {systemInfo.uptime}</p>
            </>
          ) : (
            <p style={{ color: '#b0b0c0' }}>Unable to fetch system info</p>
          )}
        </div>

        <div className="card">
          <h2>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className="button">View Torrents</button>
            <button className="button">Manage VPN</button>
            <button className="button">Server Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
