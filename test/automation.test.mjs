import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { STATE_FILES, restoreState, publishState, validateState } from '../src/automation.mjs';
import { readJson } from '../src/store.mjs';
import { buildRecord, fetchAllSummaries, IncompleteIndexError, syncJobs } from '../src/scrape.mjs';
import { fetchSearchPage } from '../src/api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = '2026-09-05T22:01:00.000Z';
const git = (cwd, ...args) => execFileSync('git', [
  ...(cwd.endsWith('remote.git') ? [`--git-dir=${cwd}`] : []), ...args,
], {
  cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
function write(cwd, file, content) {
  const dest = path.join(cwd, ...file.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, typeof content === 'string' ? content : JSON.stringify(content));
}
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(ROOT, '.automation-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function snapshot(status = 'baseline') {
  const job = {
    ...buildRecord({ id: '1', name: 'Engineer', locations: [] }, { jobDescription: '<p>Build services</p>' }),
    firstSeenAt: now, lastSeenAt: now, detailFetchedAt: now,
  };
  const run = {
    status, date: now.slice(0, 10), finishedAt: now, openCount: 1, missingDetail: 0,
    addedCount: 0, removedCount: 0, updatedCount: 0,
    added: [], removed: [], updated: [], errors: { searchPages: 0, details: 0 },
  };
  return {
    'data/jobs.json': [job], 'data/changes.json': [run],
    'data/history.json': [{
      date: run.date, at: now, totalOpen: 1, added: 0, removed: 0, updated: 0,
      themes: {}, professions: {}, orgs: {},
    }],
    'data/last-run.json': {
      status, finishedAt: now, openCount: 1, missingDetail: 0,
      added: 0, removed: 0, updated: 0, errors: run.errors,
    },
  };
}
function putSnapshot(cwd, status = 'baseline') {
  for (const [file, value] of Object.entries(snapshot(status))) write(cwd, file, value);
  write(cwd, 'docs/data/stats.json', { generatedAt: now });
  write(cwd, 'docs/data/jobs.min.json', [{ id: '1' }]);
}
function repository(t) {
  const base = scratch(t);
  const remote = path.join(base, 'remote.git');
  const cwd = path.join(base, 'checkout');
  git(base, 'init', '--bare', remote);
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(base, 'init', '-b', 'main', cwd);
  git(cwd, 'config', 'user.name', 'Automation Test');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  write(cwd, '.gitignore', '/data/\n');
  write(cwd, 'source.txt', 'source stays intact');
  write(cwd, 'docs/data/stats.json', {});
  write(cwd, 'docs/data/jobs.min.json', []);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'fixture');
  git(cwd, 'remote', 'add', 'origin', remote);
  git(cwd, 'push', 'origin', 'main');
  return { cwd, remote, base };
}
function clone(base, remote, name = 'reader') {
  const cwd = path.join(base, name);
  git(base, 'clone', remote, cwd);
  git(cwd, 'config', 'user.name', 'Automation Test');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  return cwd;
}

test('readJson defaults only for absent files, never malformed or inaccessible inputs', (t) => {
  const cwd = scratch(t);
  assert.deepEqual(readJson(path.join(cwd, 'absent.json'), []), []);
  write(cwd, 'bad.json', '{broken');
  assert.throws(() => readJson(path.join(cwd, 'bad.json'), []), SyntaxError);
  assert.throws(() => readJson(cwd, []));
});

test('strict index refuses invalid totals, duplicate coverage, and any failed page', async () => {
  for (const total of [0, -1, '1', NaN]) {
    await assert.rejects(fetchAllSummaries({ strict: true }, async () => ({ total, positions: [] })), IncompleteIndexError);
  }
  await assert.rejects(fetchAllSummaries({ strict: true }, async () => ({
    total: 2, sortBy: 'timestamp', positions: [{ id: '1' }, { id: '1' }],
  })), /unique jobs/);
  await assert.rejects(fetchAllSummaries({ strict: true }, async (start) => {
    if (start === 10) throw new Error('failed page');
    return { total: 510, sortBy: 'timestamp', positions: Array.from({ length: 10 }, (_, i) => ({ id: String(start + i) })) };
  }), /1\/51 search pages failed/);
  await assert.rejects(fetchAllSummaries({ strict: true }, async (start) => ({
    total: start ? 19 : 20, sortBy: 'timestamp', positions: [{ id: String(start) }],
  })), /Reported count changed/);
});

test('API requests the frontend-supported Latest ordering and preserves its acknowledgement', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).searchParams.get('sort_by'), 'timestamp');
    assert.equal(new URL(url).searchParams.get('start'), '5');
    return {
      ok: true, headers: { get: () => 'application/json' },
      json: async () => ({ data: { count: 1, sortBy: 'timestamp', positions: [{ id: '1' }] } }),
    };
  });
  const page = await fetchSearchPage(5);
  assert.equal(page.sortBy, 'timestamp');
});

