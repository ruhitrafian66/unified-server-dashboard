import { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../App';
import LoadingSkeleton from '../components/LoadingSkeleton';

function WireGuard({ serverUrl }) {
  const { showToast } = useToast();
  const [interfaces, setInterfaces] = useState([]);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [status, setStatus] = useState('');
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    fetchInterfaces();
  }, []);

  useEffect(() => {
    if (selectedInterface) {
      const interval = setInterval(() => {
        fetchStatus(selectedInterface);
        fetchPeers(selectedInterface);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedInterface]);

  const fetchInterfaces = async () => {
    try {
      const response = await axios.get('/api/wireguard/interfaces');
      setInterfaces(response.data.interfaces);
      setLoading(false);
      if (response.data.interfaces.length > 0 && !selectedInterface) {
        handleSelectInterface(response.data.interfaces[0]);
      }
    } catch (error) {
      console.error('Error fetching interfaces:', error);
      showToast('Failed to fetch VPN interfaces', 'error');
      setLoading(false);
    }
  };

  const fetchStatus = async (iface) => {
    try {
      const response = await axios.get(`/api/wireguard/status/${iface}`);
      setStatus(response.data.status);
      setIsConnected(response.data.status.toLowerCase().includes('interface:'));
    } catch (error) {
      console.error('Error fetching status:', error);
      setIsConnected(false);
    }
  };

  const fetchPeers = async (iface) => {
    try {
      const response = await axios.get(`/api/wireguard/peers/${iface}`);
      setPeers(response.data.peers);
    } catch (error) {
      console.error('Error fetching peers:', error);
    }
  };

  const toggleInterface = async (action) => {
    try {
      await axios.post(`/api/wireguard/interface/${action}`, {
        interface: selectedInterface
      });
      showToast(`VPN ${action === 'up' ? 'started' : 'stopped'}`, 'success');
      setTimeout(() => {
        fetchStatus(selectedInterface);
        fetchPeers(selectedInterface);
      }, 1000);
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  };

  const handleSelectInterface = (iface) => {
    setSelectedInterface(iface);
    fetchStatus(iface);
    fetchPeers(iface);
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card">
          <h2>🔒 VPN</h2>
          <LoadingSkeleton count={3} height="80px" />
        </div>
      </div>
    );
  }

  if (interfaces.length === 0) {
    return (
      <div className="fade-in">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <div className="empty-state-title">No VPN Interfaces</div>
            <p className="empty-state-message">
              No WireGuard interfaces are configured on this server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Connection Status */}
      <div className="card" style={{ 
        background: isConnected 
          ? 'rgba(76, 175, 80, 0.1)' 
          : 'rgba(244, 67, 54, 0.1)',
        borderColor: isConnected ? '#4caf50' : '#f44336'
      }}>
        <div className="stat-card">
          <div className="stat-icon" style={{
            background: isConnected 
              ? 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
              : 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)'
          }}>
            {isConnected ? '🔒' : '🔓'}
          </div>
          <div className="stat-content">
            <div className="stat-label">VPN Status</div>
            <div className="stat-value">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            {selectedInterface && (
              <div className="stat-label">Interface: {selectedInterface}</div>
            )}
          </div>
        </div>
        
        {selectedInterface && (
          <div className="mobile-grid-2 mt-2">
            <button 
              className="button"
              onClick={() => toggleInterface('up')}
              disabled={isConnected}
              style={{ opacity: isConnected ? 0.5 : 1 }}
            >
              <span>▶️</span>
              <span>Connect</span>
            </button>
            <button 
              className="button button-danger"
              onClick={() => toggleInterface('down')}
              disabled={!isConnected}
              style={{ opacity: !isConnected ? 0.5 : 1 }}
            >
              <span>⏹️</span>
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Interface Selection */}
      <div className="card">
        <h2>🔧 Interfaces ({interfaces.length})</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Select an interface to manage
        </p>
        <div className="filter-buttons">
          {interfaces.map((iface) => (
            <button
              key={iface}
              className={`filter-button ${selectedInterface === iface ? 'active' : ''}`}
              onClick={() => handleSelectInterface(iface)}
            >
              {iface}
            </button>
          ))}
        </div>
      </div>

      {selectedInterface && (
        <>
          {/* Quick Actions */}
          <div className="card">
            <h2>⚡ Quick Actions</h2>
            <div className="mobile-grid">
              <button 
                className="button" 
                onClick={() => {
                  fetchStatus(selectedInterface);
                  fetchPeers(selectedInterface);
                  showToast('Status refreshed', 'info');
                }}
              >
                <span>🔄</span>
                <span>Refresh Status</span>
              </button>
            </div>
          </div>

          {/* Status Details */}
          <div className="card">
            <h2>📊 Interface Status</h2>
            <div className="mobile-card" style={{ 
              background: '#0a0a14', 
              border: '1px solid #2a2a3e',
              fontFamily: 'monospace'
            }}>
              <pre style={{ 
                color: isConnected ? '#4caf50' : '#f44336',
                fontSize: '0.75rem',
                lineHeight: '1.4',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {status || 'No status available'}
              </pre>
            </div>
          </div>

          {/* Connected Peers */}
          <div className="card">
            <h2>👥 Connected Peers ({peers.length})</h2>
            {peers.length > 0 ? (
              <div className="mobile-grid">
                {peers.map((peer, index) => (
                  <div key={index} className="mobile-card">
                    <div style={{ 
                      color: '#e0e0e0',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      lineHeight: '1.4'
                    }}>
                      {peer}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">👥</div>
                <p className="empty-state-message">
                  {isConnected ? 'No peers connected' : 'Start VPN to see connected peers'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default WireGuard;