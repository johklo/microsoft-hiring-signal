import crypto from 'node:crypto';
import { CHECKPOINT_EVERY, CONCURRENCY, DETAIL_BUDGET, DETAIL_REFRESH_DAYS, PAGE_SIZE } from './config.mjs';
import { fetchPositionDetails, fetchSearchPage, pool, rateStats } from './api.mjs';
import {
  classifyArchetype,
  classifySeniority,
  degreeLevel,
  detectIndustries,
  detectInitiatives,
  detectOrg,
  detectProducts,
  detectSkills,
  detectSolutionAreas,
  detectThemes,
  extractOverview,
  extractOverviewBlock,
  extractQualificationsBlock,
  requiredYears,
  stripBoilerplate,
  toPlainText,
  unitForDepartment,
  unitForProfession,
} from './taxonomy.mjs';

const first = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const hash = (s) => crypto.createHash('sha1').update(s || '').digest('hex').slice(0, 16);

/** Fields compared between runs to flag a posting as "updated". */
const TRACKED_FIELDS = [
  'title', 'department', 'profession', 'discipline', 'roleType', 'employmentType',
  'workSite', 'travel', 'seniority', 'locations', 'org', 'descriptionHash',
];

/**
 * If more than this share of search pages fail we cannot trust the index, and
 * must not conclude that missing jobs were closed.
 */
const MAX_INDEX_FAILURE_RATE = 0.02;

export class IncompleteIndexError extends Error {}

function progressBar(label) {
  let last = -1;
  const t0 = Date.now();
  return (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct === last && done !== total) return;
    last = pct;
    const elapsed = (Date.now() - t0) / 1000;
    const eta = done ? Math.round((elapsed / done) * (total - done)) : 0;
    process.stdout.write(`\r  ${label}: ${done}/${total} (${pct}%) eta ${eta}s      `);
    if (done === total) process.stdout.write('\n');
  };
}

/** Walk every page of the public search endpoint. */
export async function fetchAllSummaries() {
  const firstPage = await fetchSearchPage(0);
  const total = firstPage.total;
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`  reported open positions: ${total} (${pages} pages)`);

  const offsets = [];
  for (let i = 1; i < pages; i++) offsets.push(i * PAGE_SIZE);

  const bar = progressBar('search pages');
  bar(1, pages);
  const { results, errors } = await pool(
    offsets,
    CONCURRENCY,
    async (start) => (await fetchSearchPage(start)).positions,
    (done) => bar(done + 1, pages)
  );

  const failureRate = errors.length / Math.max(1, pages);
  if (failureRate > MAX_INDEX_FAILURE_RATE) {
    throw new IncompleteIndexError(
      `${errors.length}/${pages} search pages failed (${(failureRate * 100).toFixed(1)}%). ` +
        `Refusing to sync from a partial index \u2014 it would falsely close jobs. ` +
        `The site is rate-limiting; retry later or lower MSJOBS_CONCURRENCY.`
    );
  }

  const byId = new Map();
  for (const p of firstPage.positions) byId.set(String(p.id), p);
  for (const page of results) {
    if (!page) continue;
    for (const p of page) byId.set(String(p.id), p);
  }

  if (errors.length) console.warn(`  ! ${errors.length} search page(s) failed (within tolerance)`);
  return { total, summaries: [...byId.values()], filterDef: firstPage.filterDef, pageErrors: errors.length };
}

