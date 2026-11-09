/** Accessible on/off switch (a real checkbox underneath, styled as a switch). */
export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <label className={`switch ${disabled ? 'switch-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
