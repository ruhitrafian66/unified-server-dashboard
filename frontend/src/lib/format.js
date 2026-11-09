export const formatBytes = (bytes, digits = 1) => {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
};

export const formatSpeed = (bytesPerSec) => `${formatBytes(bytesPerSec)}/s`;

export const formatDuration = (seconds) => {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const levelColor = (pct) =>
  pct > 85 ? 'var(--danger)' : pct > 65 ? 'var(--warning)' : 'var(--success)';

export const apiError = (err) => err?.response?.data?.error || err?.message || 'Unknown error';
