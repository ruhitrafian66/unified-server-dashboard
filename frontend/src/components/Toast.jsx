import { useEffect } from 'react';

const ICONS = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

function Toast({ id, message, type = 'info', onClose, duration = 3500 }) {
  useEffect(() => {
    // Errors stay a little longer so they can be read.
    const timer = setTimeout(() => onClose(id), type === 'error' ? Math.max(duration, 6000) : duration);
    return () => clearTimeout(timer);
  }, [id, duration, type, onClose]);

  return (
    <div className={`toast ${type} slide-up`} role={type === 'error' ? 'alert' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }} aria-hidden="true">{ICONS[type] || ICONS.info}</span>
        <span style={{ flex: 1, fontSize: '0.875rem', lineHeight: '1.3', overflowWrap: 'anywhere' }}>{message}</span>
        <button
          onClick={() => onClose(id)}
          aria-label="Dismiss"
          className="touchable"
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '32px', height: '32px',
            borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', padding: 0, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default Toast;
