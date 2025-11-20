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
              <p><strong>CPU:</strong> {systemInfo.cpu}</p>
              <p><strong>Memory:</strong> {systemInfo.memory}</p>
              <p><strong>Disk:</strong> {systemInfo.disk}</p>
              <p><strong>Uptime:</strong> {systemInfo.uptime}</p>
            </>
          ) : (
            <p>Unable to fetch system info</p>
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
