# Episode Priority Feature

## Overview
The Episode Priority feature automatically prioritizes TV show episodes for download, ensuring that first episodes download before later ones. This is especially useful for season packs where you want to start watching while the rest downloads.

## How It Works

### 1. Episode Detection
The system automatically detects TV show episodes using multiple patterns:
- `S01E01`, `S1E1` (Standard format)
- `1x01`, `01x01` (Alternative format)
- `Season 1 Episode 1` (Descriptive format)
- `E01`, `Episode 1` (Episode-only format)

### 2. Priority Assignment
Episodes are assigned qBittorrent priorities based on their order:
- **Episode 1**: Priority 7 (Maximum) 🔥
- **Episodes 2-3**: Priority 6 (High) ⚡
- **Next few episodes**: Priority 5 (Medium-high) 📈
- **First 40%**: Priority 4 (Medium) 📊
- **Remaining episodes**: Priority 1 (Normal)

### 3. Visual Indicators
In the Downloads tab, torrents with episode priority enabled show:
- Priority badge with icon (🔥⚡📈📊)
- "Episodes" label to indicate the feature is active
- Tooltip showing priority level

## Usage

### Manual Search (Add Tab)
1. Search for a TV show torrent
2. Select your desired torrent
3. Check "📺 Prioritize episodes (S01E01 first)"
4. Click "Add Selected Torrent"

### Season Downloads (Shows Tab)
1. Go to Shows > Past Shows
2. Search for a TV show
3. Select season to download
4. Episode priority is automatically enabled for TV shows

### API Usage
```javascript
// Add torrent with episode priority
POST /api/qbittorrent/torrents/add-with-priority
{
  "urls": "magnet:?xt=urn:btih:...",
  "sequentialDownload": true,
  "enableEpisodePriority": true
}
```

## Technical Details

### Backend Implementation
- **Episode Detection**: `backend/utils/episodePriority.js`
- **API Endpoint**: `/api/qbittorrent/torrents/add-with-priority`
- **File Management**: `/api/qbittorrent/torrents/:hash/files`

### Frontend Integration
- **Manual Search**: `frontend/src/pages/AddTorrent.jsx`
- **Season Downloads**: `frontend/src/pages/PastShows.jsx`
- **Visual Indicators**: `frontend/src/pages/MyDownloads.jsx`

### Priority Levels
| Priority | qBittorrent Value | Description | Icon |
|----------|------------------|-------------|------|
| Maximum  | 7 | First episode | 🔥 |
| High     | 6 | Episodes 2-3 | ⚡ |
| Medium-High | 5 | Next few episodes | 📈 |
| Medium   | 4 | First 40% | 📊 |
| Normal   | 1 | Remaining episodes | 📊 |

## Benefits

1. **Better Viewing Experience**: Start watching while downloading
2. **Bandwidth Optimization**: Focus on episodes you'll watch first
3. **Automatic Detection**: Works with any TV show format
4. **User Control**: Can be enabled/disabled per torrent
5. **Visual Feedback**: Clear indicators in the interface

## Supported Formats

The system recognizes these episode naming patterns:
- `Show.Name.S01E01.Quality.mkv`
- `Show.Name.1x01.Quality.mkv`
- `Show Name Season 1 Episode 1.mkv`
- `Show.Name.E01.Quality.mkv`
- `Show.Name.Episode.1.Quality.mkv`

## Future Enhancements

- Custom priority distribution settings
- Episode range selection
- Integration with streaming services
- Advanced pattern recognition
- Priority scheduling based on air dates