/** Merge a search summary + detail payload into our normalised job record. */
export function buildRecord(summary, detail, previous) {
  const descriptionHtml = detail?.jobDescription ?? previous?.descriptionHtml ?? '';
  const plain = toPlainText(descriptionHtml);
  const title = summary.name ?? detail?.name ?? previous?.title ?? '';

  const profession = first(detail?.efcustomTextCurrentProfession) ?? previous?.profession ?? null;
  const discipline = first(detail?.efcustomTextTaDisciplineName) ?? previous?.discipline ?? null;
  const roleType = first(detail?.efcustomTextRoletype) ?? previous?.roleType ?? null;
  const employmentType = first(detail?.efcustomTextEmploymentType) ?? previous?.employmentType ?? null;
  const workSite = first(detail?.efcustomTextWorkSite) ?? previous?.workSite ?? null;
  const travel = first(detail?.efcustomTextRequiredTravel) ?? previous?.travel ?? null;

  // Structured fields are decisive; the description only corroborates.
  // Legal/benefits boilerplate is stripped before tagging.
  const clean = stripBoilerplate(plain);
  const strong = [title, profession, discipline, summary.department].filter(Boolean).join('\n');
  // Organisation is read from the structured department first, then from the
  // Overview — that is where a team describes itself rather than listing teams
  // it collaborates with.
  const overviewBlock = extractOverviewBlock(clean);
  // Skills are read from the Qualifications block only — that is the one part
  // of an advert that is a statement of demand.
  const qualifications = extractQualificationsBlock(clean);
  const department = summary.department ?? detail?.department ?? null;
  const orgByDepartment = unitForDepartment(department);
  const orgByProfession = unitForProfession(profession);
  const org = detectOrg(strong, overviewBlock, department, profession);
  const orgSource = !org
    ? null
    : org === orgByDepartment
      ? 'department'
      : org === orgByProfession
        ? 'profession'
        : 'self';

  return {
    id: String(summary.id),
    jobId: summary.displayJobId ?? detail?.displayJobId ?? null,
    title,
    department,
    profession,
    discipline,
    roleType,
    employmentType,
    workSite,
    travel,
    seniority: classifySeniority(title),
    archetype: classifyArchetype(title),
    locations: summary.locations ?? detail?.locations ?? [],
    countryCodes: summary.standardizedLocations ?? detail?.standardizedLocations ?? [],
    workLocationOption: summary.workLocationOption ?? null,
    postedTs: summary.postedTs ?? null,
    creationTs: summary.creationTs ?? null,
    isHot: Boolean(summary.isHot),
    url: detail?.publicUrl ?? `https://jobs.careers.microsoft.com/global/en/job/${summary.id}`,
    themes: detectThemes(strong, clean),
    industries: detectIndustries(strong, clean),
    products: detectProducts(`${strong}\n${clean}`),
    org,
    orgSource,
    solutionAreas: detectSolutionAreas(`${strong}\n${clean}`),
    initiatives: detectInitiatives(`${strong}\n${clean}`),
    skills: detectSkills(strong, qualifications),
    requiredYears: requiredYears(qualifications),
    degree: degreeLevel(qualifications),
    hasQualifications: Boolean(qualifications),
    overview: clean ? extractOverview(clean) : previous?.overview ?? '',
    descriptionHash: hash(plain),
    descriptionHtml,
    hasDetail: Boolean(detail) || Boolean(previous?.hasDetail),
    status: 'open',
    firstSeenAt: previous?.firstSeenAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    detailFetchedAt: detail ? new Date().toISOString() : previous?.detailFetchedAt ?? null,
    closedAt: null,
  };
}

/**
 * Recompute the derived classification of a cached record from its stored
 * description. Lets the taxonomy be changed without re-crawling.
 */
export function reclassify(job) {
  const plain = toPlainText(job.descriptionHtml || '');
  const clean = stripBoilerplate(plain);
  const strong = [job.title, job.profession, job.discipline, job.department].filter(Boolean).join('\n');
  const overviewBlock = extractOverviewBlock(clean);
  const qualifications = extractQualificationsBlock(clean);
  const org = detectOrg(strong, overviewBlock, job.department, job.profession);
  const byDepartment = unitForDepartment(job.department);
  const byProfession = unitForProfession(job.profession);
  return {
    ...job,
    seniority: classifySeniority(job.title || ''),
    archetype: classifyArchetype(job.title || ''),
    themes: detectThemes(strong, clean),
    industries: detectIndustries(strong, clean),
    products: detectProducts(`${strong}\n${clean}`),
    org,
    orgSource: !org
      ? null
      : org === byDepartment
        ? 'department'
        : org === byProfession
          ? 'profession'
          : 'self',
    solutionAreas: detectSolutionAreas(`${strong}\n${clean}`),
    initiatives: detectInitiatives(`${strong}\n${clean}`),
    skills: detectSkills(strong, qualifications),
    requiredYears: requiredYears(qualifications),
    degree: degreeLevel(qualifications),
    hasQualifications: Boolean(qualifications),
    overview: clean ? extractOverview(clean) : job.overview ?? '',
  };
}

function diffRecord(before, after) {
  const changed = {};
  for (const f of TRACKED_FIELDS) {
    const a = JSON.stringify(before?.[f] ?? null);
    const b = JSON.stringify(after?.[f] ?? null);
    if (a !== b) changed[f] = { from: before?.[f] ?? null, to: after?.[f] ?? null };
  }
  return changed;
}

/**
 * Sync the local dataset against the live site.
 *
 * @param {Map<string,object>} existing  previous records keyed by id
 * @param {object} opts
 *   full         re-fetch details for every job, ignoring the cache
 *   limit        cap the number of jobs processed (trial runs)
 *   onCheckpoint called with the in-progress job list so partial work survives
 */