test('strict enumeration reconciles duplicate boundary rows using supported overlapping offsets', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 1) }));
  const requested = [];
  const result = await fetchAllSummaries({ strict: true }, async (start, options) => {
    assert.equal(options.sortBy, 'timestamp');
    requested.push(start);
    return {
      total: 15, sortBy: 'timestamp',
      positions: start === 10 ? rows.slice(9, 14) : rows.slice(start, start + 10),
    };
  });
  assert.equal(result.summaries.length, 15);
  assert.equal(result.index.passes, 2);
  assert.equal(result.index.status, 'complete');
  assert.ok(requested.includes(5));
  assert.equal(result.index.requests, requested.length);
});

test('strict enumeration never unions incomplete passes to fabricate full coverage', async () => {
  const passes = [['1', '2', '2'], ['2', '3', '3'], ['1', '3', '3']];
  let calls = 0;
  await assert.rejects(fetchAllSummaries({ strict: true }, async () => ({
    total: 3, sortBy: 'timestamp', positions: passes[calls++].map((id) => ({ id })),
  })), /Incomplete after 3 independent passes/);
  assert.equal(calls, 3);
});

test('historical 2204-reported/2103-unique shape reaches reconciliation instead of immediate abort', async () => {
  let starts = 0;
  const result = await fetchAllSummaries({ strict: true }, async (start) => {
    if (start === 0) starts++;
    return {
      total: 2204, sortBy: 'timestamp',
      positions: Array.from({ length: Math.min(10, 2204 - start) }, (_, i) => ({
        id: String(starts === 1 ? (start + i) % 2103 : start + i),
      })),
    };
  });
  assert.equal(result.index.passes, 2);
  assert.equal(result.summaries.length, 2204);
  assert.equal(result.index.uniqueCount, result.index.reportedTotal);
});

test('strict enumeration restarts when a count changes rather than reconciling different snapshots', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 1) }));
  let starts = 0;
  const result = await fetchAllSummaries({ strict: true }, async (start) => {
    if (start === 0) starts++;
    return {
      total: starts === 1 && start > 0 ? 14 : 15,
      sortBy: 'timestamp', positions: rows.slice(start, start + 10),
    };
  });
  assert.equal(result.index.passes, 2);
  assert.equal(result.summaries.length, 15);
});

test('strict enumeration checks fresh boundaries and discards IDs from a changed pass', async () => {
  let starts = 0;
  const result = await fetchAllSummaries({ strict: true }, async (start) => {
    if (start === 0) starts++;
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: String(i + (starts >= 2 ? 2 : 1)) }));
    return { total: 15, sortBy: 'timestamp', positions: rows.slice(start, start + 10) };
  });
  assert.equal(result.index.passes, 2);
  assert.equal(result.summaries.some((row) => row.id === '1'), false);
  assert.equal(result.summaries.some((row) => row.id === '16'), true);
});

test('strict enumeration rejects a server fallback to relevance ordering', async () => {
  await assert.rejects(fetchAllSummaries({ strict: true }, async () => ({
    total: 1, sortBy: 'relevance', positions: [{ id: '1' }],
  })), /did not acknowledge/);
});

test('index-only diagnostics can reduce but never exceed the bounded pass count', async () => {
  let calls = 0;
  const duplicatePage = async () => {
    calls++;
    return { total: 2, sortBy: 'timestamp', positions: [{ id: '1' }, { id: '1' }] };
  };
  await assert.rejects(fetchAllSummaries({ strict: true, maxIndexPasses: 1 }, duplicatePage), /Incomplete after 1 independent passes/);
  assert.equal(calls, 1);
  for (const maxIndexPasses of [0, -1, 4, 1.5]) {
    await assert.rejects(fetchAllSummaries({ strict: true, maxIndexPasses }, duplicatePage), /Index passes must be between/);
  }
  assert.equal(calls, 1);
});

