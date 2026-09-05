import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STATE_FILES = ['data/jobs.json', 'data/changes.json', 'data/history.json', 'data/last-run.json'];
const SITE_FILES = ['docs/data/stats.json', 'docs/data/jobs.min.json'];
const CONTEXT_FILE = '.crawl-context.json';
const STATE_REF = 'refs/heads/crawl-state';
const MAIN_REF = 'refs/heads/main';
const diskPath = (cwd, file) => path.join(cwd, ...file.split('/'));
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const timestamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const date = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && timestamp(v);
const success = (v) => v === 'success' || v === 'baseline';

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], ...options,
  }).trim();
}

function check(condition, message) {
  if (!condition) throw new Error(`Invalid crawl state: ${message}`);
}

/** Reject malformed snapshots before writing any restored or published file. */
export function validateState(state) {
  const [jobs, changes, history, lastRun] = STATE_FILES.map((file) => state[file]);
  check(Array.isArray(jobs) && jobs.length > 0, 'jobs must be a nonempty array');
  const ids = new Set();
  for (const job of jobs) {
    check(object(job) && typeof job.id === 'string' && job.id.length > 0 && !ids.has(job.id), 'job IDs must be unique strings');
    ids.add(job.id);
    check(['open', 'closed'].includes(job.status) && typeof job.title === 'string', `job ${job.id} status/title`);
    check(timestamp(job.firstSeenAt) && timestamp(job.lastSeenAt), `job ${job.id} observation dates`);
    check(Array.isArray(job.locations), `job ${job.id} locations`);
    check(job.status !== 'closed' || timestamp(job.closedAt), `job ${job.id} closure date`);
    check(job.status !== 'open' || (job.hasDetail === true && typeof job.descriptionHtml === 'string' &&
      job.descriptionHtml.trim().length > 0 && timestamp(job.detailFetchedAt)), `job ${job.id} missing details`);
  }
  check(Array.isArray(changes) && changes.length > 0, 'changes must contain a completed run');
  for (const run of changes) {
    check(object(run) && success(run.status) && date(run.date) && timestamp(run.finishedAt), 'change run metadata');
    check(count(run.openCount) && run.openCount > 0 && run.missingDetail === 0, 'change run coverage');
    check(object(run.errors) && run.errors.searchPages === 0 && run.errors.details === 0, 'change run errors');
    for (const [key, counter] of [['added', 'addedCount'], ['removed', 'removedCount'], ['updated', 'updatedCount']]) {
      check(Array.isArray(run[key]) && count(run[counter]) && run[key].length === run[counter], `change run ${key}`);
      check(run[key].every((item) => object(item) && typeof item.id === 'string' &&
        (key !== 'updated' || object(item.changed))), `change run ${key} entries`);
    }
    check(run.status !== 'baseline' || (run.addedCount === 0 && run.removedCount === 0 && run.updatedCount === 0),
      'baseline must not claim observed changes');
  }
  check(Array.isArray(history) && history.length > 0, 'history must contain an aggregate');
  const dates = new Set();
  for (const day of history) {
    check(object(day) && date(day.date) && !dates.has(day.date) && timestamp(day.at), 'history dates');
    dates.add(day.date);
    check(['totalOpen', 'added', 'removed', 'updated'].every((key) => count(day[key])), 'history counts');
    check(['themes', 'professions', 'orgs'].every((key) => object(day[key]) &&
      Object.values(day[key]).every(count)), 'history dimensions');
  }
  check(object(lastRun) && success(lastRun.status) && timestamp(lastRun.finishedAt), 'last-run metadata');
  check(lastRun.status === changes[0].status && lastRun.finishedAt === changes[0].finishedAt, 'last-run does not match latest changes');
  check(lastRun.openCount === jobs.filter((job) => job.status === 'open').length &&
    lastRun.openCount === changes[0].openCount && lastRun.openCount > 0, 'open counts disagree');
  check(lastRun.missingDetail === 0 && object(lastRun.errors) &&
    lastRun.errors.searchPages === 0 && lastRun.errors.details === 0, 'last run was incomplete');
  for (const [key, counter] of [['added', 'addedCount'], ['removed', 'removedCount'], ['updated', 'updatedCount']]) {
    check(lastRun[key] === changes[0][counter], `last-run ${key} count`);
  }
  const latestDay = history.find((day) => day.date === changes[0].date);
  check(latestDay && latestDay.at === lastRun.finishedAt && latestDay.totalOpen === lastRun.openCount &&
    ['added', 'removed', 'updated'].every((key) => latestDay[key] === lastRun[key]), 'history does not match latest run');
  return state;
}

