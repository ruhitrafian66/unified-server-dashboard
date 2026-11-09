/** qBittorrent torrent states, shared by the downloads bar and the storage page. */

// Actively fetching data (or about to).
export const DOWNLOADING_STATES = ['downloading', 'stalledDL', 'metaDL', 'forcedDL', 'forcedMetaDL', 'checkingDL', 'allocating', 'queuedDL', 'moving'];
// qBittorrent 5 renamed paused* → stopped*; accept both.
export const STOPPED_STATES = ['stoppedDL', 'stoppedUP', 'pausedDL', 'pausedUP'];

export const STATE_LABELS = {
  downloading: 'Downloading', stalledDL: 'Waiting for peers', metaDL: 'Getting metadata',
  forcedDL: 'Downloading (forced)', forcedMetaDL: 'Getting metadata', allocating: 'Allocating',
  stoppedDL: 'Stopped', pausedDL: 'Stopped', stoppedUP: 'Complete', pausedUP: 'Complete',
  uploading: 'Seeding', stalledUP: 'Seeding (idle)', forcedUP: 'Seeding (forced)',
  queuedDL: 'Queued', queuedUP: 'Queued to seed',
  checkingDL: 'Checking', checkingUP: 'Checking', checkingResumeData: 'Checking',
  queuedForChecking: 'Queued for check', moving: 'Moving files',
  error: 'Error', missingFiles: 'Missing files', unknown: 'Unknown',
};

export const isDownloading = (t) => DOWNLOADING_STATES.includes(t.state) && t.progress < 1;
export const isStopped = (t) => STOPPED_STATES.includes(t.state);

export const formatEta = (s) => {
  if (!s || s <= 0 || s >= 8640000) return '∞';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

/** "Verity.2026.2160p.AMZN.WEB-DL…" → "Verity (2026)"; "Show.S02E05.1080p…" → "Show S02E05". */
export const prettyTorrentName = (raw = '') => {
  let s = raw.replace(/\.(mkv|mp4|avi|m4v)$/i, '')
    .replace(/^\s*(www\.)?[\w-]+\.(org|com|net|to|se|cc|me)\s*[-–]+\s*/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ep = s.match(/^(.*?)\b(S\d{1,2}(?:E\d{1,3})?(?:\s?-\s?S?\d{1,2})?|Seasons? \d+(?:\s?-\s?\d+)?)\b/i);
  if (ep && ep[1].trim()) {
    const show = ep[1].replace(/\(?\b(19|20)\d{2}\b\)?[\s-]*$/, '').replace(/[\s(-]+$/, '').trim();
    const marker = /^s\d/i.test(ep[2]) ? ep[2].toUpperCase() : ep[2].replace(/^seasons?/i, 'Season');
    return `${show || ep[1].trim()} ${marker}`;
  }
  const yr = s.match(/^(.*?)[\s(]((?:19|20)\d{2})\b/);
  if (yr && yr[1].trim()) return `${yr[1].replace(/[\s(-]+$/, '').trim()} (${yr[2]})`;
  const cut = s.search(/\b(2160p|1080p|720p|480p|web|bluray|bdrip|x26[45]|hevc|complete)\b/i);
  return (cut > 0 ? s.slice(0, cut) : s).trim() || raw;
};