test('strict collection refuses incomplete detail data and never checkpoints', async () => {
  let checkpoints = 0;
  const opts = { full: true, strict: true, budget: 0, onCheckpoint: () => checkpoints++ };
  const fetchPage = async () => ({ total: 1, sortBy: 'timestamp', positions: [{ id: '1', name: 'Engineer' }] });
  for (const fetchDetail of [async () => null, async () => ({}), async () => ({ jobDescription: '' }),
    async () => { throw new Error('detail unavailable'); }]) {
    await assert.rejects(syncJobs(new Map(), opts, { fetchPage, fetchDetail, sleep: async () => {} }), /Incomplete detail collection/);
  }
  assert.equal(checkpoints, 0);
  await assert.rejects(syncJobs(new Map(), { strict: true, full: true, budget: 1 }), /requires --full/);
  await assert.rejects(syncJobs(new Map(), { strict: true, full: true, budget: 0, limit: 1 }), /requires --full/);
});

test('complete full collection detects additions, closures, and description edits', async () => {
  const before = buildRecord({ id: '1', name: 'Engineer' }, { jobDescription: 'Original description' });
  const closed = buildRecord({ id: '2', name: 'Old role' }, { jobDescription: 'Old description' });
  const { jobs, run } = await syncJobs(new Map([['1', before], ['2', closed]]),
    { strict: true, full: true, budget: 0 }, {
      fetchPage: async () => ({ total: 2, sortBy: 'timestamp', positions: [{ id: '1', name: 'Engineer' }, { id: '3', name: 'New role' }] }),
      fetchDetail: async () => ({ jobDescription: 'Changed description' }),
    });
  assert.equal(run.addedCount, 1);
  assert.equal(run.removedCount, 1);
  assert.equal(run.updatedCount, 1);
  assert.ok(run.updated[0].changed.descriptionHash);
  assert.equal(jobs.get('2').status, 'closed');
  assert.equal(run.missingDetail, 0);
});

const strictOptions = { strict: true, full: true, budget: 0 };
function indexSnapshots(snapshots) {
  let calls = 0;
  return async (start, options) => {
    assert.equal(start, 0);
    assert.equal(options.sortBy, 'timestamp');
    // Each small complete index requires both enumeration and a boundary check.
    const positions = snapshots[Math.min(Math.floor(calls++ / 2), snapshots.length - 1)];
    return { total: positions.length, sortBy: 'timestamp', positions };
  };
}

test('strict recovery delays once and retries only failed details, preserving original diagnostics', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const calls = [];
  let delays = 0;
  let pageCalls = 0;
  const fetchPage = indexSnapshots([[{ id: '1' }, { id: '2' }]]);
  const { jobs, run } = await syncJobs(new Map(), strictOptions, {
    fetchPage: (...args) => { pageCalls++; return fetchPage(...args); },
    fetchDetail: async (id) => {
      calls.push(id);
      if (id === '2' && calls.filter((value) => value === id).length === 1) {
        throw new Error('original connection reset');
      }
      return { jobDescription: `Fresh description ${id}` };
    },
    sleep: async (ms) => { assert.equal(ms, 30_000); delays++; },
  });
  assert.deepEqual(calls, ['1', '2', '2']);
  assert.equal(delays, 1);
  assert.equal(pageCalls, 2, 'no index refresh after recovered details');
  assert.equal(run.detailsFetched, 2);
  assert.equal(run.errors.details, 0);
  assert.equal(run.missingDetail, 0);
  assert.equal(jobs.get('2').descriptionHtml, 'Fresh description 2');
  assert.ok(warnings.some((line) => line.includes('"id":"2"') && line.includes('original connection reset')));
});

