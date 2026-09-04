/**
 * Deep read of the Microsoft Frontier Company cohort — Industry Solutions
 * Delivery (ISD), Forward Deployed Engineering (FDE) and the roles that name
 * the Frontier organisation without naming a sub-unit.
 *
 * The rest of the site reads the whole open book. This module asks a narrower
 * question: given that Frontier is the organisation Microsoft built to rebuild
 * its commercial business around AI, what is it actually buying, and what does
 * the composition of that buying say about where it is heading?
 *
 * Every figure is a comparison. A count on its own says little about a cohort
 * of this size; a count *against the rest of the open book* says what is
 * distinctive about it. So each breakdown carries an index — the cohort's share
 * of a thing divided by the share the rest of the company gives it. Above 1.00
 * means Frontier over-weights it relative to everyone else.
 */

import {
  ARCHETYPE_LABELS,
  BUSINESS_THEMES,
  INDUSTRIES,
  INITIATIVES,
  ORG_UNITS,
  ROLE_ARCHETYPES,
  SOLUTION_AREAS,
  cityLabel,
  parseLocation,
  stripBoilerplate,
  toPlainText,
} from './taxonomy.mjs';

const pct = (n, d) => (d ? +((n / d) * 100).toFixed(1) : 0);
const plural = (n, s, p) => `${n.toLocaleString('en-US')} ${n === 1 ? s : p}`;
/** Prose form of a unit label: no acronym in brackets, no "other / unspecified". */
const shortLabel = (s = '') =>
  s.replace(/\s*\u2014 other \/ unspecified/i, ' (unspecified unit)').replace(/\s*\([A-Z&+]{2,6}\)/, '');

/** The units that report into Microsoft Frontier Company. */
export const FRONTIER_UNIT_IDS = ORG_UNITS.filter((u) => u.parent === 'frontier').map((u) => u.id);

const UNIT_META = Object.fromEntries(ORG_UNITS.map((u) => [u.id, u]));
const INDUSTRY_META = Object.fromEntries(INDUSTRIES.map((v) => [v.id, v]));
const ARCHETYPE_META = Object.fromEntries(ROLE_ARCHETYPES.map((a) => [a.id, a]));
const THEME_LABELS = Object.fromEntries(BUSINESS_THEMES.map((t) => [t.id, t.label]));
const INITIATIVE_META = Object.fromEntries(INITIATIVES.map((i) => [i.id, i]));
const SOLUTION_LABELS = Object.fromEntries(SOLUTION_AREAS.map((s) => [s.id, s.label]));

/** Archetypes that consume an engagement's budget rather than create demand. */
const DELIVERY_ARCHETYPES = new Set([
  'architect', 'consultant', 'delivery_lead', 'program', 'data_ai', 'engineer', 'support', 'security',
]);
const DEMAND_ARCHETYPES = new Set(['sales', 'csam']);
/**
 * The narrower cut used when comparing divisions. "Delivery-shaped" including
 * engineers is the right read *inside* Frontier, where forward-deployed
 * engineers are billable; across divisions it would just measure who writes
 * code. Architects, consultants and engagement leads discriminate properly.
 */
const CONSULTING_ARCHETYPES = new Set(['architect', 'consultant', 'delivery_lead']);

const SENIOR_PLUS = new Set(['Senior', 'Lead / Staff', 'Principal', 'Partner (Distinguished)']);
const LEADERSHIP = new Set(['Manager', 'Director', 'General Manager', 'Vice President+']);

/** Any mention of the organisation, membership or not. */
const FRONTIER_MENTION =
  /\bISD\b|Industry Solutions Delivery|Microsoft Industry Solutions|\bFDE\b|Forward Deployed Engineer|Microsoft Frontier Company|Frontier Company|\bFrontier Firm\b/i;

function tally(map, key, n = 1) {
  if (!key && key !== 0) return;
  map.set(key, (map.get(key) || 0) + n);
}

const monthKey = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 7) : null);

/**
 * Cohort counts set against the same measurement on the rest of the open book.
 *
 * `index` is the ratio of the two shares. Where the rest of the book never
 * mentions a thing the ratio is undefined rather than infinite, and is reported
 * as null so the page can say "only here" instead of printing a fake number.
 */
