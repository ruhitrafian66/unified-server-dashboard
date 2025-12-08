import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

// Get Docker container status
router.get('/containers', async (req, res) => {
  try {
    const { stdout } = await execAsync('docker ps -a --format "{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}"');
    
    const containers = stdout.trim().split('\n')
      .filter(line => line)
      .map(line => {
        const [name, state, status, image] = line.split('|');
        return {
          name,
          state,
          status,
          image: image.split(':')[0].split('/').pop(), // Get just the image name
          running: state === 'running'
        };
      });
    
    res.json({ containers });
  } catch (error) {
    console.error('Error fetching Docker containers:', error);
    res.status(500).json({ error: error.message, containers: [] });
  }
});

export default router;
