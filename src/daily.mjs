import { pathToFileURL } from 'node:url';
import { CHANGELOG_RUNS } from './config.mjs';
import { FILES, ensureDirs, readJson, writeJson } from './store.mjs';
import { IncompleteIndexError, syncJobs } from './scrape.mjs';
import { analyze, buildJobsLite } from './analyze.mjs';
import { buildBrief } from './insight.mjs';
import { buildFrontier } from './frontier.mjs';

function parseArgs(argv) {
  const opts = { full: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--full') opts.full = true;
    else if (argv[i] === '--limit') opts.limit = Number(argv[++i]) || 0;
  }
  return opts;
}

/** Compact per-day aggregate kept indefinitely so the dashboard can plot trends. */
function historyEntry(run, jobs) {
  const themes = {};
  const professions = {};
  const orgs = {};
  for (const j of jobs) {
    if (j.status !== 'open') continue;
    for (const t of j.themes || []) themes[t] = (themes[t] || 0) + 1;
    const p = j.profession || 'Unspecified';
    professions[p] = (professions[p] || 0) + 1;
    const o = j.org || 'not_stated';
    orgs[o] = (orgs[o] || 0) + 1;
  }
  return {
    date: run.date,
    at: run.finishedAt,
    totalOpen: run.openCount,
    added: run.addedCount,
    removed: run.removedCount,
    updated: run.updatedCount,
    themes,
    professions,
    orgs,
  };
}

/** Recompute every derived artifact the dashboard reads. */
export function rebuildDerived(allJobs, changes, history) {
  const stats = analyze(allJobs, changes, history);
  stats.brief = buildBrief(allJobs, stats, history);
  stats.frontier = buildFrontier(allJobs);
  writeJson(FILES.stats, stats);
  writeJson(FILES.jobsLite, buildJobsLite(allJobs));
  return stats;
}

export async function runBatch(opts = {}) {
  ensureDirs();
  const t0 = Date.now();

  const previous = readJson(FILES.jobs, []);
  const existing = new Map(previous.map((j) => [String(j.id), j]));
  const detailed = previous.filter((j) => j.hasDetail).length;

  console.log(
    `\n=== Microsoft Careers batch \u2014 ${new Date().toISOString()} ===\n` +
      `  mode: ${opts.full ? 'FULL' : 'incremental'} | known jobs: ${existing.size} (${detailed} with details)`
  );

  let result;
  try {
    result = await syncJobs(existing, {
      full: opts.full,
      limit: opts.limit,
      // Persist partial progress so a WAF block never discards fetched work.
      onCheckpoint: (partial) => writeJson(FILES.jobs, partial),
    });
  } catch (err) {
    if (err instanceof IncompleteIndexError) {
      console.error(`\n! Aborted: ${err.message}\n  Existing data left untouched.`);
      return { aborted: true, reason: err.message };
    }
    throw err;
  }

  const { jobs, run } = result;
  const allJobs = [...jobs.values()];
  writeJson(FILES.jobs, allJobs);

  const changes = readJson(FILES.changes, []);
  changes.unshift(run);
  writeJson(FILES.changes, changes.slice(0, CHANGELOG_RUNS), true);

  const history = readJson(FILES.history, []).filter((h) => h.date !== run.date);
  history.push(historyEntry(run, allJobs));
  history.sort((a, b) => a.date.localeCompare(b.date));
  writeJson(FILES.history, history, true);

  rebuildDerived(allJobs, changes, history);

  const summary = {
    finishedAt: run.finishedAt,
    durationSec: +((Date.now() - t0) / 1000).toFixed(1),
    mode: run.mode,
    openCount: run.openCount,
    added: run.addedCount,
    removed: run.removedCount,
    updated: run.updatedCount,
    detailsFetched: run.detailsFetched,
    missingDetail: run.missingDetail,
    errors: run.errors,
  };
  writeJson(FILES.runLog, summary, true);

  console.log(
    `\n> Done in ${summary.durationSec}s\n` +
      `  open: ${run.openCount} | +${run.addedCount} new | -${run.removedCount} closed | ~${run.updatedCount} changed\n` +
      `  details fetched: ${run.detailsFetched} | awaiting detail: ${run.missingDetail}\n` +
      `  errors: search=${run.errors.searchPages} detail=${run.errors.details} wafBlocks=${run.errors.wafBlocks}\n`
  );
  if (run.missingDetail > 0) {
    console.log('  Note: re-run to backfill the jobs still missing detail records.\n');
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBatch(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error('\nBatch failed:', err);
    process.exit(1);
  });
}