function compare(cohort, rest, keyFn, labelFor, blurbFor, { min = 1, limit = 0 } = {}) {
  const a = new Map();
  const b = new Map();
  for (const j of cohort) for (const k of keyFn(j)) tally(a, k);
  for (const j of rest) for (const k of keyFn(j)) tally(b, k);

  const out = [...a.entries()]
    .filter(([, count]) => count >= min)
    .map(([key, count]) => {
      const cohortShare = pct(count, cohort.length);
      const restShare = pct(b.get(key) || 0, rest.length);
      return {
        key,
        label: labelFor(key),
        blurb: blurbFor ? blurbFor(key) : '',
        count,
        share: cohortShare,
        restShare,
        index: restShare ? +(cohortShare / restShare).toFixed(2) : null,
      };
    })
    .sort((x, y) => y.count - x.count || String(x.key).localeCompare(String(y.key)));

  return limit ? out.slice(0, limit) : out;
}

/** Monthly counts for each key, as small-multiple series. */
function monthlySeries(jobs, months, keyFn, labelFor, limit = 8) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = new Map();
  for (const j of jobs) {
    const mk = monthKey(j.creationTs);
    if (!idx.has(mk)) continue;
    for (const k of keyFn(j)) {
      if (!out.has(k)) out.set(k, new Array(months.length).fill(0));
      out.get(k)[idx.get(mk)]++;
    }
  }
  return [...out.entries()]
    .map(([key, counts]) => ({
      key,
      label: labelFor(key),
      counts,
      total: counts.reduce((s, n) => s + n, 0),
    }))
    .sort((x, y) => y.total - x.total)
    .slice(0, limit);
}

/**
 * Direction inside the cohort: a key's share of the most recent `win` months
 * against its share of the `win` months before.
 */
function shareShift(series, months, win = 3) {
  const n = months.length;
  if (n < win * 2) return [];
  const sum = (arr, from, to) => arr.slice(from, to).reduce((s, v) => s + v, 0);
  const recentTotal = series.reduce((s, x) => s + sum(x.counts, n - win, n), 0);
  const priorTotal = series.reduce((s, x) => s + sum(x.counts, n - win * 2, n - win), 0);
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

/**
 * Recency index within the cohort: a key's share of the cohort's last `days` of
 * postings against its share of the whole cohort.
 */
function recencyIndex(jobs, keyFn, days = 30, min = 3) {
  const cutoff = Date.now() / 1000 - days * 86400;
  const all = new Map();
  const recent = new Map();
  let allN = 0;
  let recentN = 0;

  for (const j of jobs) {
    const keys = keyFn(j);
    if (!keys.length) continue;
    const isRecent = j.creationTs && j.creationTs >= cutoff;
    allN++;
    if (isRecent) recentN++;
    for (const k of keys) {
      tally(all, k);
      if (isRecent) tally(recent, k);
    }
  }

  const out = [];
  for (const [k, total] of all) {
    if (total < min) continue;
    const overall = total / allN;
    const rec = recentN ? (recent.get(k) || 0) / recentN : 0;
    out.push({ key: k, total, recent: recent.get(k) || 0, index: overall ? +(rec / overall).toFixed(2) : 0 });
  }
  return out.sort((a, b) => b.index - a.index);
}

// ---------------------------------------------------------------- language --

const LANG_STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'your', 'this', 'that', 'are', 'will', 'have', 'has',
  'from', 'their', 'they', 'them', 'not', 'but', 'all', 'can', 'may', 'who', 'how', 'what', 'when',
  'more', 'other', 'than', 'into', 'across', 'within', 'work', 'working', 'role', 'roles', 'team',
  'teams', 'years', 'year', 'experience', 'required', 'preferred', 'qualifications', 'minimum',
  'additional', 'responsibilities', 'overview', 'ability', 'including', 'such', 'also', 'well',
  'new', 'one', 'two', 'both', 'must', 'should', 'would', 'could', 'been', 'being', 'was', 'were',
  'his', 'her', 'its', 'about', 'over', 'under', 'while', 'each', 'any', 'per', 'via', 'use',
  'used', 'using', 'make', 'made', 'help', 'helps', 'need', 'needs', 'these', 'those', 'there',
  'here', 'then', 'them', 'through', 'between', 'because', 'microsoft', 'company', 'employees',
  'equivalent', 'degree', 'bachelor', 'master', 'field', 'related', 'demonstrated', 'strong',
  'excellent', 'proven', 'skills', 'knowledge', 'understanding', 'apply', 'applicants', 'job',
  'position', 'positions', 'candidate', 'candidates', 'opportunity', 'opportunities', 'day', 'days',
  'most', 'many', 'ensure', 'ensuring', 'provide', 'providing', 'various', 'multiple', 'key',
  'high', 'level', 'best', 'same', 'own', 'out', 'off', 'end', 'part', 'set', 'directly', 'like',
  'want', 'able', 'you\u2019ll', 'we\u2019ll', 'join', 'looking', 'ways', 'time', 'right', 'first',
]);

