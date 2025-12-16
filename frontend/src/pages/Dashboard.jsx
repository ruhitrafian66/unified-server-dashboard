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
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(serverUrl);
  const [showConfig, setShowConfig] = useState(false);
  const [servicesCollapsed, setServicesCollapsed] = useState(true);
  const [disksCollapsed, setDisksCollapsed] = useState(true);
  const [containersCollapsed, setContainersCollapsed] = useState(true);
  const [confirmPower, setConfirmPower] = useState(null);

  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [systemRes, servicesRes, disksRes, containersRes] = await Promise.all([
        axios.get('/api/omv/system'),
        axios.get('/api/omv/services'),
        axios.get('/api/omv/disks'),
        axios.get('/api/docker/containers')
      ]);
      setSystemInfo(systemRes.data);
      setServices(servicesRes.data.services || []);
      setDisks(disksRes.data.disks || []);
      setContainers(containersRes.data.containers || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

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
    const match = str.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card">
          <h2>🏠 Dashboard</h2>
          <LoadingSkeleton count={4} height="60px" />
        </div>
      </div>
    );
  }

  const cpuPercent = parsePercentage(systemInfo?.cpu);
  const memoryPercent = parsePercentage(systemInfo?.memory);

  return (
    <div className="fade-in">
      {/* System Status */}
      <div className="card">
        <h2>📊 System Status</h2>
        {systemInfo ? (
          <div className="mobile-grid">
            {/* CPU Card */}
            <div className="stat-card">
              <div className="stat-icon">💻</div>
              <div className="stat-content">
                <div className="stat-label">CPU Usage</div>
                <div className="stat-value">{systemInfo.cpu}</div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${cpuPercent}%`,
                      background: cpuPercent > 80 
                        ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)' 
                        : cpuPercent > 60
                        ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
                        : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                    }} 
                  />
                </div>
              </div>
            </div>
            
            {/* Memory Card */}
            <div className="stat-card">
              <div className="stat-icon">🧠</div>
              <div className="stat-content">
                <div className="stat-label">Memory Usage</div>
                <div className="stat-value">{systemInfo.memory}</div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${memoryPercent}%`,
                      background: memoryPercent > 80 
                        ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)' 
                        : memoryPercent > 60
                        ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
                        : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                    }} 
                  />
                </div>
              </div>
            </div>
            
            {/* Disk & Uptime */}
            <div className="mobile-grid-2">
              <div className="mobile-card text-center">
                <div className="stat-icon" style={{ margin: '0 auto 0.5rem' }}>💾</div>
                <div className="stat-label">Disk Usage</div>
                <div className="stat-value text-small">{systemInfo.disk}</div>
              </div>
              
              <div className="mobile-card text-center">
                <div className="stat-icon" style={{ margin: '0 auto 0.5rem' }}>⏱️</div>
                <div className="stat-label">Uptime</div>
                <div className="stat-value text-small">{systemInfo.uptime}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">System Offline</div>
            <p className="empty-state-message">Unable to fetch system information</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2>⚡ Quick Actions</h2>
        <div className="mobile-grid-2">
          <button className="button" onClick={() => navigate('/downloads')}>
            <span>📥</span>
            <span>Downloads</span>
          </button>
          <button className="button" onClick={() => navigate('/add-torrent')}>
            <span>➕</span>
            <span>Add Torrent</span>
          </button>
          <button className="button" onClick={() => navigate('/shows')}>
            <span>📺</span>
            <span>TV Shows</span>
          </button>
          <button className="button" onClick={() => navigate('/vpn')}>
            <span>🔒</span>
            <span>VPN</span>
          </button>
        </div>
        <div className="mobile-grid mt-1">
          <button 
            className="button button-secondary" 
            onClick={() => setShowConfig(!showConfig)}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* External Services */}
      <div className="card">
        <h2>🔗 External Services</h2>
        <div className="mobile-grid-2">
          <a 
            href="http://192.168.0.30:9696" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="button"
            style={{ textDecoration: 'none' }}
          >
            <span>🔍</span>
            <span>Prowlarr</span>
          </a>
          <a 
            href="http://192.168.0.30:8989" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="button"
            style={{ textDecoration: 'none' }}
          >
            <span>📺</span>
            <span>Sonarr</span>
          </a>
          <a 
            href="http://192.168.0.30:7878" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="button"
            style={{ textDecoration: 'none' }}
          >
            <span>🎬</span>
            <span>Radarr</span>
          </a>
          <a 
            href="http://192.168.0.30:8080" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="button"
            style={{ textDecoration: 'none' }}
          >
            <span>⬇️</span>
            <span>qBittorrent</span>
          </a>
        </div>
      </div>

      {/* Docker Containers */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setContainersCollapsed(!containersCollapsed)}
        >
          <h2>🐳 Docker Containers ({containers.length})</h2>
          <span className={`collapsible-icon ${containersCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        {!containersCollapsed && (
          <div className="slide-up">
            {containers.length > 0 ? containers.map((container) => (
              <div key={container.name} className="mobile-list-item">
                <div className="stat-icon" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                  🐳
                </div>
                <div className="mobile-list-content">
                  <div className="mobile-list-title">{container.name}</div>
                  <div className="mobile-list-subtitle text-truncate">{container.image}</div>
                </div>
                <span className={`status-badge ${container.running ? 'status-active' : 'status-inactive'}`}>
                  {container.running ? 'Running' : container.state}
                </span>
              </div>
            )) : (
              <div className="empty-state">
                <div className="empty-state-icon">🐳</div>
                <p className="empty-state-message">No containers found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Services */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setServicesCollapsed(!servicesCollapsed)}
        >
          <h2>🔧 System Services ({services.length})</h2>
          <span className={`collapsible-icon ${servicesCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        {!servicesCollapsed && (
          <div className="slide-up">
            {services.length > 0 ? services.map((service) => (
              <div key={service.service} className="mobile-list-item">
                <div className="stat-icon" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                  🔧
                </div>
                <div className="mobile-list-content">
                  <div className="mobile-list-title">{service.service}</div>
                </div>
                <span className={`status-badge ${service.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                  {service.status}
                </span>
              </div>
            )) : (
              <div className="empty-state">
                <div className="empty-state-icon">🔧</div>
                <p className="empty-state-message">No services data available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disk Usage */}
      <div className="card">
        <div 
          className="collapsible-header"
          onClick={() => setDisksCollapsed(!disksCollapsed)}
        >
          <h2>💾 Storage ({disks.length})</h2>
          <span className={`collapsible-icon ${disksCollapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
        {!disksCollapsed && (
          <div className="slide-up">
            {disks.length > 0 ? disks.map((disk) => {
              const usePercent = parseInt(disk.usePercent);
              return (
                <div key={disk.device} className="mobile-card mb-1">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <div className="mobile-list-title">💾 {disk.device}</div>
                      <div className="mobile-list-subtitle">{disk.mountPoint}</div>
                    </div>
                    <div className="text-small text-center">
                      <div>{disk.usePercent}</div>
                    </div>
                  </div>
                  <div className="text-small mb-1" style={{ color: '#b0b0c0' }}>
                    {disk.used} / {disk.size} ({disk.available} free)
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
          </div>
        )}
      </div>

      {/* Server Configuration */}
      {showConfig && (
        <div className="card" style={{ background: 'rgba(102, 126, 234, 0.1)', borderColor: '#667eea' }}>
          <h2>⚙️ Server Configuration</h2>
          <div className="form-group">
            <label className="form-label">Backend Server URL</label>
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
          </div>
          <div className="mobile-grid-2">
            <button className="button" onClick={saveSettings}>
              <span>✓</span>
              <span>Save</span>
            </button>
            <button className="button button-secondary" onClick={() => setShowConfig(false)}>
              <span>✕</span>
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Power Control */}
      <div className="card">
        <h2>⚡ Power Control</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Manage server power state
        </p>
        <div className="mobile-grid-2">
          <button className="button" onClick={() => powerAction('reboot')}>
            <span>🔄</span>
            <span>Reboot</span>
          </button>
          <button className="button button-danger" onClick={() => powerAction('shutdown')}>
            <span>⏻</span>
            <span>Shutdown</span>
          </button>
        </div>
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