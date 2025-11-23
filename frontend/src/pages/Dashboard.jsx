import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Dashboard({ serverUrl, setServerUrl }) {
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState(null);
  const [services, setServices] = useState([]);
  const [disks, setDisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(serverUrl);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [systemRes, servicesRes, disksRes] = await Promise.all([
        axios.get('/api/omv/system'),
        axios.get('/api/omv/services'),
        axios.get('/api/omv/disks')
      ]);
      setSystemInfo(systemRes.data);
      setServices(servicesRes.data.services);
      setDisks(disksRes.data.disks);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const powerAction = async (action) => {
    if (!confirm(`Are you sure you want to ${action} the server?`)) return;
    
    try {
      await axios.post(`/api/omv/power/${action}`);
      alert(`Server ${action} initiated`);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('serverUrl', url);
    setServerUrl(url);
    setShowConfig(false);
    alert('Settings saved!');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      
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
          <button className="button" onClick={() => navigate('/downloads')}>📥 View My Downloads</button>
          <button className="button" onClick={() => navigate('/add-torrent')}>➕ Add New Torrent</button>
          <button className="button" onClick={() => navigate('/vpn')}>🔒 Manage VPN</button>
          <button className="button" onClick={() => setShowConfig(!showConfig)}>⚙️ Server Configuration</button>
        </div>
      </div>

      {showConfig && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>Server Configuration</h2>
          <label>
            <strong style={{ color: '#667eea', display: 'block', marginBottom: '0.5rem' }}>Backend Server URL</strong>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Leave empty to use the current server
            </p>
            <input
              className="input"
              type="text"
              placeholder="http://192.168.1.100:3001"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="button" onClick={saveSettings}>✓ Save Settings</button>
            <button className="button" onClick={() => setShowConfig(false)} style={{ background: '#6a6a7e' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Power Control</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="button" onClick={() => powerAction('reboot')}>🔄 Reboot</button>
          <button className="button button-danger" onClick={() => powerAction('shutdown')}>⏻ Shutdown</button>
        </div>
      </div>

      <div className="card">
        <h2>Services</h2>
        {services.length > 0 ? services.map((service) => (
          <div key={service.service} style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '0.75rem',
            borderBottom: '1px solid #2a2a3e',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '6px',
            marginBottom: '0.5rem'
          }}>
            <span style={{ color: '#e0e0e0' }}>{service.service}</span>
            <span className={`status-badge ${service.status === 'active' ? 'status-active' : 'status-inactive'}`}>
              {service.status}
            </span>
          </div>
        )) : (
          <p style={{ color: '#b0b0c0' }}>No services data available</p>
        )}
      </div>

      <div className="card">
        <h2>Disk Usage</h2>
        {disks.length > 0 ? disks.map((disk) => (
          <div key={disk.device} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#e0e0e0' }}><strong>{disk.device}</strong> - {disk.mountPoint}</span>
              <span style={{ color: '#b0b0c0' }}>{disk.used} / {disk.size} ({disk.usePercent})</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '8px', 
              background: '#2a2a3e', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: disk.usePercent, 
                height: '100%', 
                background: parseInt(disk.usePercent) > 80 ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)' : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        )) : (
          <p style={{ color: '#b0b0c0' }}>No disk data available</p>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
