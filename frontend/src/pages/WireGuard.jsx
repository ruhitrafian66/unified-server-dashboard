import React, { useState, useEffect } from 'react';
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
      // Check if interface is up by looking for "interface:" in status
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
      showToast(`VPN ${action === 'up' ? 'started' : 'stopped'} successfully`, 'success');
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
      <div>
        <h1>WireGuard VPN</h1>
        <div className="card">
          <LoadingSkeleton count={3} height="80px" />
        </div>
      </div>
    );
  }

  if (interfaces.length === 0) {
    return (
      <div>
        <h1>WireGuard VPN</h1>
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <div className="empty-state-title">No VPN Interfaces Found</div>
            <p className="empty-state-message">
              No WireGuard interfaces are configured on this server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>WireGuard VPN</h1>
      
      {/* Connection Status Card */}
      <div className="card" style={{ 
        background: isConnected 
          ? 'rgba(76, 175, 80, 0.1)' 
          : 'rgba(244, 67, 54, 0.1)',
        borderColor: isConnected ? '#4caf50' : '#f44336'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: isConnected 
              ? 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
              : 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem'
          }}>
            {isConnected ? '🔒' : '🔓'}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, marginBottom: '0.25rem' }}>
              {isConnected ? 'VPN Connected' : 'VPN Disconnected'}
            </h2>
            <p style={{ color: '#b0b0c0', fontSize: '0.875rem', margin: 0 }}>
              {selectedInterface ? `Interface: ${selectedInterface}` : 'No interface selected'}
            </p>
          </div>
          {selectedInterface && (
            <button 
              className={`button ${isConnected ? 'button-danger' : ''}`}
              onClick={() => toggleInterface(isConnected ? 'down' : 'up')}
              style={{ minWidth: '120px' }}
            >
              {isConnected ? '⏹️ Disconnect' : '▶️ Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Interfaces */}
      <div className="card">
        <h2>VPN Interfaces ({interfaces.length})</h2>
        <p style={{ color: '#b0b0c0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Select an interface to view details and manage connection
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
          {/* Quick Controls */}
          <div className="card">
            <h2>Quick Controls</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="button" 
                onClick={() => toggleInterface('up')}
                disabled={isConnected}
              >
                ▶️ Start VPN
              </button>
              <button 
                className="button button-danger" 
                onClick={() => toggleInterface('down')}
                disabled={!isConnected}
              >
                ⏹️ Stop VPN
              </button>
              <button 
                className="button" 
                onClick={() => {
                  fetchStatus(selectedInterface);
                  fetchPeers(selectedInterface);
                  showToast('Status refreshed', 'info');
                }}
                style={{ marginLeft: 'auto' }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="card">
            <h2>Interface Status</h2>
            <pre style={{ 
              background: '#0a0a14', 
              padding: '1rem', 
              borderRadius: '8px', 
              overflow: 'auto', 
              color: isConnected ? '#4caf50' : '#f44336',
              border: '1px solid #2a2a3e',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              maxHeight: '300px'
            }}>
              {status || 'No status available'}
            </pre>
          </div>

          {/* Peers */}
          <div className="card">
            <h2>Connected Peers ({peers.length})</h2>
            {peers.length > 0 ? (
              peers.map((peer, index) => (
                <div 
                  key={index} 
                  style={{ 
                    padding: '0.75rem', 
                    borderBottom: index < peers.length - 1 ? '1px solid #2a2a3e' : 'none',
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '6px', 
                    marginBottom: '0.5rem',
                    color: '#e0e0e0',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all'
                  }}
                >
                  {peer}
                </div>
              ))
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
