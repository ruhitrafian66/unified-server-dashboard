import { useState, useEffect } from 'react';
import axios from 'axios';

function SearchLogsPopup({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, limit: 50 });

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/qbittorrent/search/logs?limit=50');
      setLogs(response.data.logs || []);
      setStats({
        total: response.data.total || 0,
        limit: response.data.limit || 50
      });
    } catch (error) {
      console.error('Error fetching search logs:', error);
    }
    setLoading(false);
  };

  const clearLogs = async () => {
    if (!confirm('Clear all search logs? This action cannot be undone.')) return;
    
    try {
      await axios.delete('/api/qbittorrent/search/logs');
      setLogs([]);
      setStats({ total: 0, limit: 50 });
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '🔄';
      case 'failed': return '❌';
      case 'started': return '🚀';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'running': return '#2196f3';
      case 'failed': return '#f44336';
      case 'started': return '#ff9800';
      default: return '#9e9e9e';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Search Logs</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {/* Stats */}
          <div className="mobile-card mb-2">
            <div className="mobile-grid-3">
              <div className="text-center">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Total Searches</div>
              </div>
              <div className="text-center">
                <div className="stat-value">{logs.filter(log => log.status === 'completed').length}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="text-center">
                <div className="stat-value">{logs.filter(log => log.status === 'failed').length}</div>
                <div className="stat-label">Failed</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mobile-grid-2 mb-2">
            <button className="button button-secondary" onClick={fetchLogs}>
              <span>🔄</span>
              <span>Refresh</span>
            </button>
            <button className="button button-danger" onClick={clearLogs}>
              <span>🗑️</span>
              <span>Clear All</span>
            </button>
          </div>

          {/* Logs List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div className="text-center" style={{ padding: '2rem', color: '#b0b0c0' }}>
                <div>🔄 Loading logs...</div>
              </div>
            ) : logs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">No search logs</div>
                <p className="empty-state-message">
                  Search logs will appear here when you perform torrent searches
                </p>
              </div>
            ) : (
              <div className="mobile-grid">
                {logs.map((log) => (
                  <div key={log.id} className="mobile-card">
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mobile-list-title text-wrap" style={{ marginBottom: '0.25rem' }}>
                          {log.pattern}
                        </div>
                        <div className="mobile-list-subtitle">
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span 
                          className="status-badge"
                          style={{ 
                            background: getStatusColor(log.status),
                            fontSize: '0.75rem'
                          }}
                        >
                          {getStatusIcon(log.status)} {log.status}
                        </span>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="mobile-grid-2" style={{ gap: '0.5rem', fontSize: '0.8rem', color: '#b0b0c0' }}>
                      <div>
                        <strong>Category:</strong> {log.category}
                      </div>
                      <div>
                        <strong>Plugins:</strong> {log.plugins}
                      </div>
                      <div>
                        <strong>Results:</strong> {log.resultCount || 0}
                      </div>
                      <div>
                        <strong>Duration:</strong> {formatDuration(log.duration)}
                      </div>
                    </div>

                    {/* Error */}
                    {log.error && (
                      <div style={{ 
                        marginTop: '0.75rem', 
                        padding: '0.5rem', 
                        background: 'rgba(244, 67, 54, 0.1)', 
                        border: '1px solid #f44336',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        color: '#f44336'
                      }}>
                        <strong>Error:</strong> {log.error}
                      </div>
                    )}

                    {/* Search ID */}
                    {log.searchId && (
                      <div style={{ 
                        marginTop: '0.5rem', 
                        fontSize: '0.7rem', 
                        color: '#666',
                        fontFamily: 'monospace'
                      }}>
                        ID: {log.searchId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {stats.total > stats.limit && (
            <div className="text-center mt-2" style={{ color: '#b0b0c0', fontSize: '0.875rem' }}>
              Showing {Math.min(stats.limit, logs.length)} of {stats.total} searches
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchLogsPopup;