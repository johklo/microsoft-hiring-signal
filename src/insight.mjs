/**
 * Turns the raw breakdowns into a one-page executive brief: what Microsoft is
 * staffing for, where the momentum is, and what that implies about direction.
 *
 * Everything here is derived arithmetically from the postings — no guesswork.
 * Where a metric has a known bias, the caveat is stated in the output.
 */

import { parseLocation } from './taxonomy.mjs';

const pct = (n, d) => (d ? +((n / d) * 100).toFixed(1) : 0);
const plural = (n, s, p) => `${n.toLocaleString('en-US')} ${n === 1 ? s : p}`;

/** Which broad function a profession serves. */
const FUNCTION_GROUPS = [
  {
    id: 'build',
    label: 'Build the product',
    match: /software engineering|hardware engineering|research, applied|security engineering|quantum|design & creative|product management|program management|technical program/i,
  },
  {
    id: 'capacity',
    label: 'Build the capacity',
    match: /data center|real estate|supply chain|manufacturing|construction/i,
  },
  {
    id: 'gtm',
    label: 'Sell & serve',
    match: /sales|customer success|consulting|technical support|marketing|business development|partner|evangelism/i,
  },
  {
    id: 'run',
    label: 'Run the company',
    match: /finance|human resources|legal|business operations|administration|governance, risk|communications|security & safety/i,
  },
];

function groupFor(profession = '') {
  for (const g of FUNCTION_GROUPS) if (g.match.test(profession)) return g;
  return { id: 'other', label: 'Other / unclassified' };
}

const LEADERSHIP = new Set(['Manager', 'Director', 'General Manager', 'Vice President+']);
const DEEP_IC = new Set(['Principal', 'Partner (Distinguished)', 'Lead / Staff']);

/**
 * Recency skew: a theme's share of the last-30-days postings divided by its
 * share of all open postings. >1 means it is over-represented in recent hiring.
 * Biased slightly upward for fast-closing roles, hence reported as an index.
 */
function recencySkew(jobs, keyFn, minCount) {
  const cutoff = Date.now() / 1000 - 30 * 86400;
  const total = new Map();
  const recent = new Map();
  let totalAll = 0;
  let recentAll = 0;

  for (const j of jobs) {
    const keys = keyFn(j);
    if (!keys.length) continue;
    const isRecent = j.creationTs && j.creationTs >= cutoff;
    totalAll++;
    if (isRecent) recentAll++;
    for (const k of keys) {
      total.set(k, (total.get(k) || 0) + 1);
      if (isRecent) recent.set(k, (recent.get(k) || 0) + 1);
    }
  }

  const out = [];
  for (const [k, t] of total) {
    if (t < minCount) continue;
    const r = recent.get(k) || 0;
    const overallShare = t / totalAll;
    const recentShare = recentAll ? r / recentAll : 0;
    out.push({
      key: k,
      total: t,
      recent: r,
      index: overallShare ? +(recentShare / overallShare).toFixed(2) : 0,
    });
  }
  return out.sort((a, b) => b.index - a.index);
}