export function restoreState({ cwd = process.cwd(), bootstrap = false } = {}) {
  const head = git(cwd, ['rev-parse', 'HEAD']);
  git(cwd, ['fetch', '--no-tags', 'origin', MAIN_REF]);
  if (git(cwd, ['rev-parse', 'FETCH_HEAD']) !== head) {
    throw new Error('Checkout is not current origin/main; start a new workflow run.');
  }
  let exists = true;
  try {
    git(cwd, ['ls-remote', '--exit-code', '--heads', 'origin', STATE_REF]);
  } catch (err) {
    if (err.status !== 2) throw err;
    exists = false;
  }
  let stateHead = null;
  let state;
  if (exists) {
    git(cwd, ['fetch', '--no-tags', 'origin', STATE_REF]);
    stateHead = git(cwd, ['rev-parse', 'FETCH_HEAD']);
    state = Object.fromEntries(STATE_FILES.map((file) => [
      file, JSON.parse(git(cwd, ['show', `${stateHead}:${file}`])),
    ]));
    validateState(state);
  } else {
    if (!bootstrap) throw new Error('crawl-state is missing. Use workflow_dispatch with bootstrap=true for an explicit baseline.');
    state = {
      'data/jobs.json': [], 'data/changes.json': [], 'data/history.json': [],
      'data/last-run.json': { status: 'bootstrap-pending' },
    };
  }
  for (const [file, value] of Object.entries(state)) {
    fs.mkdirSync(path.dirname(diskPath(cwd, file)), { recursive: true });
    fs.writeFileSync(diskPath(cwd, file), JSON.stringify(value));
  }
  const context = { head, stateHead, baseline: !exists };
  fs.writeFileSync(path.join(cwd, CONTEXT_FILE), JSON.stringify(context));
  console.log(exists ? `Restored durable state ${stateHead}` : 'Explicit baseline: no additions will be reported.');
  return context;
}

function makeCommit(cwd, files, parent, message, empty = false) {
  const index = path.join(cwd, `.crawl-index-${crypto.randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(cwd, ['read-tree', empty ? '--empty' : parent], { env });
    git(cwd, ['add', '-f', '--', ...files], { env });
    const tree = git(cwd, ['write-tree'], { env });
    if (parent && !empty && tree === git(cwd, ['rev-parse', `${parent}^{tree}`])) return parent;
    return git(cwd, [
      '-c', 'user.name=github-actions[bot]',
      '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message,
      '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    ], { env });
  } finally {
    fs.rmSync(index, { force: true });
    fs.rmSync(`${index}.lock`, { force: true });
  }
}

export function publishState({ cwd = process.cwd() } = {}) {
  const context = JSON.parse(fs.readFileSync(path.join(cwd, CONTEXT_FILE), 'utf8'));
  check(object(context) && /^[a-f0-9]{40,64}$/.test(context.head) &&
    (context.stateHead === null || /^[a-f0-9]{40,64}$/.test(context.stateHead)), 'restore context');
  if (git(cwd, ['rev-parse', 'HEAD']) !== context.head) throw new Error('Source checkout changed since restore.');
  const state = validateState(Object.fromEntries(STATE_FILES.map((file) => [
    file, JSON.parse(fs.readFileSync(diskPath(cwd, file), 'utf8')),
  ])));
  const run = state['data/last-run.json'];
  check((run.status === 'baseline') === context.baseline, 'baseline status does not match restore');
  for (const file of SITE_FILES) JSON.parse(fs.readFileSync(diskPath(cwd, file), 'utf8'));
  const mainCommit = makeCommit(cwd, SITE_FILES, context.head, `data: daily crawl ${run.finishedAt}`);
  const stateCommit = makeCommit(cwd, STATE_FILES, context.stateHead, `state: ${run.status} ${run.finishedAt}`, true);
  // No force: either both refs fast-forward or neither moves, including when source changes during collection.
  git(cwd, ['push', '--atomic', 'origin', `${mainCommit}:${MAIN_REF}`, `${stateCommit}:${STATE_REF}`]);
  fs.rmSync(path.join(cwd, CONTEXT_FILE));
  console.log(`Published site ${mainCommit} and durable state ${stateCommit} atomically.`);
  return { mainCommit, stateCommit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'restore') {
      const { baseline } = restoreState({ bootstrap: process.argv.includes('--bootstrap') });
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `baseline=${baseline}\n`);
    } else if (process.argv[2] === 'publish') {
      publishState();
    } else {
      throw new Error('Usage: node src/automation.mjs restore [--bootstrap] | publish');
    }
  } catch (err) {
    console.error(`Automation failed: ${err.message}`);
    if (err.stderr) console.error(String(err.stderr));
    process.exitCode = 1;
  }
}
