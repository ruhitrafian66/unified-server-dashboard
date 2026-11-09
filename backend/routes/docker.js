import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execFileAsync = promisify(execFile);

router.get('/containers', async (req, res) => {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--format', '{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}'],
      { timeout: 5000 },
    );
    const containers = stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name, state, status, image] = line.split('|');
      return {
        name,
        state,
        status,
        image: image.split(':')[0].split('/').pop(),
        running: state === 'running',
      };
    });
    res.json({ containers });
  } catch (error) {
    console.error('Error fetching Docker containers:', error.message);
    res.status(500).json({ error: error.message, containers: [] });
  }
});

export default router;