export function buildBrief(jobs, stats, history) {
  const open = jobs.filter((j) => j.status === 'open');
  const n = open.length;
  const themeMap = new Map(stats.themes.map((t) => [t.key, t]));
  const get = (list, key) => list.find((x) => x.key === key)?.count ?? 0;

  // ---- function mix -------------------------------------------------------
  const fnCounts = new Map();
  for (const j of open) {
    const g = groupFor(j.profession || '');
    fnCounts.set(g.label, (fnCounts.get(g.label) || 0) + 1);
  }
  const functionMix = [...fnCounts.entries()]
    .map(([label, count]) => ({ label, count, share: pct(count, n) }))
    .sort((a, b) => b.count - a.count);

  const build = fnCounts.get('Build the product') || 0;
  const gtm = fnCounts.get('Sell & serve') || 0;
  const capacity = fnCounts.get('Build the capacity') || 0;
  const run = fnCounts.get('Run the company') || 0;
  const buildToSell = gtm ? +(build / gtm).toFixed(2) : null;

  // ---- org shape ----------------------------------------------------------
  const sen = stats.breakdowns.seniority;
  const leadership = sen.filter((s) => LEADERSHIP.has(s.key)).reduce((a, b) => a + b.count, 0);
  const deepIC = sen.filter((s) => DEEP_IC.has(s.key)).reduce((a, b) => a + b.count, 0);
  const earlyCareer =
    get(sen, 'Intern / University') + get(sen, 'Associate / Entry');
  const managerRoles = get(stats.breakdowns.roleType, 'People Manager');
  const icRoles = get(stats.breakdowns.roleType, 'Individual Contributor');

  // ---- work model ---------------------------------------------------------
  const ws = stats.breakdowns.workSite;
  const inOfficeHeavy = ws
    .filter((x) => /^[3-5] days/i.test(x.key) || /fully on-site/i.test(x.key))
    .reduce((a, b) => a + b.count, 0);
  const fullyRemote = ws.filter((x) => /remote/i.test(x.key)).reduce((a, b) => a + b.count, 0);
  const wsKnown = ws.filter((x) => x.key !== 'Unspecified').reduce((a, b) => a + b.count, 0);

  // ---- momentum -----------------------------------------------------------
  const themeSkew = recencySkew(open, (j) => j.themes || [], 25);
  const countrySkew = recencySkew(
    open,
    (j) => [...new Set((j.locations || []).map((l, i) => parseLocation(l, j.countryCodes?.[i]).country))],
    25
  );
  const rising = themeSkew.filter((t) => t.index >= 1.15).slice(0, 5);
  const cooling = [...themeSkew].reverse().filter((t) => t.index <= 0.85 && t.index > 0).slice(0, 4);

  const cutoff30 = Date.now() / 1000 - 30 * 86400;
  const posted30 = open.filter((j) => j.creationTs && j.creationTs >= cutoff30).length;
  const label = (k) => themeMap.get(k)?.label ?? k;

  // ---- observed net change (needs >=2 runs) -------------------------------
  const netSeries = history.filter((h) => typeof h.totalOpen === 'number');
  const netChange =
    netSeries.length >= 2
      ? netSeries[netSeries.length - 1].totalOpen - netSeries[0].totalOpen
      : null;
  const observedAdds = history.reduce((a, h) => a + (h.added || 0), 0);
  const observedRemovals = history.reduce((a, h) => a + (h.removed || 0), 0);

  const topThemes = stats.themes.slice(0, 6);
  const topCountries = stats.breakdowns.country.slice(0, 6);
  const usShare = pct(get(stats.breakdowns.country, 'United States'), n);
  const aiShare = themeMap.get('ai_copilot')?.share ?? 0;
  const dcShare = themeMap.get('datacenter')?.share ?? 0;
  const siliconShare = themeMap.get('silicon')?.share ?? 0;
  const secShare = themeMap.get('security')?.share ?? 0;

  // Clusters overlap, so this must be the union of roles touching any of the
  // three — summing the three shares would double-count multi-tagged roles.
  const INFRA = new Set(['ai_copilot', 'datacenter', 'silicon']);
  const infraCount = open.filter((j) => (j.themes || []).some((t) => INFRA.has(t))).length;
  const infraBet = pct(infraCount, n);

  // ---- narrative ----------------------------------------------------------
  const headline =
    `Microsoft is advertising ${plural(n, 'open role', 'open roles')} across ` +
    `${stats.meta.countries} countries. The largest single strategic cluster is ` +
    `${topThemes[0] ? `${topThemes[0].label} (${topThemes[0].share}% of postings)` : 'n/a'}, ` +
    `and ${infraBet}% of all postings touch the AI / datacenter / silicon build-out.`;

  const sections = [
    {
      title: 'What the company is staffing for',
      points: [
        `The top three strategic clusters are ${topThemes.slice(0, 3).map((t) => `${t.label} (${t.count})`).join(', ')}.`,
        `${plural(build, 'role', 'roles')} (${pct(build, n)}%) build the product, ` +
          `${plural(capacity, 'role', 'roles')} (${pct(capacity, n)}%) build physical capacity, ` +
          `${plural(gtm, 'role', 'roles')} (${pct(gtm, n)}%) sell and serve, and ` +
          `${plural(run, 'role', 'roles')} (${pct(run, n)}%) run the company.`,
        buildToSell !== null
          ? `The build-to-sell ratio is ${buildToSell}:1 \u2014 ${
              buildToSell >= 1.5
                ? 'weighted toward creating new capability rather than monetising existing capability.'
                : buildToSell >= 0.9
                  ? 'roughly balanced between creating capability and monetising it.'
                  : 'weighted toward monetising existing products rather than building new ones.'
            }`
          : 'Go-to-market postings are too few to compute a build-to-sell ratio.',
        `Security appears in ${secShare}% of postings, indicating it is treated as a cross-cutting requirement rather than a single team.`,
      ],
    },
    {
      title: 'Where the momentum is',
      points: [
        `${plural(posted30, 'posting', 'postings')} (${pct(posted30, n)}% of the open book) were created in the last 30 days.`,
        rising.length
          ? `Over-represented in recent postings: ${rising.map((t) => `${label(t.key)} (index ${t.index})`).join(', ')}. An index above 1.0 means the theme takes a larger share of new postings than of the total.`
          : 'No theme is materially over-represented in recent postings \u2014 hiring is broad-based.',
        cooling.length
          ? `Under-represented in recent postings: ${cooling.map((t) => `${label(t.key)} (index ${t.index})`).join(', ')}.`
          : 'No theme is materially under-represented in recent postings.',
        countrySkew.filter((c) => c.index >= 1.2).length
          ? `Geographies growing faster than their baseline: ${countrySkew.filter((c) => c.index >= 1.2).slice(0, 5).map((c) => `${c.key} (${c.index})`).join(', ')}.`
          : 'Recent postings follow the existing geographic footprint.',
      ],
    },
    {
      title: 'How the organisation is being shaped',
      points: [
        `Leadership-titled postings (Manager through VP) account for ${pct(leadership, n)}% of the book; deep individual-contributor titles (Lead/Staff, Principal, Partner) account for ${pct(deepIC, n)}%.`,
        icRoles || managerRoles
          ? `By declared role type the split is ${pct(icRoles, icRoles + managerRoles)}% individual contributor to ${pct(managerRoles, icRoles + managerRoles)}% people manager \u2014 ${
              pct(managerRoles, icRoles + managerRoles) > 15
                ? 'a notable layer of new management scaffolding, which typically accompanies org expansion.'
                : 'a flat structure, consistent with deepening existing teams rather than adding management layers.'
            }`
          : 'Role type is not declared on enough postings to assess the IC/manager split.',
        earlyCareer
          ? `Early-career and university postings are ${pct(earlyCareer, n)}% of the book \u2014 ${
              pct(earlyCareer, n) >= 8
                ? 'an active long-term talent pipeline.'
                : 'a modest pipeline, with hiring concentrated on experienced staff.'
            }`
          : 'No early-career pipeline is visible in the current book.',
      ],
    },
    {
      title: 'Location and working model',
      points: [
        `${usShare}% of postings include a United States location. The next largest markets are ${topCountries.filter((c) => c.key !== 'United States').slice(0, 4).map((c) => `${c.key} (${c.count})`).join(', ')}.`,
        `${stats.meta.multiLocation} postings (${pct(stats.meta.multiLocation, n)}%) list more than one location, indicating roles staffed opportunistically across sites.`,
        wsKnown
          ? `Of postings that state a work-site policy, ${pct(inOfficeHeavy, wsKnown)}% require three or more days on-site and ${pct(fullyRemote, wsKnown)}% are fully remote.`
          : 'Few postings declare a work-site policy.',
      ],
    },
  ];

  const outlook = [
    infraBet >= 25
      ? `With ${infraBet}% of hiring tied to AI, datacenter and silicon, the advertised plan is capital- and capability-led: Microsoft is staffing to expand the supply of AI compute, not just the demand for it.`
      : `AI, datacenter and silicon account for ${infraBet}% of hiring \u2014 significant but not dominant; the plan reads as broad-based rather than single-bet.`,
    gtm && build
      ? buildToSell >= 1.3
        ? 'Engineering is being added faster than field capacity, which usually precedes a product-expansion cycle rather than a revenue-harvest cycle.'
        : 'Field and customer-facing capacity is keeping pace with (or exceeding) engineering, which points to a monetisation and adoption push on products that already exist.'
      : 'Insufficient signal to compare build and go-to-market intent.',
    rising.length
      ? `The clearest forward signal is ${label(rising[0].key)}: it takes ${rising[0].index}\u00d7 its baseline share of the last 30 days of postings.`
      : 'No single theme dominates recent postings; near-term direction looks like continuation of the current mix.',
    countrySkew.filter((c) => c.index >= 1.2).length
      ? `Geographic expansion is skewing toward ${countrySkew.filter((c) => c.index >= 1.2).slice(0, 3).map((c) => c.key).join(', ')}, suggesting capacity or market development outside the established hubs.`
      : 'Geographic strategy appears stable, concentrated in existing hubs.',
    netChange !== null
      ? `Since tracking began, the open book has moved ${netChange >= 0 ? '+' : ''}${netChange} roles, with ${observedAdds} postings opened and ${observedRemovals} closed \u2014 ${
          netChange > 0 ? 'net expansion.' : netChange < 0 ? 'net contraction.' : 'flat.'
        }`
      : 'Run this batch daily \u2014 after the second run this brief will also report observed net expansion or contraction over time.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    headline,
    metrics: {
      openRoles: n,
      countries: stats.meta.countries,
      infraBetShare: infraBet,
      aiShare,
      datacenterShare: dcShare,
      siliconShare,
      securityShare: secShare,
      buildToSell,
      buildShare: pct(build, n),
      gtmShare: pct(gtm, n),
      capacityShare: pct(capacity, n),
      runShare: pct(run, n),
      posted30,
      posted30Share: pct(posted30, n),
      leadershipShare: pct(leadership, n),
      deepICShare: pct(deepIC, n),
      earlyCareerShare: pct(earlyCareer, n),
      managerSplit: icRoles + managerRoles ? pct(managerRoles, icRoles + managerRoles) : null,
      fullyRemoteShare: wsKnown ? pct(fullyRemote, wsKnown) : null,
      inOfficeHeavyShare: wsKnown ? pct(inOfficeHeavy, wsKnown) : null,
      usShare,
      netChange,
      observedAdds,
      observedRemovals,
      topTheme: topThemes[0] ? { label: topThemes[0].label, count: topThemes[0].count, share: topThemes[0].share } : null,
    },
    kpis: [
      { label: 'Open roles', value: n.toLocaleString('en-US'), sub: `${stats.meta.countries} countries` },
      { label: 'AI / DC / silicon share', value: `${infraBet}%`, sub: 'of all postings' },
      { label: 'Build : sell', value: buildToSell !== null ? `${buildToSell}:1` : 'n/a', sub: 'engineering vs field roles' },
      { label: 'Posted last 30d', value: posted30.toLocaleString('en-US'), sub: `${pct(posted30, n)}% of open book` },
      { label: 'Leadership titles', value: `${pct(leadership, n)}%`, sub: 'Manager \u2192 VP' },
      { label: 'Fully remote', value: wsKnown ? `${pct(fullyRemote, wsKnown)}%` : 'n/a', sub: 'of policy-stated roles' },
    ],
    functionMix,
    rising: rising.map((t) => ({ label: label(t.key), index: t.index, total: t.total, recent: t.recent })),
    cooling: cooling.map((t) => ({ label: label(t.key), index: t.index, total: t.total, recent: t.recent })),
    geoMomentum: countrySkew.slice(0, 8).map((c) => ({ label: c.key, index: c.index, total: c.total, recent: c.recent })),
    sections,
    outlook,
    caveats: [
      'Based only on publicly advertised roles on careers.microsoft.com; internal transfers and unadvertised hiring are not visible.',
      'A posting is not a hire \u2014 volumes indicate intent and capacity planning, not headcount actually added.',
      'The momentum index compares each theme\u2019s share of the last 30 days of postings against its share of the whole open book. Roles that close quickly are slightly under-counted.',
      'Theme tagging is keyword-based over title, profession, discipline and description; a posting can carry several themes.',
    ],
  };
}
