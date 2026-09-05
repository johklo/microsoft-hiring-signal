import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const SITE_DIR = path.join(ROOT, 'docs');

export const FILES = {
  jobs: path.join(DATA_DIR, 'jobs.json'),
  stats: path.join(SITE_DIR, 'data', 'stats.json'),
  jobsLite: path.join(SITE_DIR, 'data', 'jobs.min.json'),
  changes: path.join(DATA_DIR, 'changes.json'),
  history: path.join(DATA_DIR, 'history.json'),
  runLog: path.join(DATA_DIR, 'last-run.json'),
};

export function ensureDirs() {
  for (const p of [DATA_DIR, path.join(SITE_DIR, 'data')]) {
    fs.mkdirSync(p, { recursive: true });
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Write atomically so an interrupted run never leaves a truncated data file. */
export function writeJson(file, value, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, pretty ? 2 : 0));
  fs.renameSync(tmp, file);
}
