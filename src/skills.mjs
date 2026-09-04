/**
 * What the market is being asked to supply.
 *
 * The rest of the site reads what Microsoft is buying. This module reads the
 * other side of the same adverts: the bar a candidate has to clear. Skills,
 * years of experience and degree level are taken from the Qualifications block
 * only — the one part of an advert that is a statement of demand rather than a
 * description of the team or the job.
 *
 * Two things make this readable as a *market* signal rather than a word count:
 *
 *   1. Every skill carries a demand index — its share of the last 90 days of
 *      postings against its share of the whole open book. That is the direction
 *      of travel, and it is what a candidate deciding what to learn needs.
 *   2. The entry bar is tracked over time. A market that is raising its years
 *      of experience and its degree requirement is a different market from one
 *      that is lowering them, even when the skill mix is unchanged.
 */

import { SKILL_CATEGORIES, SKILL_META } from './taxonomy.mjs';

const pct = (n, d) => (d ? +((n / d) * 100).toFixed(1) : 0);
const plural = (n, s, p) => `${n.toLocaleString('en-US')} ${n === 1 ? s : p}`;

const monthKey = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 7) : null);

/** The stack that did not exist as a hiring requirement three years ago. */
const AI_STACK = new Set(['llm', 'agents', 'rag', 'aifoundry', 'copilot_dev', 'mlops']);

const SENIORITY_BANDS = [
  { id: 'entry', label: 'Intern / entry', match: new Set(['Intern / University', 'Associate / Entry']) },
  { id: 'mid', label: 'Mid / unspecified', match: new Set(['Mid / Unspecified']) },
  { id: 'senior', label: 'Senior', match: new Set(['Senior', 'Lead / Staff']) },
  { id: 'principal', label: 'Principal +', match: new Set(['Principal', 'Partner (Distinguished)']) },
  { id: 'manager', label: 'Manager +', match: new Set(['Manager', 'Director', 'General Manager', 'Vice President+']) },
];

const bandOf = (seniority) => SENIORITY_BANDS.find((b) => b.match.has(seniority))?.id ?? 'mid';