test('strict refresh reconciles disappearances and new IDs against original state with exact fetch timestamps', async (t) => {
  const start = Date.parse(now);
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const original = ['1', '2', '4', '5'].map((id) => [
    id, buildRecord({ id, name: `Original ${id}` }, { jobDescription: `Old description ${id}` }),
  ]);
  original[3][1].status = 'closed';
  const existing = new Map(original);
  const before = structuredClone(existing);
  const calls = [];
  let pageCalls = 0;
  let delays = 0;
  const fetchPage = indexSnapshots([
    [{ id: '1', name: 'Interim title' }, { id: '2' }, { id: '4' }, { id: '6' }],
    [{ id: '1', name: 'Final title' }, { id: '3', name: 'New role' }, { id: '5', name: 'Reopened' }],
  ]);
  const { jobs, run } = await syncJobs(existing, strictOptions, {
    fetchPage: (...args) => { pageCalls++; return fetchPage(...args); },
    fetchDetail: async (id) => {
      calls.push(id);
      if (id === '2' || id === '6') throw new Error(`HTTP 404 for ${id}`);
      return { jobDescription: `Fresh description ${id}` };
    },
    sleep: async () => { delays++; t.mock.timers.tick(30_000); },
  });
  assert.equal(pageCalls, 4);
  assert.equal(delays, 1);
  assert.deepEqual(calls, ['6', '1', '2', '4', '6', '2', '3', '5']);
  assert.deepEqual(existing, before, 'never mutate the durable input');
  assert.equal(jobs.get('1').detailFetchedAt, now, 'reused detail keeps its actual successful timestamp');
  assert.equal(jobs.get('3').detailFetchedAt, new Date(start + 30_000).toISOString());
  assert.equal(jobs.get('1').firstSeenAt, before.get('1').firstSeenAt);
  assert.equal(jobs.get('5').firstSeenAt, new Date(start + 30_000).toISOString());
  assert.equal(jobs.get('1').title, 'Final title');
  assert.equal(jobs.get('2').status, 'closed');
  assert.equal(jobs.get('2').descriptionHtml, before.get('2').descriptionHtml);
  assert.equal(jobs.get('4').descriptionHash, before.get('4').descriptionHash, 'closure keeps durable record, not interim detail');
  assert.equal(jobs.has('6'), false, 'unseen disappeared job is neither added nor closed');
  assert.deepEqual(run.added.map((j) => j.id), ['3', '5']);
  assert.deepEqual(run.removed.map((j) => j.id), ['2', '4']);
  assert.equal(run.updatedCount, 1);
  assert.deepEqual(run.updated[0].changed.title, { from: 'Original 1', to: 'Final title' });
  assert.deepEqual(run.updated[0].changed.descriptionHash, {
    from: before.get('1').descriptionHash, to: jobs.get('1').descriptionHash,
  });
  assert.equal(run.detailsFetched, 3, 'count unique successful details in final open index only');
  assert.equal(run.openCount, 3);
  assert.equal(run.reportedTotal, 3);
  assert.equal(run.missingDetail, 0);
  assert.equal(run.errors.details, 0);
  assert.deepEqual(run.index, {
    status: 'complete', sortBy: 'timestamp', passes: 1, requests: 2, uniqueCount: 3, reportedTotal: 3,
  });
});

test('strict recovery refuses still-listed failures rather than accepting cached details or inferring closure', async () => {
  for (const status of [403, 404]) {
    const original = buildRecord({ id: '1' }, { jobDescription: 'Cached complete description' });
    const existing = new Map([['1', original]]);
    const before = structuredClone(existing);
    let calls = 0;
    let pageCalls = 0;
    let checkpoints = 0;
    const fetchPage = indexSnapshots([[{ id: '1' }]]);
    await assert.rejects(syncJobs(existing, { ...strictOptions, onCheckpoint: () => checkpoints++ }, {
      fetchPage: (...args) => { pageCalls++; return fetchPage(...args); },
      fetchDetail: async () => { calls++; throw new Error(`HTTP ${status}: original cause`); },
      sleep: async () => {},
    }), (error) => {
      assert.match(error.message, /Incomplete detail collection: 0\/1 fetched/);
      assert.ok(error.message.includes(`"id":"1","error":"HTTP ${status}: original cause"`));
      return true;
    });
    assert.equal(calls, 2);
    assert.equal(pageCalls, 4);
    assert.equal(checkpoints, 0);
    assert.deepEqual(existing, before);
  }
});

