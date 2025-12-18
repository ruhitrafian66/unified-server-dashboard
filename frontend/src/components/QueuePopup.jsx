import React, { useState, useEffect } from 'react';
import axios from 'axios';

function QueuePopup({ isOpen, onClose }) {
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchQueueItems();
      const interval = setInterval(fetchQueueItems, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchQueueItems = async () => {
    try {
      const response = await axios.get('/api/queue');
      setQueueItems(response.data.items || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching queue:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'processing': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ff9800';
      case 'processing': return '#2196f3';
      case 'completed': return '#4caf50';
      case 'failed': return '#f44336';
      default: return '#b0b0c0';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 Task Queue ({queueItems.length})</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {loading ? (
            <div className="text-center" style={{ padding: '2rem', color: '#b0b0c0' }}>
              Loading queue...
            </div>
          ) : queueItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">No queue items</div>
              <p className="empty-state-message">Background tasks will appear here</p>
            </div>
          ) : (
            <div className="queue-list">
              {queueItems.map((item) => (
                <div key={item.id} className="queue-item">
                  <div className="queue-item-header">
                    <span 
                      className="queue-status-icon"
                      style={{ color: getStatusColor(item.status) }}
                    >
                      {getStatusIcon(item.status)}
                    </span>
                    <div className="queue-item-content">
                      <div className="queue-item-title">{item.title}</div>
                      <div className="queue-item-subtitle">{item.description}</div>
                      {item.progress !== undefined && item.status === 'processing' && (
                        <div className="progress-bar mt-1">
                          <div 
                            className="progress-fill" 
                            style={{ width: `${item.progress}%` }} 
                          />
                        </div>
                      )}
                      {item.error && (
                        <div className="queue-error">
                          Error: {item.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QueuePopup;