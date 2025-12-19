// Episode Priority Utility for qBittorrent
// Detects TV show episodes and assigns download priorities

const episodePatterns = [
  /S(\d{1,2})E(\d{1,2})/i,           // S01E01, S1E1
  /Season\s*(\d+).*Episode\s*(\d+)/i, // Season 1 Episode 1
  /(\d{1,2})x(\d{1,2})/i,            // 01x01, 1x1
  /E(\d{1,2})/i,                     // E01, E1 (when season is in folder)
  /Episode\s*(\d+)/i,                // Episode 1
  /Ep\s*(\d+)/i,                     // Ep 1
  /\[(\d{1,2})\]/i,                  // [01]
  /\.(\d{1,2})\./i                   // .01.
];

/**
 * Parse episode information from filename
 * @param {string} filename - The filename to parse
 * @returns {Object|null} Episode info or null if not detected
 */
function parseEpisodeInfo(filename) {
  // Clean filename for better matching
  const cleanName = filename.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, '');
  
  for (const pattern of episodePatterns) {
    const match = cleanName.match(pattern);
    if (match) {
      let season = 1;
      let episode = 1;
      
      if (match.length === 3) {
        // Two capture groups (season and episode)
        season = parseInt(match[1]) || 1;
        episode = parseInt(match[2]) || 1;
      } else if (match.length === 2) {
        // One capture group (episode only)
        episode = parseInt(match[1]) || 1;
        // Try to detect season from folder or filename
        const seasonMatch = cleanName.match(/Season\s*(\d+)|S(\d+)/i);
        if (seasonMatch) {
          season = parseInt(seasonMatch[1] || seasonMatch[2]) || 1;
        }
      }
      
      return {
        season,
        episode,
        filename,
        sortKey: season * 1000 + episode // For easy sorting
      };
    }
  }
  
  return null;
}

/**
 * Calculate priority based on episode order
 * @param {number} index - Episode index in sorted order (0-based)
 * @param {number} total - Total number of episodes
 * @returns {number} qBittorrent priority (0-7)
 */
function calculatePriority(index, total) {
  if (index === 0) return 7; // Maximum priority for first episode
  if (index === 1) return 6; // High priority for second episode
  if (index === 2) return 6; // High priority for third episode
  if (index < Math.min(5, total * 0.2)) return 5; // Medium-high for next few
  if (index < total * 0.4) return 4; // Medium for first 40%
  return 1; // Normal priority for the rest
}

/**
 * Assign priorities to torrent files based on episode order
 * @param {Array} files - Array of torrent files
 * @returns {Array} Files with assigned priorities
 */
function assignEpisodePriorities(files) {
  // Separate video files from other files
  const videoExtensions = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/i;
  const videoFiles = files.filter(file => videoExtensions.test(file.name));
  const otherFiles = files.filter(file => !videoExtensions.test(file.name));
  
  // Parse episode info for video files
  const episodeFiles = videoFiles
    .map((file, originalIndex) => ({
      ...file,
      originalIndex,
      episodeInfo: parseEpisodeInfo(file.name)
    }))
    .filter(file => file.episodeInfo);
  
  // Sort by season and episode
  episodeFiles.sort((a, b) => a.episodeInfo.sortKey - b.episodeInfo.sortKey);
  
  // Assign priorities to episode files
  const prioritizedEpisodes = episodeFiles.map((file, sortedIndex) => ({
    ...file,
    priority: calculatePriority(sortedIndex, episodeFiles.length),
    episodeOrder: sortedIndex + 1
  }));
  
  // Create final file list with priorities
  const result = files.map(file => {
    const episodeFile = prioritizedEpisodes.find(ef => ef.originalIndex === file.originalIndex);
    if (episodeFile) {
      return {
        ...file,
        priority: episodeFile.priority,
        episodeInfo: episodeFile.episodeInfo,
        episodeOrder: episodeFile.episodeOrder
      };
    }
    
    // Non-episode files get normal priority
    return {
      ...file,
      priority: 1,
      episodeInfo: null,
      episodeOrder: null
    };
  });
  
  return result;
}

/**
 * Check if a torrent likely contains TV show episodes
 * @param {Array} files - Array of torrent files
 * @returns {boolean} True if torrent appears to contain TV episodes
 */
function isTVShowTorrent(files) {
  const videoFiles = files.filter(file => 
    /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/i.test(file.name)
  );
  
  if (videoFiles.length < 2) return false; // Need at least 2 video files
  
  const episodeFiles = videoFiles.filter(file => parseEpisodeInfo(file.name));
  
  // If more than 50% of video files are detected as episodes, it's likely a TV show
  return episodeFiles.length / videoFiles.length > 0.5;
}

export {
  parseEpisodeInfo,
  assignEpisodePriorities,
  calculatePriority,
  isTVShowTorrent
};