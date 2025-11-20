import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import qbittorrentRoutes from './routes/qbittorrent.js';
import wireguardRoutes from './routes/wireguard.js';
import omvRoutes from './routes/omv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - allow local network access
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/qbittorrent', qbittorrentRoutes);
app.use('/api/wireguard', wireguardRoutes);
app.use('/api/omv', omvRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version
  });
});

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend-dist');
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Platform: ${process.platform}`);
});
