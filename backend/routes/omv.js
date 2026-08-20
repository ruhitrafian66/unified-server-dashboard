import express from 'express';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const router = express.Router();
const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// CPU history — lightweight circular buffer, sampled once per minute.
// Uses /proc/stat directly (a single kernel file read), no process spawning.
// Max 2880 entries = 48 hours at 1 sample/min → ~115 KB RAM ceiling.
// ---------------------------------------------------------------------------
const CPU_SAMPLE_INTERVAL_MS = 60_000;
const CPU_MAX_SAMPLES = 2880; // 2 days

// Circular buffer stored as a plain array we push/shift on.
// Each entry: { t: <unix seconds>, v: <cpu% 0-100 rounded to 1dp> }
const cpuHistory = [];

// Read a single line from /proc/stat and parse idle/total jiffies.
const readProcStat = async () => {
  const raw = await fs.readFile('/proc/stat', 'utf8');
  const line = raw.split('\n')[0]; // "cpu  user nice system idle iowait irq softirq steal guest guest_nice"
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
};

// Take one CPU% sample: two /proc/stat reads 200ms apart → delta.
const takeCpuSample = async () => {
  try {
    const a = await readProcStat();
    await new Promise(r => setTimeout(r, 200));
    const b = await readProcStat();

    const totalDelta = b.total - a.total;
    const idleDelta = b.idle - a.idle;
    const cpuPercent = totalDelta > 0
      ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10
      : 0;

    cpuHistory.push({ t: Math.floor(Date.now() / 1000), v: cpuPercent });
    if (cpuHistory.length > CPU_MAX_SAMPLES) cpuHistory.shift();
  } catch (err) {
    // Non-fatal — skip this sample if /proc/stat is momentarily unreadable.
    console.warn('CPU sample skipped:', err.message);
  }
};

// Kick off the sampler immediately, then every minute.
takeCpuSample();
setInterval(takeCpuSample, CPU_SAMPLE_INTERVAL_MS);

// GET /api/omv/cpu-history?hours=<n>
// Returns the samples that fall within the last <hours> hours (default 6, max 96).
router.get('/cpu-history', (req, res) => {
  const hours = Math.min(96, Math.max(1, parseInt(req.query.hours) || 6));
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  // cpuHistory is chronological so we can slice from the first entry >= cutoff.
  let start = 0;
  for (let i = 0; i < cpuHistory.length; i++) {
    if (cpuHistory[i].t >= cutoff) { start = i; break; }
  }
  res.json({ samples: cpuHistory.slice(start), interval: CPU_SAMPLE_INTERVAL_MS / 1000 });
});

// Get system info
router.get('/system', async (req, res) => {
  try {
    const [cpu, memory, disk, uptime] = await Promise.all([
      execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      execAsync("free -m | awk 'NR==2{printf \"%s/%s MB (%.2f%%)\", $3,$2,$3*100/$2 }'"),
      execAsync("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'"),
      execAsync("uptime -p")
    ]);
    
    res.json({
      cpu: cpu.stdout.trim(),
      memory: memory.stdout.trim(),
      disk: disk.stdout.trim(),
      uptime: uptime.stdout.trim()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get services status
router.get('/services', async (req, res) => {
  try {
    const services = ['smbd', 'nfs-server', 'ssh'];
    const statuses = await Promise.all(
      services.map(async (service) => {
        try {
          const { stdout } = await execAsync(`systemctl is-active ${service}`);
          return { service, status: stdout.trim() };
        } catch {
          return { service, status: 'inactive' };
        }
      })
    );
    res.json({ services: statuses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Power control
router.post('/power/:action', async (req, res) => {
  try {
    const { action } = req.params;
    
    switch (action) {
      case 'reboot':
        await execAsync('sudo reboot');
        break;
      case 'shutdown':
        await execAsync('sudo shutdown -h now');
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get disk usage
router.get('/disks', async (req, res) => {
  try {
    const { stdout } = await execAsync("df -h | grep '^/dev/'");
    const disks = stdout.trim().split('\n').map(line => {
      const parts = line.split(/\s+/);
      return {
        device: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountPoint: parts[5]
      };
    });
    res.json({ disks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SSD storage info (at /mnt/storage)
router.get('/storage', async (req, res) => {
  try {
    const { stdout } = await execAsync("df -h /mnt/storage");
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({ error: 'SSD mount point not found' });
    }
    
    const parts = lines[1].split(/\s+/);
    const storage = {
      device: parts[0],
      size: parts[1],
      used: parts[2],
      available: parts[3],
      usePercent: parts[4],
      mountPoint: parts[5]
    };
    
    res.json(storage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
