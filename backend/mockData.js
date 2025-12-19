// Mock data for local testing environment

const mockSystemInfo = {
  cpu: "45.2%",
  memory: "62.8%", 
  disk: "38.5%",
  uptime: "5 days, 12:34"
};

const mockServices = [
  { service: "nginx", status: "active" },
  { service: "docker", status: "active" },
  { service: "ssh", status: "active" },
  { service: "cron", status: "active" },
  { service: "systemd-resolved", status: "active" }
];

const mockDisks = [
  {
    device: "/dev/sda1",
    mountPoint: "/",
    size: "14G",
    used: "5.4G", 
    available: "8.1G",
    usePercent: "40%"
  },
  {
    device: "/dev/sdb1", 
    mountPoint: "/storage",
    size: "229G",
    used: "130G",
    available: "99G", 
    usePercent: "57%"
  }
];

const mockContainers = [
  {
    name: "qbittorrent",
    image: "lscr.io/linuxserver/qbittorrent:latest",
    running: true,
    state: "running"
  },
  {
    name: "sonarr",
    image: "lscr.io/linuxserver/sonarr:latest", 
    running: true,
    state: "running"
  },
  {
    name: "radarr",
    image: "lscr.io/linuxserver/radarr:latest",
    running: true,
    state: "running"
  },
  {
    name: "prowlarr",
    image: "lscr.io/linuxserver/prowlarr:latest",
    running: false,
    state: "exited"
  }
];

const mockTorrents = [
  {
    hash: "abc123def456",
    name: "The.Matrix.1999.2160p.UHD.BluRay.x265-TERMINAL",
    size: 15728640000, // 14.6 GB in bytes
    progress: 0.75,
    dlspeed: 5242880, // 5 MB/s in bytes
    upspeed: 1048576, // 1 MB/s in bytes
    eta: 1800, // 30 minutes
    state: "downloading",
    episodePriorityEnabled: false,
    priority: 1
  },
  {
    hash: "def456ghi789", 
    name: "Breaking.Bad.S01.COMPLETE.1080p.BluRay.x264-REWARD",
    size: 32212254720, // 30 GB in bytes
    progress: 1.0,
    dlspeed: 0,
    upspeed: 2097152, // 2 MB/s in bytes
    eta: 8640000,
    state: "uploading",
    episodePriorityEnabled: true,
    priority: 7
  },
  {
    hash: "ghi789jkl012",
    name: "The.Bear.S03E01.1080p.WEB.H264-SUCCESSORS",
    size: 2147483648, // 2 GB in bytes
    progress: 0.45,
    dlspeed: 0,
    upspeed: 0,
    eta: 8640000,
    state: "stalledDL",
    episodePriorityEnabled: false,
    priority: 1
  },
  {
    hash: "jkl012mno345",
    name: "Stranger.Things.S04.COMPLETE.2160p.NF.WEB-DL.x265-MIXED",
    size: 45000000000, // 42 GB in bytes
    progress: 0.15,
    dlspeed: 8388608, // 8 MB/s in bytes
    upspeed: 0,
    eta: 3600, // 1 hour
    state: "downloading",
    episodePriorityEnabled: true,
    priority: 6
  }
];

const mockShows = [
  {
    id: 1,
    name: "Breaking Bad",
    tmdbId: 1396,
    currentSeason: 5,
    currentEpisode: 16,
    status: "active",
    nextEpisodeAirDate: null,
    lastChecked: new Date().toISOString(),
    downloadedEpisodes: ["S05E15", "S05E16"]
  },
  {
    id: 2,
    name: "The Bear",
    tmdbId: 136315,
    currentSeason: 3,
    currentEpisode: 10,
    status: "active", 
    nextEpisodeAirDate: "2025-06-15T20:00:00Z",
    lastChecked: new Date().toISOString(),
    downloadedEpisodes: ["S03E09", "S03E10"]
  },
  {
    id: 3,
    name: "Game of Thrones",
    tmdbId: 1399,
    currentSeason: 8,
    currentEpisode: 6,
    status: "paused",
    nextEpisodeAirDate: null,
    lastChecked: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    downloadedEpisodes: []
  }
];

const mockSearchResults = [
  {
    id: 1396,
    name: "Breaking Bad",
    firstAirDate: "2008-01-20",
    voteAverage: 9.5,
    overview: "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.",
    posterPath: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"
  },
  {
    id: 136315,
    name: "The Bear", 
    firstAirDate: "2022-06-23",
    voteAverage: 8.7,
    overview: "Carmen 'Carmy' Berzatto, a young chef from the fine dining world, comes home to Chicago to run his deceased brother's Italian beef sandwich shop.",
    posterPath: "/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg"
  },
  {
    id: 1399,
    name: "Game of Thrones",
    firstAirDate: "2011-04-17", 
    voteAverage: 9.2,
    overview: "Seven noble families fight for control of the mythical land of Westeros. Friction between the houses leads to full-scale war.",
    posterPath: "/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg"
  }
];

const mockWireGuardInterfaces = ["wg0", "wg1"];

const mockWireGuardStatus = `interface: wg0
  public key: ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ=
  private key: (hidden)
  listening port: 51820

peer: XYZ789ABC123DEF456GHI012JKL345MNO678PQR901STU234VWX567=
  endpoint: 192.168.1.100:51820
  allowed ips: 10.2.0.0/24
  latest handshake: 2 minutes, 15 seconds ago
  transfer: 1.25 MiB received, 856.32 KiB sent`;

const mockWireGuardPeers = [
  "peer: XYZ789ABC123DEF456GHI012JKL345MNO678PQR901STU234VWX567=",
  "  endpoint: 192.168.1.100:51820", 
  "  allowed ips: 10.2.0.0/24",
  "  latest handshake: 2 minutes, 15 seconds ago",
  "  transfer: 1.25 MiB received, 856.32 KiB sent"
];

const mockQueueItems = [
  {
    id: 1,
    title: "Download The Bear S03E11",
    description: "Searching for and downloading new episode",
    type: "tv-show",
    status: "processing",
    progress: 65,
    createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    error: null
  },
  {
    id: 2,
    title: "Check Breaking Bad for new episodes",
    description: "Automated episode check scheduled",
    type: "tv-show",
    status: "pending",
    progress: 0,
    createdAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
    error: null
  },
  {
    id: 3,
    title: "Download season 2 of Succession",
    description: "Batch download all episodes from season 2",
    type: "season-download",
    status: "pending",
    progress: 0,
    createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    error: null
  },
  {
    id: 4,
    title: "Search for Game of Thrones S08E07",
    description: "Episode search completed",
    type: "tv-show",
    status: "completed",
    progress: 100,
    createdAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
    error: null
  },
  {
    id: 5,
    title: "Download The Office S05E12",
    description: "Failed to find suitable torrent",
    type: "tv-show",
    status: "failed",
    progress: 0,
    createdAt: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
    error: "No torrents found matching quality criteria"
  }
];

export {
  mockSystemInfo,
  mockServices,
  mockDisks,
  mockContainers,
  mockTorrents,
  mockShows,
  mockSearchResults,
  mockWireGuardInterfaces,
  mockWireGuardStatus,
  mockWireGuardPeers,
  mockQueueItems
};