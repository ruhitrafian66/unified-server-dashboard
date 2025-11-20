import React, { useState, useEffect } from 'react';
import axios from 'axios';

function OMV({ serverUrl }) {
  const [services, setServices] = useState([]);
  const [disks, setDisks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [servicesRes, disksRes] = await Promise.all([
        axios.get('/api/omv/services'),
        axios.get('/api/omv/disks')
      ]);
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

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h1>OpenMediaVault</h1>
      
      <div className="card">
        <h2>Power Control</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="button" onClick={() => powerAction('reboot')}>Reboot</button>
          <button className="button button-danger" onClick={() => powerAction('shutdown')}>Shutdown</button>
        </div>
      </div>

      <div className="card">
        <h2>Services</h2>
        {services.map((service) => (
          <div key={service.service} style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '0.75rem',
            borderBottom: '1px solid #eee'
          }}>
            <span>{service.service}</span>
            <span className={`status-badge ${service.status === 'active' ? 'status-active' : 'status-inactive'}`}>
              {service.status}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Disk Usage</h2>
        {disks.map((disk) => (
          <div key={disk.device} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span><strong>{disk.device}</strong> - {disk.mountPoint}</span>
              <span>{disk.used} / {disk.size} ({disk.usePercent})</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '8px', 
              background: '#e0e0e0', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: disk.usePercent, 
                height: '100%', 
                background: parseInt(disk.usePercent) > 80 ? '#f44336' : '#4caf50',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OMV;
