import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

// Get WireGuard interfaces
router.get('/interfaces', async (req, res) => {
  try {
    const { stdout } = await execAsync('wg show interfaces');
    const interfaces = stdout.trim().split(/\s+/).filter(Boolean);
    res.json({ interfaces });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get interface status
router.get('/status/:interface', async (req, res) => {
  try {
    const { interface: iface } = req.params;
    const { stdout } = await execAsync(`wg show ${iface}`);
    res.json({ status: stdout });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start/Stop interface
router.post('/interface/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const { interface: iface } = req.body;
    
    if (action === 'up') {
      await execAsync(`wg-quick up ${iface}`);
    } else if (action === 'down') {
      await execAsync(`wg-quick down ${iface}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get peers
router.get('/peers/:interface', async (req, res) => {
  try {
    const { interface: iface } = req.params;
    const { stdout } = await execAsync(`wg show ${iface} peers`);
    const peers = stdout.trim().split('\n').filter(Boolean);
    res.json({ peers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
