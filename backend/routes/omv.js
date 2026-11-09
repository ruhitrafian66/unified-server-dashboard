/**
 * Host/system monitoring + power control.
 *
 * Everything here reads /proc, /sys and statfs directly instead of spawning
 * `top`/`free`/`df` on every poll — that matters on a 4-core ARM board.
 * Mounted at /api/omv (legacy name) and /api/system.
 */
import express from 'express';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DOWNLOAD_PATH } from '../lib/config.js';
import { qbGet, getServerUrl } from './qbAuth.js';
import { getDeployInfo } from '../lib/deployInfo.js';

const router = express.Router();
const execFileAsync = promisify(execFile);
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── CPU sampler ─────────────────────────────────────────────────────────────
// Reads /proc/stat every 15s (cheap: one small file read). The "current" value
// is the delta since the previous read; one point per minute goes to history.
const CPU_TICK_MS = 15_000;
const HISTORY_INTERVAL_S = 60;
const CPU_MAX_SAMPLES = 96 * 60; // 4 days at 1/min (~200 KB)

const cpuHistory = [];
let lastStat = null;
let currentCpu = null;
let minuteBucket = [];

const readProcStat = async () => {
  const raw = await fs.readFile('/proc/stat', 'utf8');
  const parts = raw.slice(0, raw.indexOf('\n')).trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
};

const cpuTick = async () => {
  try {
    const stat = await readProcStat();
    if (lastStat) {
      const totalDelta = stat.total - lastStat.total;
      const idleDelta = stat.idle - lastStat.idle;
      currentCpu = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10 : 0;
      minuteBucket.push(currentCpu);
    }
    lastStat = stat;

    const now = Math.floor(Date.now() / 1000);
    const lastT = cpuHistory.at(-1)?.t ?? 0;
    if (minuteBucket.length && now - lastT >= HISTORY_INTERVAL_S) {
      const avg = minuteBucket.reduce((a, b) => a + b, 0) / minuteBucket.length;
      cpuHistory.push({ t: now, v: Math.round(avg * 10) / 10 });
      if (cpuHistory.length > CPU_MAX_SAMPLES) cpuHistory.shift();
      minuteBucket = [];
    }
  } catch (err) {
    console.warn('CPU sample skipped:', err.message);
  }
};

cpuTick();
setTimeout(cpuTick, 1000).unref(); // second read so `current` is available almost at once
setInterval(cpuTick, CPU_TICK_MS).unref();

router.get('/cpu-history', (req, res) => {
  const hours = Math.min(96, Math.max(1, parseInt(req.query.hours, 10) || 6));
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  const start = cpuHistory.findIndex((s) => s.t >= cutoff);
  res.json({ samples: start === -1 ? [] : cpuHistory.slice(start), interval: HISTORY_INTERVAL_S });
});

// ─── Readers ────────────────────────────────────────────────────────────────
const readMemory = async () => {
  const raw = await fs.readFile('/proc/meminfo', 'utf8');
  const kb = (key) => parseInt(raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? '0', 10);
  const total = kb('MemTotal') * 1024;
  const available = kb('MemAvailable') * 1024;
  const swapTotal = kb('SwapTotal') * 1024;
  const swapFree = kb('SwapFree') * 1024;
  return {
    total,
    used: total - available,
    percent: total ? Math.round(((total - available) / total) * 1000) / 10 : 0,
    swapUsed: swapTotal - swapFree,
    swapTotal,
  };
};

const readUptime = async () => {
  const raw = await fs.readFile('/proc/uptime', 'utf8');
  return Math.floor(parseFloat(raw.split(' ')[0]));
};

const readLoad = async () => {
  const raw = await fs.readFile('/proc/loadavg', 'utf8');
  return raw.split(' ').slice(0, 3).map(Number);
};

const readTemperature = async () => {
  try {
    const raw = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return Math.round(parseInt(raw, 10) / 100) / 10;
  } catch {
    return null;
  }
};

const readDisk = async (mountPoint) => {
  const s = await fs.statfs(mountPoint);
  const size = s.blocks * s.bsize;
  const available = s.bavail * s.bsize;
  const used = size - s.bfree * s.bsize;
  return {
    mountPoint,
    size,
    used,
    available,
    percent: size ? Math.round((used / (used + available)) * 1000) / 10 : 0,
  };
};

const MONITORED_SERVICES = (process.env.MONITORED_SERVICES || 'smbd,ssh,dashboard-deploy.timer')
  .split(',').map((s) => s.trim()).filter(Boolean);