/**
 * Tokens in document order, stopwords included. They have to stay in place:
 * dropping them first would make "value in its entirety" produce the bigram
 * "value entirety", a phrase nobody wrote.
 */
const tokenise = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9+#&./ -]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter(Boolean);

const isContentWord = (w) => w.length >= 3 && !LANG_STOP.has(w) && !/^\d+$/.test(w);

/**
 * Overlapping bigrams that always co-occur are fragments of one sentence, not
 * separate findings: an organisation blurb repeated across a dozen adverts
 * shows up as "sellers industry", "industry experts", "experts elite"… Chain
 * them back into the phrase they came from, so the reader sees the sentence
 * once instead of six slices of it.
 */
function chainPhrases(rows) {
  const bigrams = rows.filter((r) => r.term.includes(' '));
  const others = rows.filter((r) => !r.term.includes(' '));
  const used = new Set();
  const out = [];

  for (const seed of [...bigrams].sort((a, b) => b.lift - a.lift || b.count - a.count)) {
    if (used.has(seed.term)) continue;
    used.add(seed.term);
    let words = seed.term.split(' ');

    // Only chain rows with the same document frequency — that is what makes
    // them the same sentence rather than two phrases that merely share a word.
    const sameCount = (r) => !used.has(r.term) && r.count === seed.count;
    let grew = true;
    while (grew && words.length < 7) {
      grew = false;
      const right = bigrams.find((r) => sameCount(r) && r.term.split(' ')[0] === words[words.length - 1]);
      if (right) {
        words.push(right.term.split(' ')[1]);
        used.add(right.term);
        grew = true;
      }
      const left = bigrams.find((r) => sameCount(r) && r.term.split(' ')[1] === words[0]);
      if (left) {
        words.unshift(left.term.split(' ')[0]);
        used.add(left.term);
        grew = true;
      }
    }
    out.push({ ...seed, term: words.join(' ') });
  }

  return [...out, ...others];
}

/**
 * Phrases over-represented in the cohort's adverts against the rest of the book.
 *
 * Document frequency, not raw frequency, so a single advert repeating a phrase
 * ten times cannot manufacture a signal. Bigrams are kept alongside unigrams
 * because the interesting language here is phrasal — "industry solutions",
 * "customer success", "delivery excellence".
 */
function distinctiveLanguage(cohortText, restText, { min = 5, limit = 16 } = {}) {
  const dfIn = new Map();
  const dfOut = new Map();

  const count = (docs, into) => {
    for (const text of docs) {
      const words = tokenise(text);
      const seen = new Set();
      for (let i = 0; i < words.length; i++) {
        if (!isContentWord(words[i])) continue;
        seen.add(words[i]);
        if (i + 1 < words.length && isContentWord(words[i + 1])) {
          seen.add(`${words[i]} ${words[i + 1]}`);
        }
      }
      for (const t of seen) tally(into, t);
    }
  };
  count(cohortText, dfIn);
  count(restText, dfOut);

  const nIn = cohortText.length || 1;
  const nOut = restText.length || 1;

  const rows = [];
  for (const [term, inCount] of dfIn) {
    if (inCount < min) continue;
    const inShare = inCount / nIn;
    // Additive smoothing, so a phrase absent from the rest of the book gets a
    // large but finite lift rather than infinity.
    const outShare = ((dfOut.get(term) || 0) + 0.5) / nOut;
    const lift = inShare / outShare;
    if (lift < 1.6) continue;
    rows.push({
      term,
      count: inCount,
      share: +(inShare * 100).toFixed(1),
      restShare: +(((dfOut.get(term) || 0) / nOut) * 100).toFixed(1),
      lift: +lift.toFixed(1),
    });
  }

  // Prefer the longer phrase when a bigram carries the same evidence as one of
  // its own words: "industry solutions" is a finding, "industry" is not. Single
  // words also have to clear a higher bar, because on their own they are far
  // more often a house-style tic than a signal.
  const bigrams = rows.filter((r) => r.term.includes(' '));
  const covered = new Set(bigrams.flatMap((r) => r.term.split(' ')));
  const kept = rows.filter((r) =>
    r.term.includes(' ') ? true : !covered.has(r.term) && r.lift >= 3
  );

  return chainPhrases(kept)
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .slice(0, limit);
}

