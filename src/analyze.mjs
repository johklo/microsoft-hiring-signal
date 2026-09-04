import {
  ARCHETYPE_LABELS,
  BUSINESS_THEMES,
  INDUSTRIES,
  INITIATIVES,
  ORG_PARENTS,
  ORG_UNITS,
  SOLUTION_AREAS,
  cityLabel,
  orgParent,
  parseLocation,
} from './taxonomy.mjs';

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
const monthKey = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 7) : null);

/**
 * A continuous daily series over the last `days` calendar days, zero-filled.
 *
 * Emitting only the days that happened to carry a posting looks like a series
 * but is not one: the quiet early months have most of their days missing, so a
 * fixed number of points spans a much longer stretch of calendar. Anything that
 * treats the index as time — a dated axis, a moving average — is then wrong by
 * however many days are absent. Filling the gaps with the zeros that are
 * actually there is what makes the axis honest.
 */
function dailySeries(byDay, days) {
  if (!byDay.size) return [];
  const last = [...byDay.keys()].sort().pop();
  const end = new Date(`${last}T00:00:00Z`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: byDay.get(key) || 0 });
  }
  return out;
}

/**
 * Counts per month for each requested key, as small-multiple series.
 * Only currently-open roles are visible, so earlier months are progressively
 * understated as roles close — stated on the page rather than smoothed over.
 */
