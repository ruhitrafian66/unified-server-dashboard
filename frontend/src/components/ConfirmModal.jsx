import { useEffect } from 'react';

function ConfirmModal({ title, message, children, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay fade-in" onClick={onCancel}>
      <div className="modal slide-up" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" id="confirm-title">{title}</h2>
        </div>

        <div className="modal-content">
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.875rem' }}>{message}</p>
          {children}
        </div>

        <div className="modal-footer">
          <button className="button button-secondary" onClick={onCancel} autoFocus>
            <span>{cancelText}</span>
          </button>
          <button className={`button ${type === 'danger' ? 'button-danger' : ''}`} onClick={onConfirm}>
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