function tally(map, key, n = 1) {
  if (key === null || key === undefined) return;
  map.set(key, (map.get(key) || 0) + n);
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Demand index: a skill's share of the last `days` of postings against its
 * share of the whole book. Above 1.00 means the market is asking for it more
 * often now than it has been overall.
 */
function demandIndex(jobs, days = 90, min = 12) {
  const cutoff = Date.now() / 1000 - days * 86400;
  const all = new Map();
  const recent = new Map();
  let allN = 0;
  let recentN = 0;

  for (const j of jobs) {
    const skills = j.skills || [];
    if (!skills.length) continue;
    const isRecent = j.creationTs && j.creationTs >= cutoff;
    allN++;
    if (isRecent) recentN++;
    for (const s of skills) {
      tally(all, s);
      if (isRecent) tally(recent, s);
    }
  }

  const out = [];
  for (const [key, total] of all) {
    if (total < min) continue;
    const overall = total / allN;
    const rec = recentN ? (recent.get(key) || 0) / recentN : 0;
    out.push({
      key,
      label: SKILL_META[key]?.label ?? key,
      category: SKILL_META[key]?.catLabel ?? '',
      total,
      recent: recent.get(key) || 0,
      index: overall ? +(rec / overall).toFixed(2) : 0,
    });
  }
  return out.sort((a, b) => b.index - a.index);
}

/** Counts per month for each key. */
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

export function buildSkills(allJobs) {
  const open = allJobs.filter((j) => j.status === 'open');
  const stated = open.filter((j) => j.hasQualifications);
  const withSkills = open.filter((j) => (j.skills || []).length);

  if (!stated.length) {
    return {
      generatedAt: new Date().toISOString(),
      empty: true,
      note: 'No advert in this batch carries a Qualifications block yet — run a batch to backfill detail records.',
    };
  }

  const n = stated.length;

  // ---- what is asked for --------------------------------------------------
  const bySkill = new Map();
  const byCategory = new Map();
  const breadth = [];
  for (const j of stated) {
    const skills = j.skills || [];
    breadth.push(skills.length);
    const cats = new Set();
    for (const s of skills) {
      tally(bySkill, s);
      if (SKILL_META[s]) cats.add(SKILL_META[s].cat);
    }
    for (const c of cats) tally(byCategory, c);
  }

  const skills = [...bySkill.entries()]
    .map(([key, count]) => ({
      key,
      label: SKILL_META[key]?.label ?? key,
      category: SKILL_META[key]?.catLabel ?? '',
      count,
      share: pct(count, n),
    }))
    .sort((a, b) => b.count - a.count);

  const categories = SKILL_CATEGORIES.map((c) => ({
    key: c.id,
    label: c.label,
    count: byCategory.get(c.id) || 0,
    share: pct(byCategory.get(c.id) || 0, n),
  }))
    .filter((c) => c.count)
    .sort((a, b) => b.count - a.count);

  // ---- the entry bar ------------------------------------------------------
  const yearsStated = stated.filter((j) => typeof j.requiredYears === 'number');
  const years = yearsStated.map((j) => j.requiredYears);
  const yearBuckets = new Map();
  for (const y of years) {
    const b = y <= 1 ? '0–1 years' : y <= 3 ? '2–3 years' : y <= 5 ? '4–5 years' : y <= 8 ? '6–8 years' : '9+ years';
    tally(yearBuckets, b);
  }
  const BUCKET_ORDER = ['0–1 years', '2–3 years', '4–5 years', '6–8 years', '9+ years'];

  const byBand = SENIORITY_BANDS.map((b) => {
    const rows = yearsStated.filter((j) => bandOf(j.seniority) === b.id);
    return {
      key: b.id,
      label: b.label,
      count: rows.length,
      median: median(rows.map((j) => j.requiredYears)),
    };
  }).filter((b) => b.count >= 5);

  const byDegree = new Map();
  for (const j of stated) tally(byDegree, j.degree ?? 'Not stated');
  const DEGREE_ORDER = ["Bachelor's", "Master's", 'PhD', 'Not stated'];
  const degrees = [...byDegree.entries()]
    .map(([key, count]) => ({ key, label: key, count, share: pct(count, n) }))
    .sort((a, b) => DEGREE_ORDER.indexOf(a.key) - DEGREE_ORDER.indexOf(b.key));

  // ---- direction of travel -------------------------------------------------
  const demand = demandIndex(withSkills);
  // Top and bottom by index rather than a fixed threshold: a threshold produces
  // an empty panel on a steady book, which reads as missing data rather than as
  // the finding it is.
  const rising = demand.slice(0, 6);
  const fading = [...demand].reverse().slice(0, 6);

  // The AI stack measured the way every other momentum figure on the site is
  // measured — a 90-day share against the whole-book share. The month-by-month
  // line below is the same quantity plotted, but it is survivorship-biased in
  // its early months, so the index is what the reading leans on.
  const cutoff90 = Date.now() / 1000 - 90 * 86400;
  const isAi = (j) => (j.skills || []).some((s) => AI_STACK.has(s));
  const recentStated = stated.filter((j) => j.creationTs && j.creationTs >= cutoff90);
  const aiRecentShare = pct(recentStated.filter(isAi).length, recentStated.length);

  const monthTotals = new Map();
  for (const j of stated) {
    const mk = monthKey(j.creationTs);
    if (mk) tally(monthTotals, mk);
  }
  const months = [...monthTotals.keys()].sort().slice(-12);
  const topKeys = new Set(skills.slice(0, 8).map((s) => s.key));
  const skillMonthly = monthlySeries(
    stated,
    months,
    (j) => j.skills || [],
    topKeys,
    (k) => SKILL_META[k]?.label ?? k
  );
  const categoryMonthly = monthlySeries(
    stated,
    months,
    (j) => [...new Set((j.skills || []).map((s) => SKILL_META[s]?.cat).filter(Boolean))],
    null,
    (k) => SKILL_CATEGORIES.find((c) => c.id === k)?.label ?? k
  ).slice(0, 8);

  // ---- the market lines ----------------------------------------------------
  // Share of each month's postings demanding the AI stack, and the entry bar in
  // the same months, so the two can be read against each other.
  const perMonth = months.map((m) => {
    const rows = stated.filter((j) => monthKey(j.creationTs) === m);
    const ai = rows.filter((j) => (j.skills || []).some((s) => AI_STACK.has(s))).length;
    const deg = rows.filter((j) => j.degree).length;
    const yrs = rows.filter((j) => typeof j.requiredYears === 'number').map((j) => j.requiredYears);
    return {
      month: m,
      postings: rows.length,
      aiShare: pct(ai, rows.length),
      degreeShare: pct(deg, rows.length),
      medianYears: median(yrs),
    };
  });

  // Months with too few postings to carry a share are dropped rather than
  // plotted as noise — an 8-posting month swinging 30 points is not a market.
  const marketMonths = perMonth.filter((m) => m.postings >= 25);

  const aiCount = stated.filter(isAi).length;
  const aiBaseShare = pct(aiCount, n);
  const aiIndex = aiBaseShare ? +(aiRecentShare / aiBaseShare).toFixed(2) : null;
  const clearanceCount = stated.filter((j) => (j.skills || []).includes('clearance')).length;

  // ---- what travels together ----------------------------------------------
  const pairCount = new Map();
  for (const j of stated) {
    const s = [...new Set(j.skills || [])].sort();
    for (let a = 0; a < s.length; a++) {
      for (let b = a + 1; b < s.length; b++) tally(pairCount, `${s[a]}\u0000${s[b]}`);
    }
  }
  const pairs = [...pairCount.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('\u0000');
      return {
        a: SKILL_META[a]?.label ?? a,
        b: SKILL_META[b]?.label ?? b,
        count,
        share: pct(count, n),
      };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 12);

  // ---- capability against the experience band ------------------------------
  const bandIds = SENIORITY_BANDS.map((b) => b.id);
  const catRows = categories.slice(0, 8).map((c) => c.key);
  const cells = new Map();
  const bandTotals = new Map();
  for (const j of stated) {
    const band = bandOf(j.seniority);
    tally(bandTotals, band);
    const cats = new Set((j.skills || []).map((s) => SKILL_META[s]?.cat).filter(Boolean));
    for (const c of cats) tally(cells, `${c}\u0000${band}`);
  }
  const gradient = {
    rows: catRows.map((c) => SKILL_CATEGORIES.find((x) => x.id === c)?.label ?? c),
    cols: SENIORITY_BANDS.map((b) => b.label),
    // Share of that band's adverts, not raw counts — the bands are wildly
    // different sizes, so counts would only restate how big each band is.
    matrix: catRows.map((c) =>
      bandIds.map((b) => pct(cells.get(`${c}\u0000${b}`) || 0, bandTotals.get(b) || 0))
    ),
  };

  // ---- narrative ------------------------------------------------------------
  const medYears = median(years);
  const meanBreadth = breadth.length ? +(breadth.reduce((a, b) => a + b, 0) / breadth.length).toFixed(1) : 0;
  const degreeShare = pct(stated.filter((j) => j.degree).length, n);
  const firstMarket = marketMonths[0];
  const lastMarket = marketMonths[marketMonths.length - 1];
  const yearsTrend =
    firstMarket && lastMarket && firstMarket.medianYears !== null && lastMarket.medianYears !== null
      ? +(lastMarket.medianYears - firstMarket.medianYears).toFixed(1)
      : null;

  const kpis = [
    { label: 'State requirements', value: `${pct(n, open.length)}%`, sub: `${plural(n, 'advert', 'adverts')} with a qualifications block` },
    { label: 'Skills per advert', value: String(meanBreadth), sub: 'mean, named requirements only' },
    { label: 'Median entry bar', value: medYears !== null ? `${medYears} yrs` : 'n/a', sub: `${pct(years.length, n)}% state a number` },
    { label: 'Ask for a degree', value: `${degreeShare}%`, sub: `PhD on ${pct(stated.filter((j) => j.degree === 'PhD').length, n)}%` },
    { label: 'Ask for the AI stack', value: `${aiRecentShare}%`, sub: `of the last 90 days · whole book ${aiBaseShare}%` },
    { label: 'Ask for clearance', value: `${pct(clearanceCount, n)}%`, sub: `${plural(clearanceCount, 'advert', 'adverts')}` },
  ];

  const reading = [
    `${pct(n, open.length)}% of the open book states its requirements, and those adverts name ${meanBreadth} distinct capabilities each. The capability the market is asked for most often is ${categories[0]?.label ?? 'n/a'} (${categories[0]?.share ?? 0}% of adverts), ahead of ${categories[1]?.label ?? 'n/a'} (${categories[1]?.share ?? 0}%).`,

    skills.length
      ? `By named skill the ranking is ${skills.slice(0, 5).map((s) => `${s.label} (${s.share}%)`).join(', ')}. Read that as a floor: an advert that says "coding in languages including, but not limited to…" is counted as asking for an open list rather than for each language it enumerates, which is what that clause actually means.`
      : '',

    medYears !== null
      ? `The median entry bar is ${medYears} years of experience, and ${degreeShare}% of adverts name a degree. ${
          byBand.length
            ? `Across the bands the bar runs ${byBand.map((b) => `${b.label} ${b.median}yr`).join(', ')} — the manager band reads low because what it asks for is years of *people management*, a different clock from the technical bands.`
            : ''
        }`
      : 'Too few adverts state a number of years to read an entry bar.',

    rising.length
      ? `The highest demand indices are ${rising.slice(0, 4).map((d) => `${d.label} (${d.index}×)`).join(', ')} — each takes that multiple of its baseline share in the last 90 days of postings.`
      : 'No skill carries a demand index; too few adverts state requirements.',

    fading.length
      ? `The lowest are ${fading.slice(0, 4).map((d) => `${d.label} (${d.index}×)`).join(', ')}. On a book this size read those as a lean rather than a retreat.`
      : '',

    aiIndex !== null
      ? `The AI stack — LLMs, agents, retrieval and model operations — is named in ${aiRecentShare}% of the last 90 days of postings against ${aiBaseShare}% of the whole book, an index of ${aiIndex}. ${
          aiIndex >= 1.1
            ? 'It is being written into ordinary roles rather than hired for separately.'
            : aiIndex <= 0.9
              ? 'Recent postings ask for it less often than the book as a whole, which points back toward specialist roles.'
              : 'It is holding at its existing level rather than accelerating.'
        }`
      : 'Not enough recent postings to index the AI-stack requirement.',

    yearsTrend !== null
      ? `The entry bar moved ${yearsTrend >= 0 ? '+' : ''}${yearsTrend} years across the plotted months (${firstMarket.medianYears} → ${lastMarket.medianYears} median). Earlier months are a survivorship-biased sample — only roles still open are visible — so read the recent end of that line, not its slope from the start.`
      : '',

    pairs.length
      ? `The requirements that travel together most often are ${pairs.slice(0, 3).map((p) => `${p.a} + ${p.b} (${p.count})`).join(', ')} — those pairs are the shape of the job the market is actually describing.`
      : '',
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    empty: false,
    coverage: {
      stated: n,
      statedShare: pct(n, open.length),
      withSkills: withSkills.length,
      withSkillsShare: pct(withSkills.length, open.length),
      yearsStated: years.length,
      yearsStatedShare: pct(years.length, n),
    },
    kpis,
    categories,
    skills: skills.slice(0, 20),
    demand: { windowDays: 90, rising, fading, all: demand.slice(0, 24) },
    aiStack: { recentShare: aiRecentShare, baseShare: aiBaseShare, index: aiIndex, count: aiCount },
    experience: {
      median: medYears,
      mean: years.length ? +(years.reduce((a, b) => a + b, 0) / years.length).toFixed(1) : null,
      buckets: BUCKET_ORDER.filter((b) => yearBuckets.has(b)).map((b) => ({
        key: b,
        label: b,
        count: yearBuckets.get(b),
        share: pct(yearBuckets.get(b), years.length),
      })),
      byBand,
    },
    degrees,
    timeline: {
      months,
      totals: months.map((m) => monthTotals.get(m) || 0),
      bySkill: skillMonthly,
      byCategory: categoryMonthly,
      shift: {
        windowMonths: 3,
        skill: shareShift(skillMonthly, months),
        category: shareShift(categoryMonthly, months),
      },
    },
    market: {
      months: marketMonths.map((m) => m.month),
      postings: marketMonths.map((m) => m.postings),
      aiShare: marketMonths.map((m) => m.aiShare),
      degreeShare: marketMonths.map((m) => m.degreeShare),
      medianYears: marketMonths.map((m) => m.medianYears),
      minPostings: 25,
    },
    pairs,
    gradient,
    reading,
  };
}