function monthlySeries(jobs, months, keyFn, wanted, labelFor) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = new Map();
  for (const j of jobs) {
    const mk = monthKey(j.creationTs);
    if (!idx.has(mk)) continue;
    for (const k of keyFn(j)) {
      if (wanted && !wanted.has(k)) continue;
      if (!out.has(k)) out.set(k, new Array(months.length).fill(0));
      out.get(k)[idx.get(mk)]++;
    }
  }
  return [...out.entries()]
    .map(([key, counts]) => ({
      key,
      label: labelFor(key),
      counts,
      total: counts.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Direction of travel: a key's share of the most recent `win` months against
 * its share of the `win` months before that.
 */
function shareShift(series, months, win = 3) {
  const n = months.length;
  if (n < win * 2) return [];
  const sum = (arr, from, to) => arr.slice(from, to).reduce((a, b) => a + b, 0);
  const recentTotal = series.reduce((a, s) => a + sum(s.counts, n - win, n), 0);
  const priorTotal = series.reduce((a, s) => a + sum(s.counts, n - win * 2, n - win), 0);
  if (!recentTotal || !priorTotal) return [];

  return series
    .map((s) => {
      const recent = (sum(s.counts, n - win, n) / recentTotal) * 100;
      const prior = (sum(s.counts, n - win * 2, n - win) / priorTotal) * 100;
      return {
        key: s.key,
        label: s.label,
        recentShare: +recent.toFixed(1),
        priorShare: +prior.toFixed(1),
        delta: +(recent - prior).toFixed(1),
      };
    })
    .sort((a, b) => b.delta - a.delta);
}

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
  const byOrg = new Map();
  const byOrgParent = new Map();
  const byOrgSource = new Map();
  const byIndustry = new Map();
  const byArchetype = new Map();
  const bySolutionArea = new Map();
  const byInitiative = new Map();
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

    tally(byOrg, j.org || 'not_stated');
    tally(byOrgParent, j.org ? orgParent(j.org) : 'not_stated');
    if (j.org) tally(byOrgSource, j.orgSource || 'self');
    for (const v of j.industries || []) tally(byIndustry, v);
    tally(byArchetype, j.archetype || 'other');
    for (const s of j.solutionAreas || []) tally(bySolutionArea, s);
    for (const i of j.initiatives || []) tally(byInitiative, i);

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
  const orgMeta = Object.fromEntries(ORG_UNITS.map((o) => [o.id, { label: o.label, blurb: o.blurb }]));
  const saMeta = Object.fromEntries(SOLUTION_AREAS.map((s) => [s.id, { label: s.label }]));
  const initMeta = Object.fromEntries(INITIATIVES.map((i) => [i.id, { label: i.label, blurb: i.blurb }]));
  const industryMeta = Object.fromEntries(INDUSTRIES.map((v) => [v.id, { label: v.label, blurb: v.blurb }]));

  const decorate = (map, meta, fallback) =>
    toList(map).map((x) => ({
      key: x.key,
      label: meta[x.key]?.label ?? fallback ?? x.key,
      blurb: meta[x.key]?.blurb ?? '',
      count: x.count,
      share: +((x.count / Math.max(1, jobs.length)) * 100).toFixed(1),
    }));

  const orgList = decorate(byOrg, orgMeta, 'Not stated').map((o) => ({
    ...o,
    parent: o.key === 'not_stated' ? null : orgParent(o.key),
    parentLabel: o.key === 'not_stated' ? null : ORG_PARENTS[orgParent(o.key)] ?? null,
  }));

  const orgParentList = toList(byOrgParent).map((x) => ({
    key: x.key,
    label: x.key === 'not_stated' ? 'Not stated' : ORG_PARENTS[x.key] ?? x.key,
    count: x.count,
    share: +((x.count / Math.max(1, jobs.length)) * 100).toFixed(1),
  }));
  const solutionAreaList = decorate(bySolutionArea, saMeta);
  const initiativeList = decorate(byInitiative, initMeta);
  const industryList = decorate(byIndustry, industryMeta);
  const archetypeList = toList(byArchetype).map((x) => ({
    key: x.key,
    label: ARCHETYPE_LABELS[x.key] ?? x.key,
    count: x.count,
    share: +((x.count / Math.max(1, jobs.length)) * 100).toFixed(1),
  }));

  const themeList = toList(byTheme).map((x) => ({
    key: x.key,
    label: themeMeta[x.key]?.label ?? x.key,
    blurb: themeMeta[x.key]?.blurb ?? '',
    count: x.count,
    share: +((x.count / Math.max(1, jobs.length)) * 100).toFixed(1),
  }));

  const trend = dailySeries(postedByDay, 180);

  // ---- monthly composition -------------------------------------------------
  const monthTotals = new Map();
  for (const j of jobs) {
    const mk = monthKey(j.creationTs);
    if (mk) tally(monthTotals, mk);
  }
  const months = [...monthTotals.keys()].sort().slice(-12);
  const topThemeKeys = new Set(themeList.slice(0, 8).map((t) => t.key));
  const topOrgKeys = new Set(orgList.filter((o) => o.key !== 'not_stated').slice(0, 8).map((o) => o.key));
  const topProfKeys = new Set(toList(byProfession, 8).map((p) => p.key));

  const themeMonthly = monthlySeries(jobs, months, (j) => j.themes || [], topThemeKeys, (k) => themeMeta[k]?.label ?? k);
  const orgMonthly = monthlySeries(jobs, months, (j) => (j.org ? [j.org] : []), topOrgKeys, (k) => orgMeta[k]?.label ?? k);
  const profMonthly = monthlySeries(jobs, months, (j) => [j.profession || UNKNOWN], topProfKeys, (k) => k);

  const timeline = {
    months,
    totals: months.map((m) => monthTotals.get(m) || 0),
    byTheme: themeMonthly,
    byOrg: orgMonthly,
    byProfession: profMonthly,
    shift: {
      windowMonths: 3,
      theme: shareShift(themeMonthly, months),
      org: shareShift(orgMonthly, months),
    },
  };

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
      orgIdentified: jobs.length - (byOrg.get('not_stated') || 0),
      orgCoverage: +(((jobs.length - (byOrg.get('not_stated') || 0)) / Math.max(1, jobs.length)) * 100).toFixed(1),
      // Two tiers, reported apart: the structured department names the team
      // outright, the Overview has to be read for a self-description.
      orgFromDepartment: byOrgSource.get('department') || 0,
      orgFromSelfDescription: byOrgSource.get('self') || 0,
      avgDaysOpen: ageCount ? +(ageSum / ageCount).toFixed(1) : null,
      medianDaysToClose: medianDaysOpen,
      runCount: runs.length,
      // Summary fields only. The full run record carries every added, closed and
      // edited posting, which on a batch that refreshes the whole corpus is
      // hundreds of kilobytes the browser never reads.
      lastRun: runs[0]
        ? {
            date: runs[0].date,
            startedAt: runs[0].startedAt,
            finishedAt: runs[0].finishedAt,
            mode: runs[0].mode,
            openCount: runs[0].openCount,
            addedCount: runs[0].addedCount,
            removedCount: runs[0].removedCount,
            updatedCount: runs[0].updatedCount,
          }
        : null,
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
    orgs: orgList,
    orgParents: orgParentList,
    solutionAreas: solutionAreaList,
    initiatives: initiativeList,
    industries: industryList,
    archetypes: archetypeList,
    themePairs: toList(themeCombo, 15).map((x) => {
      const [a, b] = x.key.split('|');
      return { a: themeMeta[a]?.label ?? a, b: themeMeta[b]?.label ?? b, count: x.count };
    }),
    crosstabs: {
      professionByRoleType: crossTab(jobs, (j) => j.profession, (j) => j.roleType || UNKNOWN, 12, [
        'Individual Contributor', 'People Manager', UNKNOWN,
      ]),
      professionBySeniority: crossTab(jobs, (j) => j.profession, (j) => j.seniority, 12, SENIORITY_ORDER),
      orgBySeniority: crossTab(
        jobs.filter((j) => j.org),
        (j) => orgMeta[j.org]?.label ?? j.org,
        (j) => j.seniority,
        12,
        SENIORITY_ORDER
      ),
    },
    trend,
    timeline,
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
        industries: j.industries || [],
        archetype: j.archetype || 'other',
        skills: j.skills || [],
        requiredYears: typeof j.requiredYears === 'number' ? j.requiredYears : null,
        products: j.products || [],
        org: j.org || null,
        solutionAreas: j.solutionAreas || [],
        initiatives: j.initiatives || [],
        overview: (j.overview || '').slice(0, 320),
        url: j.url,
      };
    });
}
