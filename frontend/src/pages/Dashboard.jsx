import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ConfirmModal from '../components/ConfirmModal';

function Dashboard({ serverUrl, setServerUrl }) {
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState(null);
  const [services, setServices] = useState([]);
  const [disks, setDisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(serverUrl);
  const [showConfig, setShowConfig] = useState(false);
  const [servicesCollapsed, setServicesCollapsed] = useState(false);
  const [disksCollapsed, setDisksCollapsed] = useState(false);

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

  const { showToast } = useToast();
  const [confirmPower, setConfirmPower] = useState(null);

  const powerAction = async (action) => {
    setConfirmPower(action);
  };

  const executePowerAction = async () => {
    const action = confirmPower;
    setConfirmPower(null);
    
    try {
      await axios.post(`/api/omv/power/${action}`);
      showToast(`Server ${action} initiated`, 'success');
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('serverUrl', url);
    setServerUrl(url);
    setShowConfig(false);
    showToast('Settings saved!', 'success');
  };

  const parsePercentage = (str) => {
    if (!str) return 0;
    // Handle both "36.4%" and "36.4" formats
    const match = str.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  if (loading) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div className="card">
          <LoadingSkeleton count={4} height="60px" />
        </div>
      </div>
    );
  }

  const cpuPercent = parsePercentage(systemInfo?.cpu);
  const memoryPercent = parsePercentage(systemInfo?.memory);

  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* System Status - Condensed */}
      <div className="card">
        <h2>System Status</h2>
        {systemInfo ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>💻</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#b0b0c0', marginBottom: '0.25rem' }}>CPU</div>
                <div style={{ fontSize: '0.875rem', color: '#e0e0e0', fontWeight: '600' }}>{systemInfo.cpu}</div>
                <div className="progress-bar" style={{ height: '4px', marginTop: '0.25rem' }}>
                  <div className="progress-fill" style={{ width: `${cpuPercent}%` }} />
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🧠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#b0b0c0', marginBottom: '0.25rem' }}>Memory</div>
                <div style={{ fontSize: '0.875rem', color: '#e0e0e0', fontWeight: '600' }}>{systemInfo.memory}</div>
                <div className="progress-bar" style={{ height: '4px', marginTop: '0.25rem' }}>
                  <div className="progress-fill" style={{ width: `${memoryPercent}%` }} />
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>💾</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#b0b0c0', marginBottom: '0.25rem' }}>Disk</div>
                <div style={{ fontSize: '0.875rem', color: '#e0e0e0', fontWeight: '600' }}>{systemInfo.disk}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⏱️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#b0b0c0', marginBottom: '0.25rem' }}>Uptime</div>
                <div style={{ fontSize: '0.875rem', color: '#e0e0e0', fontWeight: '600' }}>{systemInfo.uptime}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Unable to fetch system info</div>
            <p className="empty-state-message">The server may be offline or unreachable</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <button className="button" onClick={() => navigate('/downloads')}>
            📥 View My Downloads
          </button>
          <button className="button" onClick={() => navigate('/add-torrent')}>
            ➕ Add New Torrent
          </button>
          <button className="button" onClick={() => navigate('/vpn')}>
            🔒 Manage VPN
          </button>
          <button className="button" onClick={() => setShowConfig(!showConfig)}>
            ⚙️ Server Configuration
          </button>
        </div>
      </div>

      {/* Server Configuration */}
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

      {/* Power Control */}
      <div className="card">
        <h2>Power Control</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Manage server power state
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="button" onClick={() => powerAction('reboot')}>🔄 Reboot</button>
          <button className="button button-danger" onClick={() => powerAction('shutdown')}>⏻ Shutdown</button>
        </div>
      </div>

      {/* Services - Collapsible */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setServicesCollapsed(!servicesCollapsed)}
        >
          <h2 style={{ margin: 0 }}>Services ({services.length})</h2>
          <span className={`collapsible-icon ${servicesCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        {!servicesCollapsed && (
          <>
            {services.length > 0 ? services.map((service) => (
              <div key={service.service} style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
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
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p className="empty-state-message">No services data available</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Disk Usage - Collapsible */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setDisksCollapsed(!disksCollapsed)}
        >
          <h2 style={{ margin: 0 }}>Disk Usage ({disks.length})</h2>
          <span className={`collapsible-icon ${disksCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        {!disksCollapsed && (
          <>
            {disks.length > 0 ? disks.map((disk) => {
              const usePercent = parseInt(disk.usePercent);
              return (
                <div key={disk.device} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: '#e0e0e0' }}>
                      <strong>💾 {disk.device}</strong> - {disk.mountPoint}
                    </span>
                    <span style={{ color: '#b0b0c0', fontSize: '0.875rem' }}>
                      {disk.used} / {disk.size} ({disk.usePercent})
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: disk.usePercent,
                        background: usePercent > 80 
                          ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)' 
                          : usePercent > 60
                          ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
                          : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                      }} 
                    />
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state">
                <div className="empty-state-icon">💾</div>
                <p className="empty-state-message">No disk data available</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Power Action Confirmation Modal */}
      {confirmPower && (
        <ConfirmModal
          title={`${confirmPower.charAt(0).toUpperCase() + confirmPower.slice(1)} Server`}
          message={`Are you sure you want to ${confirmPower} the server? This action will affect all services.`}
          confirmText={confirmPower.charAt(0).toUpperCase() + confirmPower.slice(1)}
          cancelText="Cancel"
          type="danger"
          onConfirm={executePowerAction}
          onCancel={() => setConfirmPower(null)}
        />
      )}
    </div>
  );
}

export default Dashboard;