const readServices = async () => {
  const { stdout } = await execFileAsync(
    'systemctl',
    ['show', '--property=Id,LoadState,ActiveState,SubState', ...MONITORED_SERVICES],
    { timeout: 5000 },
  );
  return stdout.trim().split('\n\n').map((block) => {
    const p = Object.fromEntries(block.split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
    return { service: p.Id?.replace(/\.service$/, ''), status: p.ActiveState, sub: p.SubState, loaded: p.LoadState };
  }).filter((s) => s.loaded === 'loaded');
};

const readContainers = async () => {
  const { stdout } = await execFileAsync(
    'docker',
    ['ps', '-a', '--format', '{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}'],
    { timeout: 5000 },
  );
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [name, state, status, image] = line.split('|');
    return {
      name,
      state,
      status,
      image: image.split(':')[0].split('/').pop(),
      running: state === 'running',
      healthy: status.includes('(unhealthy)') ? false : status.includes('(healthy)') ? true : null,
    };
  });
};

const readTorrentClient = async () => {
  const { data } = await qbGet('/api/v2/transfer/info');
  return {
    url: getServerUrl(),
    connection: data.connection_status, // connected | firewalled | disconnected
    dhtNodes: data.dht_nodes,
    dlSpeed: data.dl_info_speed,
    upSpeed: data.up_info_speed,
  };
};

const settle = async (promise) => {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

// ─── Aggregated overview: one request per dashboard poll ─────────────────────
router.get('/overview', h(async (req, res) => {
  const [memory, uptime, load, temperature, rootDisk, storage, services, containers, torrentClient] =
    await Promise.all([
      settle(readMemory()),
      settle(readUptime()),
      settle(readLoad()),
      settle(readTemperature()),
      settle(readDisk('/')),
      settle(readDisk(DOWNLOAD_PATH)),
      settle(readServices()),
      settle(readContainers()),
      settle(readTorrentClient()),
    ]);

  const val = (r) => (r.ok ? r.value : null);
  const errors = Object.fromEntries(
    Object.entries({ memory, uptime, load, rootDisk, storage, services, containers, torrentClient })
      .filter(([, r]) => !r.ok)
      .map(([k, r]) => [k, r.error]),
  );

  res.json({
    timestamp: new Date().toISOString(),
    cpu: { percent: currentCpu, cores: (await settle(fs.readdir('/sys/devices/system/cpu'))).value?.filter((d) => /^cpu\d+$/.test(d)).length ?? null },
    memory: val(memory),
    uptime: val(uptime),
    load: val(load),
    temperature: val(temperature),
    disks: { root: val(rootDisk), storage: val(storage) },
    services: val(services) ?? [],
    containers: val(containers) ?? [],
    torrentClient: val(torrentClient),
    deploy: getDeployInfo(),
    errors,
  });
}));

// ─── Legacy endpoints (kept for older cached clients) ────────────────────────
const fmtBytes = (b) => {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)}${units[i]}`;
};
const legacyDisk = (d, device = '') => ({
  device, size: fmtBytes(d.size), used: fmtBytes(d.used), available: fmtBytes(d.available),
  usePercent: `${Math.round(d.percent)}%`, mountPoint: d.mountPoint,
});

router.get('/system', h(async (req, res) => {
  const [mem, up, root] = await Promise.all([readMemory(), readUptime(), readDisk('/')]);
  res.json({
    cpu: String(currentCpu ?? 0),
    memory: `${Math.round(mem.used / 1048576)}/${Math.round(mem.total / 1048576)} MB (${mem.percent}%)`,
    disk: `${fmtBytes(root.used)}/${fmtBytes(root.size)} (${Math.round(root.percent)}%)`,
    uptime: `up ${Math.floor(up / 86400)} days, ${Math.floor((up % 86400) / 3600)} hours`,
  });
}));

router.get('/services', h(async (req, res) => res.json({ services: await readServices() })));
router.get('/storage', h(async (req, res) => res.json(legacyDisk(await readDisk(DOWNLOAD_PATH)))));
router.get('/disks', h(async (req, res) => {
  const disks = await Promise.all(['/', DOWNLOAD_PATH].map((m) => readDisk(m).then((d) => legacyDisk(d))));
  res.json({ disks });
}));

// ─── Power ───────────────────────────────────────────────────────────────────
const POWER_COMMANDS = { reboot: ['reboot'], shutdown: ['poweroff'] };

router.post('/power/:action', (req, res) => {
  const args = POWER_COMMANDS[req.params.action];
  if (!args) return res.status(400).json({ error: 'Invalid action' });

  // Reply first: once the command runs, this process is about to die.
  res.json({ success: true, message: `Server ${req.params.action} in 2 seconds` });
  console.warn(`Power action requested: ${req.params.action} from ${req.ip}`);
  setTimeout(() => {
    execFile('systemctl', args, (err) => {
      if (err) console.error(`Power action ${req.params.action} failed:`, err.message);
    });
  }, 2000);
});

export default router;