test('strict recovery cannot infer disappearance from an incomplete refreshed index', async () => {
  let pages = 0;
  let details = 0;
  await assert.rejects(syncJobs(new Map(), strictOptions, {
    fetchPage: async () => (++pages <= 2
      ? { total: 1, sortBy: 'timestamp', positions: [{ id: '1' }] }
      : { total: 2, sortBy: 'timestamp', positions: [{ id: '2' }, { id: '2' }] }),
    fetchDetail: async () => { details++; throw new Error('HTTP 404'); },
    sleep: async () => {},
  }), IncompleteIndexError);
  assert.equal(pages, 5, 'refreshed enumeration retains three independent pass bound');
  assert.equal(details, 2);
});

test('strict recovery aborts on a newly discovered detail failure without another recovery cycle', async () => {
  let delays = 0;
  const calls = [];
  let pageCalls = 0;
  const fetchPage = indexSnapshots([[{ id: '1' }], [{ id: '2' }]]);
  await assert.rejects(syncJobs(new Map(), strictOptions, {
    fetchPage: (...args) => { pageCalls++; return fetchPage(...args); },
    fetchDetail: async (id) => { calls.push(id); throw new Error(`Unavailable ${id}`); },
    sleep: async () => { delays++; },
  }), /"id":"2","error":"Unavailable 2"/);
  assert.deepEqual(calls, ['1', '1', '2']);
  assert.equal(delays, 1);
  assert.equal(pageCalls, 4);
});

test('local incremental collection retains capped detail fetching and checkpoints', async () => {
  let checkpoints = 0;
  const { run } = await syncJobs(new Map(), { budget: 1, onCheckpoint: () => checkpoints++ }, {
    fetchPage: async () => ({ total: 2, positions: [{ id: '1', name: 'One' }, { id: '2', name: 'Two' }] }),
    fetchDetail: async () => ({ jobDescription: 'A complete description' }),
  });
  assert.equal(run.detailsFetched, 1);
  assert.equal(run.missingDetail, 1);
  assert.equal(checkpoints, 1);
});

test('local incremental detail failures keep cached data without strict recovery requests', async () => {
  const previous = buildRecord({ id: '1' }, { jobDescription: 'Cached description' });
  previous.detailFetchedAt = '2000-01-01T00:00:00.000Z';
  let pages = 0;
  let details = 0;
  const { jobs, run } = await syncJobs(new Map([['1', previous]]), { budget: 0 }, {
    fetchPage: async () => { pages++; return { total: 1, positions: [{ id: '1' }] }; },
    fetchDetail: async () => { details++; throw new Error('offline'); },
    sleep: async () => assert.fail('incremental mode must not enter strict recovery'),
  });
  assert.equal(pages, 1);
  assert.equal(details, 1);
  assert.equal(run.detailsFetched, 0);
  assert.equal(run.errors.details, 1);
  assert.equal(jobs.get('1').descriptionHtml, previous.descriptionHtml);
  assert.equal(jobs.get('1').detailFetchedAt, previous.detailFetchedAt);
});

test('state validation rejects corrupt shapes and inconsistent comparisons', () => {
  validateState(snapshot());
  for (const mutate of [
    (s) => { s['data/jobs.json'] = {}; },
    (s) => { s['data/jobs.json'].push(s['data/jobs.json'][0]); },
    (s) => { s['data/jobs.json'][0].hasDetail = false; },
    (s) => { s['data/jobs.json'][0].firstSeenAt = 'invalid'; },
    (s) => { s['data/changes.json'][0].addedCount = 1; },
    (s) => { s['data/history.json'] = []; },
    (s) => { s['data/history.json'][0].totalOpen = 9; },
    (s) => { s['data/last-run.json'].errors.details = 1; },
    (s) => { s['data/last-run.json'].status = 'failed'; },
  ]) {
    const state = snapshot();
    mutate(state);
    assert.throws(() => validateState(state), /Invalid crawl state/);
  }
});

test('missing remote state fails closed and explicit bootstrap discards stale local cache', (t) => {
  const { cwd } = repository(t);
  write(cwd, 'data/jobs.json', ['stale cache']);
  assert.throws(() => restoreState({ cwd }), /bootstrap=true/);
  assert.deepEqual(readJson(path.join(cwd, 'data', 'jobs.json')), ['stale cache']);
  const context = restoreState({ cwd, bootstrap: true });
  assert.equal(context.baseline, true);
  assert.deepEqual(readJson(path.join(cwd, 'data', 'jobs.json')), []);
  assert.throws(() => publishState({ cwd }), /jobs must be a nonempty array/);
});

