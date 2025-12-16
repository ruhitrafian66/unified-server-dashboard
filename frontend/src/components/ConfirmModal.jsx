import React from 'react';

function ConfirmModal({ title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger' }) {
  return (
    <div className="modal-overlay fade-in" onClick={onCancel}>
      <div className="modal slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
        </div>
        
        <div className="modal-content">
          <p style={{ color: '#b0b0c0', lineHeight: '1.5', fontSize: '0.875rem' }}>
            {message}
          </p>
        </div>
        
        <div className="modal-footer">
          <button
            className="button button-secondary"
            onClick={onCancel}
          >
            <span>{cancelText}</span>
          </button>
          <button
            className={`button ${type === 'danger' ? 'button-danger' : ''}`}
            onClick={onConfirm}
          >
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
