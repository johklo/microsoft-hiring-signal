import { BUSINESS_THEMES, cityLabel, parseLocation } from './taxonomy.mjs';

const UNKNOWN = 'Unspecified';

function tally(map, key, n = 1) {
  if (key === null || key === undefined || key === '') key = UNKNOWN;
  map.set(key, (map.get(key) || 0) + n);
}

/** Map -> [{ key, count }] sorted desc, optionally truncated. */
function toList(map, limit) {
  const arr = [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  return limit ? arr.slice(0, limit) : arr;
}

const dayKey = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null);

const STOPWORDS = new Set([
  'senior', 'principal', 'manager', 'director', 'lead', 'staff', 'intern', 'internship',
  'and', 'or', 'the', 'of', 'for', 'a', 'in', 'to', 'ii', 'iii', 'iv', 'i', 'sr', 'jr',
  'new', 'grad', 'level', 'associate', 'partner', 'group', 'general', 'vice', 'president',
]);

function titleKeywords(jobs, limit) {
  const m = new Map();
  for (const j of jobs) {
    const seen = new Set();
    for (const w of String(j.title).toLowerCase().split(/[^a-z0-9+#.]+/)) {
      const t = w.replace(/^\.+|\.+$/g, '');
      if (t.length < 3 || STOPWORDS.has(t) || seen.has(t)) continue;
      seen.add(t);
      tally(m, t);
    }
  }
  return toList(m, limit);
}

/** Cross-tab: rows = top values of `rowKey`, cols = fixed `colValues`. */
function crossTab(jobs, rowFn, colFn, topRows, colValues) {
  const rowTotals = new Map();
  const cells = new Map();
  for (const j of jobs) {
    const r = rowFn(j) || UNKNOWN;
    const c = colFn(j) || UNKNOWN;
    tally(rowTotals, r);
    tally(cells, `${r}\u0000${c}`);
  }
  const rows = toList(rowTotals, topRows).map((x) => x.key);
  return {
    rows,
    cols: colValues,
    matrix: rows.map((r) => colValues.map((c) => cells.get(`${r}\u0000${c}`) || 0)),
  };
}

export function analyze(allJobs, runs, history) {
  const jobs = allJobs.filter((j) => j.status === 'open');
  const closed = allJobs.filter((j) => j.status === 'closed');
  const now = Date.now();

  const byProfession = new Map();
  const byDiscipline = new Map();
  const byRoleType = new Map();
  const byEmploymentType = new Map();
  const bySeniority = new Map();
  const byWorkSite = new Map();
  const byTravel = new Map();
  const byDepartment = new Map();
  const byCountry = new Map();
  const byCity = new Map();
  const byTheme = new Map();
  const byProduct = new Map();
  const postedByDay = new Map();
  const ageBuckets = new Map();
  const themeCombo = new Map();

  let multiLocation = 0;
  let remoteEligible = 0;
  let untagged = 0;
  let ageSum = 0;
  let ageCount = 0;

  for (const j of jobs) {
    tally(byProfession, j.profession);
    tally(byDiscipline, j.discipline);
    tally(byRoleType, j.roleType);
    tally(byEmploymentType, j.employmentType);
    tally(bySeniority, j.seniority);
    tally(byWorkSite, j.workSite);
    tally(byTravel, j.travel);
    tally(byDepartment, j.department);

    const locs = j.locations?.length ? j.locations : ['Unknown'];
    if (locs.length > 1) multiLocation++;
    const countries = new Set();
    const cities = new Set();
    locs.forEach((l, i) => {
      const { city, country } = parseLocation(l, j.countryCodes?.[i]);
      countries.add(country);
      cities.add(cityLabel(city, country));
    });
    for (const c of countries) tally(byCountry, c);
    for (const c of cities) tally(byCity, c);

    if (/remote/i.test(j.workSite || '') || /remote/i.test(j.workLocationOption || '')) remoteEligible++;

    if (!j.themes?.length) untagged++;
    for (const t of j.themes || []) tally(byTheme, t);
    if (j.themes?.length > 1) {
      const sorted = [...j.themes].sort();
      for (let a = 0; a < sorted.length; a++) {
        for (let b = a + 1; b < sorted.length; b++) tally(themeCombo, `${sorted[a]}|${sorted[b]}`);
      }
    }
    for (const p of j.products || []) tally(byProduct, p);

    const d = dayKey(j.creationTs);
    if (d) tally(postedByDay, d);

    if (j.creationTs) {
      const days = Math.floor((now - j.creationTs * 1000) / 86400000);
      ageSum += days;
      ageCount++;
      const bucket =
        days <= 7 ? '0-7 days' :
        days <= 30 ? '8-30 days' :
        days <= 60 ? '31-60 days' :
        days <= 90 ? '61-90 days' :
        days <= 180 ? '91-180 days' : '180+ days';
      tally(ageBuckets, bucket);
    }
  }

  const themeMeta = Object.fromEntries(BUSINESS_THEMES.map((t) => [t.id, { label: t.label, blurb: t.blurb }]));

  const themeList = toList(byTheme).map((x) => ({
    key: x.key,
    label: themeMeta[x.key]?.label ?? x.key,
    blurb: themeMeta[x.key]?.blurb ?? '',
    count: x.count,
    share: +((x.count / Math.max(1, jobs.length)) * 100).toFixed(1),
  }));

  const trend = [...postedByDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))
    .slice(-180);

  const closedWithDuration = closed.filter((c) => typeof c.daysOpen === 'number');
  const medianDaysOpen = closedWithDuration.length
    ? closedWithDuration.map((c) => c.daysOpen).sort((a, b) => a - b)[Math.floor(closedWithDuration.length / 2)]
    : null;

  const AGE_ORDER = ['0-7 days', '8-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'];
  const SENIORITY_ORDER = [
    'Intern / University', 'Associate / Entry', 'Mid / Unspecified', 'Senior', 'Lead / Staff',
    'Principal', 'Manager', 'Director', 'Partner (Distinguished)', 'General Manager', 'Vice President+',
  ];

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalOpen: jobs.length,
      totalClosedTracked: closed.length,
      totalTracked: allJobs.length,
      countries: byCountry.size,
      cities: byCity.size,
      professions: byProfession.size,
      disciplines: byDiscipline.size,
      multiLocation,
      remoteEligible,
      untaggedByTheme: untagged,
      avgDaysOpen: ageCount ? +(ageSum / ageCount).toFixed(1) : null,
      medianDaysToClose: medianDaysOpen,
      runCount: runs.length,
      lastRun: runs[0] ?? null,
    },
    breakdowns: {
      profession: toList(byProfession),
      discipline: toList(byDiscipline, 40),
      department: toList(byDepartment, 40),
      roleType: toList(byRoleType),
      employmentType: toList(byEmploymentType),
      seniority: toList(bySeniority).sort(
        (a, b) => SENIORITY_ORDER.indexOf(a.key) - SENIORITY_ORDER.indexOf(b.key)
      ),
      workSite: toList(byWorkSite),
      travel: toList(byTravel),
      country: toList(byCountry, 30),
      city: toList(byCity, 30),
      product: toList(byProduct, 30),
      age: toList(ageBuckets).sort((a, b) => AGE_ORDER.indexOf(a.key) - AGE_ORDER.indexOf(b.key)),
      titleKeywords: titleKeywords(jobs, 40),
    },
    themes: themeList,
    themePairs: toList(themeCombo, 15).map((x) => {
      const [a, b] = x.key.split('|');
      return { a: themeMeta[a]?.label ?? a, b: themeMeta[b]?.label ?? b, count: x.count };
    }),
    crosstabs: {
      professionByRoleType: crossTab(jobs, (j) => j.profession, (j) => j.roleType || UNKNOWN, 12, [
        'Individual Contributor', 'People Manager', UNKNOWN,
      ]),
      professionBySeniority: crossTab(jobs, (j) => j.profession, (j) => j.seniority, 12, SENIORITY_ORDER),
    },
    trend,
    history,
    runs: runs.slice(0, 30).map((r) => ({
      date: r.date,
      startedAt: r.startedAt,
      mode: r.mode,
      openCount: r.openCount,
      addedCount: r.addedCount,
      removedCount: r.removedCount,
      updatedCount: r.updatedCount,
    })),
    recentChanges: runs.slice(0, 5).map((r) => ({
      date: r.date,
      startedAt: r.startedAt,
      added: r.added.slice(0, 40),
      removed: r.removed.slice(0, 40),
      updated: r.updated.slice(0, 40),
      addedCount: r.addedCount,
      removedCount: r.removedCount,
      updatedCount: r.updatedCount,
    })),
  };
}

/** Slim per-job rows for the browsable table (no HTML descriptions). */
export function buildJobsLite(allJobs) {
  return allJobs
    .filter((j) => j.status === 'open')
    .map((j) => {
      const locs = j.locations?.length ? j.locations : [];
      const parsed = locs.map((l, i) => parseLocation(l, j.countryCodes?.[i]));
      return {
        id: j.id,
        jobId: j.jobId,
        title: j.title,
        profession: j.profession || UNKNOWN,
        discipline: j.discipline || UNKNOWN,
        roleType: j.roleType || UNKNOWN,
        employmentType: j.employmentType || UNKNOWN,
        seniority: j.seniority,
        workSite: j.workSite || UNKNOWN,
        travel: j.travel || UNKNOWN,
        countries: [...new Set(parsed.map((p) => p.country))],
        location: [...new Set(parsed.map((p) => cityLabel(p.city, p.country)))].join(' | '),
        postedTs: j.postedTs,
        creationTs: j.creationTs,
        themes: j.themes || [],
        products: j.products || [],
        overview: (j.overview || '').slice(0, 320),
        url: j.url,
      };
    });
}