test('atomic publication persists only named files and leaves caller index and source intact', (t) => {
  const { cwd, remote, base } = repository(t);
  restoreState({ cwd, bootstrap: true });
  putSnapshot(cwd);
  write(cwd, 'data/private.log', 'not state');
  write(cwd, 'unrelated.txt', 'staged user edit');
  git(cwd, 'add', 'unrelated.txt');
  const index = fs.readFileSync(path.join(cwd, '.git', 'index'));
  const head = git(cwd, 'rev-parse', 'HEAD');
  const result = publishState({ cwd });
  assert.deepEqual(fs.readFileSync(path.join(cwd, '.git', 'index')), index);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), head);
  assert.equal(git(remote, 'rev-parse', 'main'), result.mainCommit);
  assert.equal(git(remote, 'rev-parse', 'crawl-state'), result.stateCommit);
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'crawl-state').split('\n').sort(), [...STATE_FILES].sort());
  assert.equal(git(remote, 'show', 'main:source.txt'), 'source stays intact');
  assert.ok(!git(remote, 'ls-tree', '-r', '--name-only', 'main').includes('unrelated'));
  const reader = clone(base, remote);
  const context = restoreState({ cwd: reader, bootstrap: true });
  assert.equal(context.baseline, false, 'bootstrap must not reset an existing branch');
  assert.equal(context.stateHead, result.stateCommit);
  assert.deepEqual(readJson(path.join(reader, 'data', 'jobs.json')), snapshot()['data/jobs.json']);
  putSnapshot(reader, 'success');
  const next = publishState({ cwd: reader });
  assert.equal(git(remote, 'rev-parse', `${next.stateCommit}^`), result.stateCommit);
});

test('concurrent source push rejects both state and generated-site updates', (t) => {
  const { cwd, remote, base } = repository(t);
  restoreState({ cwd, bootstrap: true });
  putSnapshot(cwd);
  const other = clone(base, remote);
  write(other, 'source.txt', 'concurrent change');
  git(other, 'add', 'source.txt');
  git(other, 'commit', '-m', 'concurrent change');
  git(other, 'push', 'origin', 'main');
  const main = git(remote, 'rev-parse', 'main');
  assert.throws(() => publishState({ cwd }), /Command failed/);
  assert.equal(git(remote, 'rev-parse', 'main'), main);
  assert.equal(git(remote, 'ls-remote', '--heads', remote, 'refs/heads/crawl-state'), '');
  assert.throws(() => restoreState({ cwd }), /not current origin\/main/);
});

test('concurrent state push rejects both refs without force-overwriting history', (t) => {
  const { cwd, remote, base } = repository(t);
  restoreState({ cwd, bootstrap: true });
  putSnapshot(cwd);
  publishState({ cwd });
  const first = clone(base, remote, 'first');
  const second = clone(base, remote, 'second');
  restoreState({ cwd: first });
  restoreState({ cwd: second });
  putSnapshot(first, 'success');
  putSnapshot(second, 'success');
  write(second, 'docs/data/stats.json', { version: 'second' });
  write(first, 'data/jobs.json', [{ ...snapshot()['data/jobs.json'][0], title: 'First contender' }]);
  publishState({ cwd: first });
  const main = git(remote, 'rev-parse', 'main');
  const state = git(remote, 'rev-parse', 'crawl-state');
  assert.throws(() => publishState({ cwd: second }), /Command failed/);
  assert.equal(git(remote, 'rev-parse', 'main'), main);
  assert.equal(git(remote, 'rev-parse', 'crawl-state'), state);
});

test('existing corrupt remote state cannot be bypassed by bootstrap or stale local files', (t) => {
  const { cwd, remote, base } = repository(t);
  git(cwd, 'push', 'origin', 'HEAD:refs/heads/crawl-state');
  const reader = clone(base, remote);
  write(reader, 'data/jobs.json', ['stale']);
  assert.throws(() => restoreState({ cwd: reader, bootstrap: true }), /Command failed/);
  assert.deepEqual(readJson(path.join(reader, 'data', 'jobs.json')), ['stale']);
});

