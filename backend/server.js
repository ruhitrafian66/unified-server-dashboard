import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { default: qbittorrentRoutes } = await import('./routes/qbittorrent.js');
const { default: systemRoutes } = await import('./routes/omv.js');
const { default: dockerRoutes } = await import('./routes/docker.js');
const { default: showsRoutes, stopShowTimers } = await import('./routes/shows.js');
const { default: tmdbRoutes } = await import('./routes/tmdb.js');
const { getDeployInfo } = await import('./lib/deployInfo.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// CORS: the UI is served by this same process, so cross-origin access is off
// unless ALLOWED_ORIGINS is set explicitly (e.g. for the Vite dev server).
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
if (allowedOrigins?.length) {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}

app.use(express.json({ limit: '100kb' }));

// CSRF guard. The API has no login, so without this any web page opened on a
// LAN device could POST to it (e.g. /api/omv/power/shutdown). Browsers can't
// add a custom header to a cross-origin request without a CORS preflight, which
// we don't grant — so requiring one blocks cross-site writes.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') === 'dashboard') return next();
  res.status(403).json({ error: 'Missing X-Requested-With header' });
});

app.use('/api/qbittorrent', qbittorrentRoutes);
app.use('/api/omv', systemRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/shows', showsRoutes);
app.use('/api/tmdb', tmdbRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    platform: process.platform,
    nodeVersion: process.version,
    ...getDeployInfo(),
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
});

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath, {
    index: false,
    setHeaders(res, filePath) {
      const rel = path.relative(frontendPath, filePath);
      if (rel.startsWith('assets/')) {
        // Content-hashed file names: cache forever.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // index.html, sw.js, manifest: always revalidate so updates roll out.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Central error handler: JSON errors with a sensible status code.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.response?.status || 500;
  const upstream = err.response ? ` (upstream ${err.response.status})` : '';
  console.error(`${req.method} ${req.originalUrl} → ${status}: ${err.message}${upstream}`);
  if (res.headersSent) return;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: err.message });
});

const server = app.listen(PORT, HOST, () => {
  const info = getDeployInfo();
  console.log(`Server running on ${HOST}:${PORT} (${process.env.NODE_ENV || 'development'}, commit ${info.commit || 'unknown'})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  stopShowTimers();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
