/**
 * Which build is running? Read once at startup from the deploy marker the
 * deploy script writes, falling back to the git checkout.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = new Date().toISOString();

const readSha = () => {
  try {
    return fs.readFileSync(path.join(repoDir, '.deploy-sha'), 'utf8').trim();
  } catch {
    try {
      return execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 2000 }).trim();
    } catch {
      return null;
    }
  }
};

const sha = readSha();

export const getDeployInfo = () => ({
  commit: sha ? sha.slice(0, 12) : null,
  startedAt,
  node: process.version,
});
