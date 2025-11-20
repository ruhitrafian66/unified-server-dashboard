import express from 'express';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

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

export default router;
