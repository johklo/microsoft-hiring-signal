/**
 * Recomputes stats.json and jobs.min.json from the cached jobs.json without
 * touching the network. Use while iterating on the taxonomy or the dashboard.
 *
 *   node src/rebuild.mjs             re-classify in memory, rewrite the site data
 *   node src/rebuild.mjs --persist   also write the new tags back to jobs.json
 *
 * --persist is off by default so a rebuild can safely run while a crawl is
 * still checkpointing to the same file.
 */
import { pathToFileURL } from 'node:url';
import { FILES, ensureDirs, readJson, writeJson } from './store.mjs';
import { reclassify } from './scrape.mjs';
import { rebuildDerived } from './daily.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureDirs();
  const cached = readJson(FILES.jobs, []);
  if (!cached.length) {
    console.error('No cached data. Run "npm run batch" first.');
    process.exit(1);
  }

  const jobs = cached.map(reclassify);
  const changes = readJson(FILES.changes, []);
  const history = readJson(FILES.history, []);
  const stats = rebuildDerived(jobs, changes, history);

  if (process.argv.includes('--persist')) {
    writeJson(FILES.jobs, jobs);
    console.log('Persisted re-classified tags to jobs.json.');
  }

  const detailed = jobs.filter((j) => j.hasDetail).length;
  console.log(
    `Rebuilt from ${jobs.length} cached records (${detailed} with detail) — ` +
      `${stats.meta.totalOpen} open, ${stats.themes.length} clusters, ${stats.meta.countries} countries.`
  );
}