test('malformed remote JSON leaves every local state file untouched', (t) => {
  const { cwd, remote, base } = repository(t);
  restoreState({ cwd, bootstrap: true });
  putSnapshot(cwd);
  publishState({ cwd });
  const editor = clone(base, remote, 'editor');
  git(editor, 'checkout', 'crawl-state');
  write(editor, 'data/jobs.json', '{invalid');
  git(editor, 'add', 'data/jobs.json');
  git(editor, 'commit', '-m', 'corrupt fixture');
  git(editor, 'push', 'origin', 'crawl-state');
  const reader = clone(base, remote);
  putSnapshot(reader);
  const before = STATE_FILES.map((file) => fs.readFileSync(path.join(reader, ...file.split('/')), 'utf8'));
  assert.throws(() => restoreState({ cwd: reader, bootstrap: true }), SyntaxError);
  assert.deepEqual(STATE_FILES.map((file) => fs.readFileSync(path.join(reader, ...file.split('/')), 'utf8')), before);
});

function runFixture(cwd, args, payload) {
  const script = `
    const payload = ${JSON.stringify(payload)};
    globalThis.fetch = async (url) => ({
      ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => ({ data: String(url).includes('/search?')
        ? { ...payload.index, sortBy: 'timestamp' } : payload.detail })
    });
    process.argv = ['node', ${JSON.stringify(path.join(cwd, 'src', 'daily.mjs'))}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(pathToFileURL(path.join(cwd, 'src', 'daily.mjs')).href)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd, encoding: 'utf8', env: { ...process.env, MSJOBS_DETAIL_BUDGET: '0', MSJOBS_INTERVAL_MS: '1' },
  });
}
function crawlerFixture(t) {
  const cwd = scratch(t);
  fs.cpSync(path.join(ROOT, 'src'), path.join(cwd, 'src'), { recursive: true });
  return cwd;
}

test('daily CLI exits nonzero for incomplete index without modifying any canonical files', (t) => {
  const cwd = crawlerFixture(t);
  putSnapshot(cwd, 'success');
  const before = STATE_FILES.map((file) => fs.readFileSync(path.join(cwd, ...file.split('/')), 'utf8'));
  const result = runFixture(cwd, ['--strict', '--full'], { index: { count: 0, positions: [] } });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Invalid or empty search index/);
  assert.deepEqual(STATE_FILES.map((file) => fs.readFileSync(path.join(cwd, ...file.split('/')), 'utf8')), before);
});

test('daily CLI exits nonzero for missing descriptions without canonical checkpoints', (t) => {
  const cwd = crawlerFixture(t);
  putSnapshot(cwd, 'success');
  const files = [...STATE_FILES, 'docs/data/stats.json', 'docs/data/jobs.min.json'];
  const before = files.map((file) => fs.readFileSync(path.join(cwd, ...file.split('/')), 'utf8'));
  const result = runFixture(cwd, ['--strict', '--full'], {
    index: { count: 1, positions: [{ id: '1', name: 'Engineer' }] }, detail: {},
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Incomplete detail collection/);
  assert.match(result.stderr, /"id":"1","error":"Missing description for 1"/);
  assert.deepEqual(files.map((file) => fs.readFileSync(path.join(cwd, ...file.split('/')), 'utf8')), before);
});

test('daily CLI baseline builds a valid completed snapshot without claiming all jobs are new', (t) => {
  const cwd = crawlerFixture(t);
  const result = runFixture(cwd, ['--strict', '--full', '--baseline'], {
    index: { count: 1, positions: [{ id: '1', name: 'Engineer', locations: [] }] },
    detail: { jobDescription: '<p>Build and support software services.</p>' },
  });
  assert.equal(result.status, 0, result.stderr);
  const state = Object.fromEntries(STATE_FILES.map((file) => [file, readJson(path.join(cwd, ...file.split('/')))]));
  validateState(state);
  assert.equal(state['data/last-run.json'].status, 'baseline');
  assert.equal(state['data/last-run.json'].added, 0);
  assert.equal(state['data/changes.json'][0].added.length, 0);
});