export async function syncJobs(existing, opts = {}) {
  const startedAt = new Date().toISOString();
  console.log('> Fetching search index...');
  let { total, summaries, pageErrors } = await fetchAllSummaries();

  if (opts.limit) summaries = summaries.slice(0, opts.limit);

  const liveIds = new Set(summaries.map((s) => String(s.id)));
  const staleBefore = Date.now() - DETAIL_REFRESH_DAYS * 86400000;

  // Seed every live job from cached data first, so a mid-run block still
  // leaves a coherent dataset behind.
  const jobs = new Map();
  for (const s of summaries) {
    const id = String(s.id);
    jobs.set(id, buildRecord(s, null, existing.get(id)));
  }

  // Persist the index immediately: the dashboard can render from summary-level
  // fields alone while detail records backfill in the background.
  if (opts.onCheckpoint) await opts.onCheckpoint([...jobs.values(), ...carryClosed(existing, liveIds)]);

  const staleDetail = summaries.filter((s) => {
    const prev = existing.get(String(s.id));
    if (opts.full || !prev || !prev.hasDetail || !prev.descriptionHtml) return true;
    if (prev.postedTs !== s.postedTs) return true; // re-posted
    return !prev.detailFetchedAt || new Date(prev.detailFetchedAt).getTime() < staleBefore;
  });

  // Never-fetched postings come first, so the corpus fills in breadth-first.
  staleDetail.sort((a, b) => {
    const av = existing.get(String(a.id))?.hasDetail ? 1 : 0;
    const bv = existing.get(String(b.id))?.hasDetail ? 1 : 0;
    return av - bv;
  });

  const budget = opts.budget ?? DETAIL_BUDGET;
  const needsDetail = budget > 0 ? staleDetail.slice(0, budget) : staleDetail;
  const deferred = staleDetail.length - needsDetail.length;

  console.log(
    `> Detail fetch: ${needsDetail.length} of ${staleDetail.length} outstanding` +
      (deferred ? ` (${deferred} deferred to the next batch)` : '')
  );
  let detailErrors = 0;
  let fetched = 0;

  if (needsDetail.length) {
    const bar = progressBar('job details');
    const { errors } = await pool(
      needsDetail,
      CONCURRENCY,
      (s) => fetchPositionDetails(s.id),
      async (done, totalItems, index, detail) => {
        if (detail) {
          const s = needsDetail[index];
          const id = String(s.id);
          jobs.set(id, buildRecord(s, detail, existing.get(id)));
          fetched++;
        }
        bar(done, totalItems);
        if (opts.onCheckpoint && done % CHECKPOINT_EVERY === 0) {
          await opts.onCheckpoint([...jobs.values(), ...carryClosed(existing, liveIds)]);
        }
      }
    );
    detailErrors = errors.length;
    if (detailErrors) console.warn(`  ! ${detailErrors} detail fetch(es) failed`);
  }

  // Classify additions and modifications now that details have landed.
  const added = [];
  const updated = [];
  for (const [id, record] of jobs) {
    const prev = existing.get(id);
    if (!prev || prev.status === 'closed') {
      if (prev?.status === 'closed') record.firstSeenAt = new Date().toISOString();
      added.push({
        id,
        jobId: record.jobId,
        title: record.title,
        profession: record.profession,
        locations: record.locations,
        url: record.url,
      });
    } else {
      const changed = diffRecord(prev, record);
      if (Object.keys(changed).length) updated.push({ id, jobId: record.jobId, title: record.title, changed });
    }
  }

  // Anything previously tracked that the site no longer lists is closed.
  const removed = [];
  for (const [id, prev] of existing) {
    if (liveIds.has(id)) continue;
    if (prev.status === 'closed') {
      jobs.set(id, prev);
      continue;
    }
    jobs.set(id, {
      ...prev,
      status: 'closed',
      closedAt: new Date().toISOString(),
      daysOpen: prev.firstSeenAt
        ? Math.round((Date.now() - new Date(prev.firstSeenAt).getTime()) / 86400000)
        : null,
    });
    removed.push({ id, jobId: prev.jobId, title: prev.title, profession: prev.profession, url: prev.url });
  }

  const missingDetail = [...jobs.values()].filter((j) => j.status === 'open' && !j.hasDetail).length;
  return {
    jobs,
    run: {
      startedAt,
      finishedAt: new Date().toISOString(),
      date: startedAt.slice(0, 10),
      mode: opts.full ? 'full' : 'incremental',
      reportedTotal: total,
      openCount: liveIds.size,
      detailsFetched: fetched,
      missingDetail,
      addedCount: added.length,
      removedCount: removed.length,
      updatedCount: updated.length,
      errors: { searchPages: pageErrors, details: detailErrors, wafBlocks: rateStats().blockEvents },
      added,
      removed,
      updated,
    },
  };
}

/** Previously-closed records, preserved verbatim during checkpoints. */
function carryClosed(existing, liveIds) {
  const out = [];
  for (const [id, prev] of existing) {
    if (!liveIds.has(id) && prev.status === 'closed') out.push(prev);
  }
  return out;
}
