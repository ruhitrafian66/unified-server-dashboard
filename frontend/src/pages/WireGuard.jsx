import React, { useState, useEffect } from 'react';
import axios from 'axios';

function WireGuard({ serverUrl }) {
  const [interfaces, setInterfaces] = useState([]);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [status, setStatus] = useState('');
  const [peers, setPeers] = useState([]);

  useEffect(() => {
    fetchInterfaces();
  }, []);

  const fetchInterfaces = async () => {
    try {
      const response = await axios.get('/api/wireguard/interfaces');
      setInterfaces(response.data.interfaces);
    } catch (error) {
      console.error('Error fetching interfaces:', error);
    }
  };

  const fetchStatus = async (iface) => {
    try {
      const response = await axios.get(`/api/wireguard/status/${iface}`);
      setStatus(response.data.status);
    } catch (error) {
      console.error('Error fetching status:', error);
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
      fetchStatus(selectedInterface);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleSelectInterface = (iface) => {
    setSelectedInterface(iface);
    fetchStatus(iface);
    fetchPeers(iface);
  };

  return (
    <div>
      <h1>WireGuard VPN</h1>
      
      <div className="card">
        <h2>Interfaces</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {interfaces.map((iface) => (
            <button
              key={iface}
              className={`button ${selectedInterface === iface ? 'button-active' : ''}`}
              onClick={() => handleSelectInterface(iface)}
            >
              {iface}
            </button>
          ))}
        </div>
      </div>

      {selectedInterface && (
        <>
          <div className="card">
            <h2>Controls</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="button" onClick={() => toggleInterface('up')}>Start</button>
              <button className="button button-danger" onClick={() => toggleInterface('down')}>Stop</button>
            </div>
          </div>

          <div className="card">
            <h2>Status</h2>
            <pre style={{ background: '#0a0a14', padding: '1rem', borderRadius: '6px', overflow: 'auto', color: '#4caf50', border: '1px solid #2a2a3e' }}>
              {status || 'No status available'}
            </pre>
          </div>

          <div className="card">
            <h2>Peers ({peers.length})</h2>
            {peers.map((peer, index) => (
              <div key={index} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a3e', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '0.5rem', color: '#e0e0e0' }}>
                {peer}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default WireGuard;
