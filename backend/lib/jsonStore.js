/**
 * Small, safe JSON file store.
 *
 * - Writes are atomic (write to a temp file, then rename), so a crash or power
 *   loss mid-write can never leave a half-written file behind.
 * - All read-modify-write cycles go through `update()`, which serialises them,
 *   so two concurrent requests can't overwrite each other's changes.
 * - A file that exists but can't be parsed is NEVER silently replaced with
 *   defaults: a backup copy is kept and the error is surfaced instead.
 */
import fs from 'fs/promises';
import path from 'path';

export class JsonStore {
  constructor(file, defaults, { mode = 0o600 } = {}) {
    this.file = file;
    this.defaults = defaults;
    this.mode = mode;
    this.chain = Promise.resolve();
    this.backedUpCorruptFile = false;
  }

  async read() {
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return structuredClone(this.defaults);
      throw err;
    }
    try {
      return { ...structuredClone(this.defaults), ...JSON.parse(raw) };
    } catch (err) {
      const backup = `${this.file}.corrupt`;
      if (!this.backedUpCorruptFile) {
        await fs.copyFile(this.file, backup).catch(() => {});
        this.backedUpCorruptFile = true;
      }
      throw new Error(`${path.basename(this.file)} is not valid JSON (${err.message}); a copy was saved to ${backup}`);
    }
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: this.mode });
    await fs.rename(tmp, this.file);
  }

  /** Serialised read → mutate → write. `fn` may mutate `data` and return a value. */
  update(fn) {
    const run = this.chain.then(async () => {
      const data = await this.read();
      const result = await fn(data);
      await this.write(data);
      return result;
    });
    this.chain = run.catch(() => {});
    return run;
  }
}