// -------------------------------------------------------------- the report --

export function buildFrontier(allJobs) {
  const open = allJobs.filter((j) => j.status === 'open');
  const cohort = open.filter((j) => FRONTIER_UNIT_IDS.includes(j.org));
  const rest = open.filter((j) => !FRONTIER_UNIT_IDS.includes(j.org));
  const n = cohort.length;

  if (!n) {
    return {
      generatedAt: new Date().toISOString(),
      cohortSize: 0,
      empty: true,
      note: 'No advert in this batch identifies itself as part of the Frontier organisation.',
    };
  }

  const named = open.filter((j) => j.org);
  const mcaps = named.filter((j) => UNIT_META[j.org]?.parent === 'mcaps');
  const engineering = named.filter((j) => UNIT_META[j.org]?.parent === 'engineering');

  // ---- composition --------------------------------------------------------
  const units = compare(
    cohort,
    rest,
    (j) => (j.org ? [j.org] : []),
    (k) => UNIT_META[k]?.label ?? k,
    (k) => UNIT_META[k]?.blurb ?? ''
  );

  const industries = compare(
    cohort,
    rest,
    (j) => j.industries || [],
    (k) => INDUSTRY_META[k]?.label ?? k,
    (k) => INDUSTRY_META[k]?.blurb ?? ''
  );

  const archetypes = compare(
    cohort,
    rest,
    (j) => [j.archetype || 'other'],
    (k) => ARCHETYPE_LABELS[k] ?? k,
    (k) => ARCHETYPE_META[k]?.blurb ?? ''
  );

  const capabilities = compare(cohort, rest, (j) => j.products || [], (k) => k, null, { min: 3, limit: 18 });
  const clusterMix = compare(
    cohort,
    rest,
    (j) => j.themes || [],
    (k) => THEME_LABELS[k] ?? k,
    null,
    { min: 3, limit: 12 }
  );
  const initiatives = compare(
    cohort,
    rest,
    (j) => j.initiatives || [],
    (k) => INITIATIVE_META[k]?.label ?? k,
    (k) => INITIATIVE_META[k]?.blurb ?? '',
    { min: 2 }
  );
  const solutionAreas = compare(
    cohort,
    rest,
    (j) => j.solutionAreas || [],
    (k) => SOLUTION_LABELS[k] ?? k,
    null,
    { min: 2 }
  );

  const seniority = compare(cohort, rest, (j) => [j.seniority], (k) => k);

  const countryKeys = (j) => [
    ...new Set((j.locations || []).map((l, i) => parseLocation(l, j.countryCodes?.[i]).country)),
  ];
  const countries = compare(cohort, rest, countryKeys, (k) => k, null, { limit: 14 });
  const travel = compare(cohort, rest, (j) => [j.travel || 'Unspecified'], (k) => k);

  // ---- delivery vs demand -------------------------------------------------
  const deliveryCount = cohort.filter((j) => DELIVERY_ARCHETYPES.has(j.archetype)).length;
  const demandCount = cohort.filter((j) => DEMAND_ARCHETYPES.has(j.archetype)).length;
  const leadershipCount = cohort.filter((j) => LEADERSHIP.has(j.seniority)).length;
  const deliveryToDemand = demandCount ? +(deliveryCount / demandCount).toFixed(2) : null;

  // ---- time ---------------------------------------------------------------
  const monthTotals = new Map();
  for (const j of cohort) {
    const mk = monthKey(j.creationTs);
    if (mk) tally(monthTotals, mk);
  }
  const months = [...monthTotals.keys()].sort().slice(-12);
  const byUnit = monthlySeries(cohort, months, (j) => (j.org ? [j.org] : []), (k) => UNIT_META[k]?.label ?? k);
  const byIndustry = monthlySeries(
    cohort,
    months,
    (j) => j.industries || [],
    (k) => INDUSTRY_META[k]?.label ?? k
  );
  const byArchetype = monthlySeries(cohort, months, (j) => [j.archetype || 'other'], (k) => ARCHETYPE_LABELS[k] ?? k);

  const cutoff90 = Date.now() / 1000 - 90 * 86400;
  const cutoff60 = Date.now() / 1000 - 60 * 86400;
  const cutoff30 = Date.now() / 1000 - 30 * 86400;
  const recent90 = cohort.filter((j) => j.creationTs && j.creationTs >= cutoff90).length;
  const recent60 = cohort.filter((j) => j.creationTs && j.creationTs >= cutoff60).length;
  const recent30 = cohort.filter((j) => j.creationTs && j.creationTs >= cutoff30).length;
  const bookRecent90 = open.filter((j) => j.creationTs && j.creationTs >= cutoff90).length;
  const bookRecent60 = open.filter((j) => j.creationTs && j.creationTs >= cutoff60).length;
  const cohortShareOfBook = pct(n, open.length);
  const cohortShareOfRecent = pct(recent90, bookRecent90);
  const growthIndex = cohortShareOfBook ? +(cohortShareOfRecent / cohortShareOfBook).toFixed(2) : null;
  // How new the cohort is against how new the book is. A delivery arm being
  // stood up looks very different from one being maintained.
  const newness = {
    cohort60: pct(recent60, n),
    book60: pct(bookRecent60, open.length),
  };

  const momentum = {
    windowDays: 30,
    recent90,
    recent60,
    recent30,
    newness,
    shareOfBook: cohortShareOfBook,
    shareOfRecent: cohortShareOfRecent,
    growthIndex,
    byIndustry: recencyIndex(cohort, (j) => j.industries || []).map((r) => ({
      ...r,
      label: INDUSTRY_META[r.key]?.label ?? r.key,
    })),
    byArchetype: recencyIndex(cohort, (j) => [j.archetype || 'other']).map((r) => ({
      ...r,
      label: ARCHETYPE_LABELS[r.key] ?? r.key,
    })),
    byUnit: recencyIndex(cohort, (j) => (j.org ? [j.org] : [])).map((r) => ({
      ...r,
      label: UNIT_META[r.key]?.label ?? r.key,
    })),
  };

  const timeline = {
    months,
    totals: months.map((m) => monthTotals.get(m) || 0),
    byUnit,
    byIndustry,
    byArchetype,
    shift: {
      windowMonths: 3,
      industry: shareShift(byIndustry, months),
      archetype: shareShift(byArchetype, months),
    },
  };

  // ---- language -----------------------------------------------------------
  const textOf = (j) => stripBoilerplate(toPlainText(j.descriptionHtml || '')) || j.overview || '';
  const texts = new Map(open.map((j) => [j.id, textOf(j)]));
  const withText = (list) => list.map((j) => texts.get(j.id) || '').filter((t) => t.length > 200);
  const language = distinctiveLanguage(withText(cohort), withText(rest));

  // ---- the wider surface ---------------------------------------------------
  // Adverts that *name* Frontier, ISD or FDE without claiming membership. These
  // are not part of the cohort — the whole point of the self-identification rule
  // is that naming a team is not belonging to it — but they say something else
  // worth knowing: which other parts of the company are being staffed to work
  // with the delivery arm.
  const surfaceJobs = rest.filter((j) => FRONTIER_MENTION.test(texts.get(j.id) || ''));
  const surface = {
    count: surfaceJobs.length,
    share: pct(surfaceJobs.length, open.length),
    byProfession: compare(
      surfaceJobs,
      rest.filter((j) => !FRONTIER_MENTION.test(texts.get(j.id) || '')),
      (j) => [j.profession || 'Unspecified'],
      (k) => k,
      null,
      { min: 2, limit: 8 }
    ),
  };

  // ---- how the cohort differs from the other two divisions -----------------
  // Travel and role type are blank on any advert whose detail record has not
  // been fetched yet, so both are measured against the adverts that state them
  // rather than against the whole group.
  const profile = (list) => {
    const size = list.length || 1;
    const withIndustry = list.filter((j) => (j.industries || []).length).length;
    const roleTypeStated = list.filter((j) => j.roleType === 'People Manager' || j.roleType === 'Individual Contributor');
    const managers = roleTypeStated.filter((j) => j.roleType === 'People Manager').length;
    const travelStated = list.filter((j) => j.travel && !/unspecified/i.test(j.travel));
    const travelHeavy = travelStated.filter((j) => /^(25|50|75)/.test(j.travel)).length;
    const agentic = list.filter((j) => (j.initiatives || []).includes('agentic')).length;
    const seniorPlus = list.filter((j) => SENIOR_PLUS.has(j.seniority)).length;
    const delivery = list.filter((j) => DELIVERY_ARCHETYPES.has(j.archetype)).length;
    const consulting = list.filter((j) => CONSULTING_ARCHETYPES.has(j.archetype)).length;
    const selling = list.filter((j) => DEMAND_ARCHETYPES.has(j.archetype)).length;
    return {
      count: list.length,
      industryShare: pct(withIndustry, size),
      managerShare: pct(managers, roleTypeStated.length),
      travelShare: pct(travelHeavy, travelStated.length),
      agenticShare: pct(agentic, size),
      seniorPlusShare: pct(seniorPlus, size),
      deliveryShare: pct(delivery, size),
      consultingShare: pct(consulting, size),
      sellingShare: pct(selling, size),
    };
  };

  const contrast = {
    rows: [
      { key: 'frontier', label: 'Microsoft Frontier Company', ...profile(cohort) },
      { key: 'mcaps', label: 'Customer & Partner Solutions (MCAPS)', ...profile(mcaps) },
      { key: 'engineering', label: 'Engineering & product divisions', ...profile(engineering) },
    ],
    cols: [
      { key: 'count', label: 'Roles', format: 'int' },
      { key: 'consultingShare', label: 'Consulting-shaped', format: 'pct' },
      { key: 'sellingShare', label: 'Selling-shaped', format: 'pct' },
      { key: 'industryShare', label: 'Names an industry', format: 'pct' },
      { key: 'agenticShare', label: 'Cites agentic AI', format: 'pct' },
      { key: 'travelShare', label: 'Travel 25%+', format: 'pct' },
      { key: 'seniorPlusShare', label: 'Senior IC and above', format: 'pct' },
      { key: 'managerShare', label: 'People manager', format: 'pct' },
    ],
  };

  // ---- the roles themselves ------------------------------------------------
  const pipeline = [...cohort]
    .sort((a, b) => (b.creationTs || 0) - (a.creationTs || 0))
    .slice(0, 24)
    .map((j) => ({
      title: j.title,
      unit: UNIT_META[j.org]?.label ?? j.org,
      archetype: ARCHETYPE_LABELS[j.archetype] ?? j.archetype,
      industries: (j.industries || []).map((k) => INDUSTRY_META[k]?.label ?? k),
      seniority: j.seniority,
      location: [
        ...new Set(
          (j.locations || []).map((l, i) => {
            const p = parseLocation(l, j.countryCodes?.[i]);
            return cityLabel(p.city, p.country);
          })
        ),
      ]
        .slice(0, 3)
        .join(' | '),
      creationTs: j.creationTs,
      url: j.url,
    }));

  // ---- narrative -----------------------------------------------------------
  const isd = units.find((u) => u.key === 'isd');
  const fde = units.find((u) => u.key === 'fde');
  const topIndustries = industries.slice(0, 3);
  const topArchetypes = archetypes.slice(0, 3);
  const risingIndustry = momentum.byIndustry.find((r) => r.index >= 1.2);
  const fadingIndustry = [...momentum.byIndustry].reverse().find((r) => r.index > 0 && r.index <= 0.8);
  const NOT_A_SHAPE = new Set(['other', 'business_support']);
  const risingArchetype = momentum.byArchetype.find((r) => r.index >= 1.2 && !NOT_A_SHAPE.has(r.key));
  const topCapability = capabilities.slice(0, 4);
  const usRow = countries.find((c) => c.key === 'United States');
  // Quote phrases that do not share a word with one already quoted, so the
  // sentence does not read as four slices of the same clause. Two-word phrases
  // read cleanest, so they are taken first.
  const quotable = [];
  const quotedWords = new Set();
  for (const maxWords of [2, 3]) {
    for (const t of language) {
      if (quotable.length === 4) break;
      const words = t.term.split(' ');
      if (words.length !== maxWords || words.some((w) => quotedWords.has(w))) continue;
      words.forEach((w) => quotedWords.add(w));
      quotable.push(t);
    }
  }
  const agenticShare = contrast.rows[0].agenticShare;
  const engAgentic = contrast.rows[2].agenticShare;
  const contrastPreview = {
    consultingShare: contrast.rows[0].consultingShare,
    engConsulting: contrast.rows[2].consultingShare,
  };

  const kpis = [
    { label: 'Frontier roles', value: n.toLocaleString('en-US'), sub: `${cohortShareOfBook}% of the open book` },
    {
      label: 'Inside ISD',
      value: isd ? `${pct(isd.count, n)}%` : 'n/a',
      sub: isd ? `${plural(isd.count, 'role', 'roles')} of ${n}` : 'no ISD role identified',
    },
    {
      label: 'Delivery : demand',
      value: deliveryToDemand !== null ? `${deliveryToDemand}:1` : 'n/a',
      sub: `${deliveryCount} delivery-shaped vs ${demandCount} selling`,
    },
    {
      label: 'Consulting-shaped',
      value: `${contrastPreview.consultingShare}%`,
      sub: `engineering divisions ${contrastPreview.engConsulting}%`,
    },
    {
      label: 'Cite agentic AI',
      value: `${agenticShare}%`,
      sub: `engineering divisions ${engAgentic}%`,
    },
    {
      label: 'Lead industry',
      value: topIndustries[0] ? `${topIndustries[0].share}%` : 'n/a',
      sub: topIndustries[0] ? topIndustries[0].label : 'no vertical named at scale',
    },
  ];

  const reading = [
    `The Frontier organisation identifies itself on ${plural(n, 'advert', 'adverts')} \u2014 ${cohortShareOfBook}% of the open book \u2014 split ${units
      .map((u) => `${shortLabel(u.label)} ${u.count}`)
      .join(', ')}. Detection needs the advert to name its own organisation, so this is a floor, not a census.`,

    deliveryToDemand !== null
      ? `Composition is ${deliveryToDemand}:1 delivery-shaped to demand-shaped \u2014 ${deliveryCount} architect, consultant, engineering and delivery-management roles against ${plural(demandCount, 'selling role', 'selling roles')}. ${
          deliveryToDemand >= 2
            ? 'Frontier is being staffed to execute work that has already been sold, not to go and sell it.'
            : deliveryToDemand >= 1
              ? 'Delivery and demand capacity are being added roughly in step.'
              : 'The cohort is weighted toward creating demand rather than delivering against it.'
        }`
      : `All ${deliveryCount} delivery-shaped roles in the cohort are matched by no selling role at all \u2014 nothing here is being hired to generate demand.`,

    topArchetypes.length
      ? `The shape of the hire is ${topArchetypes
          .map((a) => `${a.label} (${a.count}${a.index ? `, ${a.index}\u00d7 the rest of the book` : ''})`)
          .join(', ')}. ${
          leadershipCount
            ? `${plural(leadershipCount, 'posting carries', 'postings carry')} a manager, director or VP title, which is management scaffolding rather than billable capacity.`
            : 'No management title is open, so this is capacity rather than restructuring.'
        }`
      : '',

    `${newness.cohort60}% of the cohort was created in the last 60 days, against ${newness.book60}% of the whole open book. ${
      newness.cohort60 >= newness.book60 * 1.3
        ? 'This organisation is being stood up, not maintained \u2014 most of what it is advertising did not exist a quarter ago.'
        : 'Its hiring is no newer than the company\u2019s as a whole.'
    }`,

    topIndustries.length
      ? `${contrast.rows[0].industryShare}% of Frontier adverts commit to an industry vertical, against ${contrast.rows[1].industryShare}% in MCAPS and ${contrast.rows[2].industryShare}% in the engineering divisions. It is still a minority of the cohort, but it is several times the rest of the company, and it is the clearest evidence that this organisation is structured by market rather than by product. Where a vertical is named it is ${topIndustries
          .map((v) => `${v.label} (${v.count})`)
          .join(', ')}.`
      : 'No Frontier advert commits to an industry vertical in this batch, which is itself notable for an industry-organised delivery arm.',

    risingIndustry
      ? `Direction of travel by vertical: ${risingIndustry.label} takes ${risingIndustry.index}\u00d7 its baseline share of the cohort's last ${momentum.windowDays} days${
          fadingIndustry ? `, while ${fadingIndustry.label} takes ${fadingIndustry.index}\u00d7` : ''
        }. On a cohort this size, read that as a lean, not a trend.`
      : 'No vertical is materially over-represented in the cohort\u2019s recent postings \u2014 the industry mix is holding steady.',

    risingArchetype
      ? `By role shape, ${risingArchetype.label} is over-represented in the last ${momentum.windowDays} days at ${risingArchetype.index}\u00d7 baseline \u2014 the clearest near-term signal of what the organisation thinks it is short of.`
      : 'No role shape is materially over-represented in recent postings.',

    `Against the other two divisions, Frontier is ${contrast.rows[0].consultingShare}% consulting-shaped \u2014 architects, consultants and engagement leads \u2014 against MCAPS ${contrast.rows[1].consultingShare}% and the engineering divisions ${contrast.rows[2].consultingShare}%. It names an industry on ${contrast.rows[0].industryShare}% of adverts (MCAPS ${contrast.rows[1].industryShare}%, engineering ${contrast.rows[2].industryShare}%), and of the adverts that state a travel requirement, ${contrast.rows[0].travelShare}% ask for 25% or more (MCAPS ${contrast.rows[1].travelShare}%, engineering ${contrast.rows[2].travelShare}%).`,

    topCapability.length
      ? `The named capability stack is ${topCapability.map((c) => `${c.label} (${c.count})`).join(', ')}. ${
          agenticShare >= engAgentic
            ? `Agentic AI is cited on ${agenticShare}% of Frontier adverts against ${engAgentic}% in the engineering divisions \u2014 the delivery arm is talking about agents more than the people building them.`
            : `Agentic AI is cited on ${agenticShare}% of Frontier adverts against ${engAgentic}% in the engineering divisions.`
        }`
      : '',

    countries.length
      ? `Geographically the cohort sits in ${countries.length} countries, led by ${countries
          .slice(0, 4)
          .map((c) => `${c.key} (${c.count})`)
          .join(', ')}. ${
          usRow && usRow.restShare && usRow.share < usRow.restShare * 0.75
            ? `The United States takes ${usRow.share}% of this cohort against ${usRow.restShare}% of the rest of the book \u2014 a markedly less US-weighted footprint, which is what a delivery organisation following customer demand looks like rather than one following the product groups.`
            : 'The footprint tracks the wider book.'
        }`
      : '',

    language.length && quotable.length
      ? `The language that separates these adverts from the rest of the book is ${quotable
          .map((t) => `"${t.term}"`)
          .join(', ')} \u2014 phrasing about engagements and customer outcomes rather than about shipping product.`
      : '',

    surface.count
      ? `A further ${plural(surface.count, 'advert', 'adverts')} (${surface.share}% of the book) name Frontier, ISD or FDE without claiming membership \u2014 roles told to work with the delivery arm rather than inside it. They cluster in ${surface.byProfession
          .slice(0, 3)
          .map((p) => `${p.label} (${p.count})`)
          .join(', ')}, which is the surface area the organisation is being wired into.`
      : 'No advert outside the cohort names Frontier, ISD or FDE, so the organisation has little visible surface area in the rest of the book.',
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    empty: false,
    cohortSize: n,
    cohortShare: cohortShareOfBook,
    openBook: open.length,
    coverage: {
      identified: named.length,
      identifiedShare: pct(named.length, open.length),
    },
    kpis,
    units,
    industries,
    archetypes,
    capabilities,
    clusterMix,
    initiatives,
    solutionAreas,
    seniority,
    countries,
    travel,
    delivery: {
      deliveryCount,
      demandCount,
      leadershipCount,
      deliveryToDemand,
      deliveryShare: pct(deliveryCount, n),
    },
    momentum,
    timeline,
    language,
    surface,
    contrast,
    pipeline,
    reading,
  };
}
