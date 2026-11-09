/**
 * Turn scene/P2P release names into something readable.
 *
 *   "Modern Family (2009) Season 1-11 S01-S11 (1080p Mixed x265 HEVC …)"
 *     → { title: 'Modern Family', year: 2009, seasons: [1..11], quality: ['1080p','HEVC'] }
 *   "www.UIndex.org    -    Toy Story 2 1999 1080p DSNP WEB-DL …"
 *     → { title: 'Toy Story 2', year: 1999, … }
 */

export const VIDEO_EXT = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.ts', '.wmv', '.webm']);
export const SUBTITLE_EXT = new Set(['.srt', '.sub', '.idx', '.ass', '.ssa', '.vtt']);

const STRIP_EXT = /\.(mkv|mp4|avi|m4v|mov|ts|wmv|webm)$/i;
// "www.Site.org - " style prefixes that trackers inject.
const SITE_PREFIX = /^\s*(www\.)?[\w-]+\.(org|com|net|to|se|cc|me|io|ws|xyz)\s*[-–]+\s*/i;
// The first token that is clearly release metadata ends the title.
const TITLE_END = /(^|\s)(\(?(19|20)\d{2}\)?|S\d{1,2}(E\d{1,3})?|Season\s?\d{1,2}|\d{1,2}x\d{2}|2160p|1080p|720p|576p|480p|4k|uhd|complete|web[- ]?dl|webrip|web|bluray|blu-ray|bdrip|brrip|dvdrip|hdtv|hdrip|x26[45]|h ?26[45]|hevc|imax|remux|proper|repack|epub|pdf|mobi)(?=\s|$|[)\]])/i;

const range = (a, b) => {
  const out = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 60; i++) out.push(i);
  return out;
};

export const qualityTags = (raw = '') => {
  const tags = [];
  if (/2160p|\b4k\b|\buhd\b/i.test(raw)) tags.push('4K');
  else if (/1080p/i.test(raw)) tags.push('1080p');
  else if (/720p/i.test(raw)) tags.push('720p');
  else if (/480p|576p/i.test(raw)) tags.push('SD');
  if (/(^|[\W_])(DV|DoVi|dolby[ .]?vision)([\W_]|$)/i.test(raw)) tags.push('Dolby Vision');
  else if (/HDR10\+|HDR10plus/i.test(raw)) tags.push('HDR10+');
  else if (/(^|[\W_])HDR/i.test(raw)) tags.push('HDR');
  if (/remux/i.test(raw)) tags.push('Remux');
  else if (/blu-?ray|bdrip|brrip/i.test(raw)) tags.push('BluRay');
  else if (/web[- .]?dl/i.test(raw)) tags.push('WEB-DL');
  else if (/webrip/i.test(raw)) tags.push('WEBRip');
  else if (/hdtv/i.test(raw)) tags.push('HDTV');
  if (/x265|h\.?265|hevc/i.test(raw)) tags.push('HEVC');
  if (/atmos/i.test(raw)) tags.push('Atmos');
  return tags;
};

/** Season numbers named in a release name ("S01-S03", "Season 1-11", "S02E05", "S01"). */
export const seasonsInName = (raw = '') => {
  const n = raw.replace(/[._]/g, ' ');
  let m = n.match(/\bS(\d{1,2})\s?[-–]\s?S?(\d{1,2})\b/i) || n.match(/\bSeasons?\s?(\d{1,2})\s?[-–]\s?(\d{1,2})\b/i);
  if (m) return range(+m[1], +m[2]);
  m = n.match(/(?:^|[^a-z0-9])S(\d{1,2})(?:E\d{1,3})?(?![a-z0-9])/i) || n.match(/\bSeason\s?(\d{1,2})\b/i);
  return m ? [+m[1]] : [];
};

/** Season/episode in a file name or path ("S01E04", "1x04", ".../Season 4/... E04"). */
export const episodeOf = (filePath = '') => {
  const m = filePath.match(/(?:^|[^a-z0-9])S(\d{1,2})[ ._-]?E(\d{1,3})/i) || filePath.match(/(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?![0-9])/i);
  if (m) return { season: +m[1], episode: +m[2] };
  const season = filePath.match(/Season[ ._-]?(\d{1,2})/i);
  const ep = filePath.match(/(?:^|[^a-z0-9])E(?:p(?:isode)?)?[ ._-]?(\d{1,3})(?![0-9])/i);
  if (season && ep) return { season: +season[1], episode: +ep[1] };
  return null;
};

export const hasReleaseMarkers = (raw = '') =>
  /(19|20)\d{2}|S\d{1,2}|Season\s?\d|2160p|1080p|720p|web[- .]?dl|webrip|bluray|bdrip|hdtv|x26[45]|hevc/i.test(raw);

export const parseRelease = (raw = '') => {
  let s = raw.replace(STRIP_EXT, '').replace(SITE_PREFIX, '');
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();

  const yearMatch = s.match(/(?:^|[\s(])((?:19|20)\d{2})(?=[\s)]|$)/);
  let title;
  const end = s.match(TITLE_END);
  if (end && end.index > 0) {
    title = s.slice(0, end.index);
  } else if (end && end.index === 0 && yearMatch) {
    // Titles that are a year ("1917", "2012"): keep the first year as the title.
    title = yearMatch[1];
  } else {
    title = s;
  }
  title = title.replace(/[\s\-–:(]+$/, '').replace(/^[\s\-–]+/, '').trim() || s;

  // If the title itself is the first year, look for a second year as the release year.
  let year = yearMatch ? +yearMatch[1] : null;
  if (year && String(year) === title) {
    const second = s.slice(yearMatch.index + 5).match(/(?:^|[\s(])((?:19|20)\d{2})(?=[\s)]|$)/);
    year = second ? +second[1] : null;
  }

  return { title, year, seasons: seasonsInName(raw), quality: qualityTags(raw) };
};
