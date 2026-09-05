import { stripBoilerplate, toPlainText } from './taxonomy.mjs';

const SIGNALS = [
  {
    id: 'production-ai',
    label: 'Make AI work in production',
    terms: /\b(?:AI|artificial intelligence|agentic|copilot|machine learning)\b/i,
    action: /\b(?:deploy\w*|production|implement\w*|build\w*|operationali[sz]\w*)\b/i,
    inference: 'One possible role for ISD is turning AI ambition into implemented customer systems, rather than remaining a general-purpose consulting supplier.',
    risk: 'AI vocabulary alone does not show production ownership, successful delivery or a profitable services model.',
    watch: 'Look for explicit production accountability, operating metrics and customer references, not just more AI mentions.',
  },
  {
    id: 'business-outcomes',
    label: 'Sell industry and business outcomes',
    terms: /\b(?:business outcomes?|customer outcomes?|business value|return on investment|ROI|industry-specific)\b/i,
    action: /\b(?:deliver(?:s|ed|ing)?|driv\w*|reali[sz]\w*|measur\w*|achiev\w*|transform\w*)\b/i,
    inference: 'ISD could differentiate through customer context and measurable outcomes that a product team or generic implementation partner cannot supply alone.',
    risk: 'Outcome-oriented language is not evidence that customers pay a premium or that ISD owns the commercial relationship.',
    watch: 'Look for named industries, accountable outcome measures and ownership of complex engagements.',
  },
  {
    id: 'reusable-delivery',
    label: 'Scale beyond one-off engagements',
    terms: /\b(?:reusab\w*|repeatab\w*|accelerators?|intellectual property|delivery assets?)\b/i,
    action: /\b(?:build\w*|develop\w*|creat\w*|scal\w*|engineer\w*|standard\w*|leverag\w*)\b/i,
    inference: 'Reusable delivery assets could let ISD spread implementation knowledge across customers and complement Frontier engineering work.',
    risk: 'A request to create accelerators does not establish asset reuse, better margins or a formal division of work with FDE.',
    watch: 'Look for asset ownership, reuse targets, product feedback loops and named hand-offs between ISD and FDE.',
  },
  {
    id: 'adoption',
    label: 'Connect delivery to lasting adoption',
    terms: /\b(?:adoption|consumption|productive use|time.to.value)\b/i,
    action: /\b(?:accelerat\w*|driv\w*|enabl\w*|deliver(?:s|ed|ing)?|increas\w*|improv\w*)\b/i,
    inference: 'A plausible value proposition is helping customers use Microsoft technology after implementation, linking delivery work to sustained platform value.',
    risk: 'Adoption language does not prove incremental revenue or distinguish ISD ownership from CSU and partner responsibilities.',
    watch: 'Look for post-deployment accountability and explicit collaboration boundaries with CSU and partners.',
  },
  {
    id: 'trusted-delivery',
    label: 'Own complex, trusted implementation',
    terms: /\b(?:governance|compliance|security|regulated|responsible AI)\b/i,
    action: /\b(?:design(?:s|ed|ing)?|implement(?:s|ed|ing)?|integrat(?:e|es|ed|ing)|architecting|deliver(?:s|ed|ing)?|embed(?:s|ded|ding)?|solv(?:e|es|ed|ing))\b/i,
    inference: 'Complex integration and governance could be reasons to retain specialist ISD delivery capacity inside Frontier rather than relying only on standard product features.',
    risk: 'Technical requirements do not establish exclusivity; partners and other Microsoft teams may offer the same capabilities.',
    watch: 'Look for end-to-end accountability on difficult deployments and evidence of a distinct remit.',
  },
];

function sourceBlocks(job) {
  if (!job.descriptionHtml) {
    // Published overviews are truncated; an unfinished trailing clause is not evidence.
    const text = job.overview?.match(/^[\s\S]*[.!?](?:\s|$)/)?.[0];
    return text ? [{ section: 'Published overview excerpt', text }] : [];
  }
  const text = stripBoilerplate(toPlainText(job.descriptionHtml));
  const heading = /^[ \t]*(Overview|Responsibilities|(?:(?:Required(?:\/Minimum)?|Minimum|Preferred|Additional(?: or Preferred)?) )?Qualifications|Benefits|Compensation|Other Requirements)[ \t]*:?[ \t]*\r?$/gim;
  const headings = [...text.matchAll(heading)];
  return headings.flatMap((match, index) => {
    if (!/^(Overview|Responsibilities)$/i.test(match[1])) return [];
    const start = match.index + match[0].length;
    return [{ section: match[1], text: text.slice(start, headings[index + 1]?.index ?? text.length) }];
  });
}

function passages(job) {
  return sourceBlocks(job).flatMap(({ section, text }) =>
    text.split(/\n+|(?<=[.!?])\s+/).map((line) => ({
      section,
      text: line.replace(/\s+/g, ' ').trim(),
    })).filter((line) => line.text.length >= 25)
  );
}

const share = (n, total) => total ? +(n * 100 / total).toFixed(1) : null;
const normalise = (text) => text.toLowerCase().replace(/\W+/g, ' ').trim();

function matchEvidence(jobs, texts, signal) {
  return jobs.flatMap((job) => {
    const match = texts.get(job.id).find(({ text }) =>
      signal.terms.test(text) && signal.action.test(text)
      && !/\b(?:not|never|no longer|will not|won't)\b/i.test(text)
    );
    return match ? [{
      id: job.id,
      title: job.title,
      url: job.url,
      section: match.section,
      excerpt: match.text,
      observedAt: job.detailFetchedAt ?? null,
    }] : [];
  });
}

export function buildISDStrategy(allJobs) {
  const open = allJobs.filter((job) => job.status === 'open');
  const isd = open.filter((job) => job.org === 'isd');
  const fde = open.filter((job) => job.org === 'fde');
  const texts = new Map([...isd, ...fde].map((job) => [job.id, passages(job)]));
  const readable = (jobs) => jobs.filter((job) => texts.get(job.id).length > 0).length;
  const isdReadable = readable(isd);
  const fdeReadable = readable(fde);
  const signals = SIGNALS.map((signal) => {
    const evidence = matchEvidence(isd, texts, signal);
    const comparison = matchEvidence(fde, texts, signal);
    const distinct = [...new Map(evidence.map((item) => [normalise(item.excerpt), item])).values()];
    return {
      id: signal.id,
      label: signal.label,
      count: evidence.length,
      share: share(evidence.length, isdReadable),
      fdeCount: comparison.length,
      fdeShare: share(comparison.length, fdeReadable),
      distinctPassages: distinct.length,
      evidenceLevel: !evidence.length ? 'Not observed'
        : evidence.length === 1 ? 'One advert'
          : distinct.length === 1 ? 'Repeated wording' : 'Multiple passages',
      inference: evidence.length ? signal.inference : 'No matching passage in the readable ISD cohort supports this hypothesis in this snapshot.',
      risk: signal.risk,
      watch: signal.watch,
      evidence: distinct.slice(0, 3),
    };
  });
  const supported = signals.filter((signal) => signal.count > 0);
  const fullDescriptions = isd.filter((job) => Boolean(job.descriptionHtml)).length;
  return {
    title: "ISD's future inside Frontier",
    scope: 'An evidence-led reading of possible strategic relevance, not a prediction that ISD will survive, shrink or be reorganised.',
    isdCount: isd.length,
    fdeCount: fde.length,
    isdReadable,
    fdeReadable,
    fullDescriptions,
    evidenceMode: fullDescriptions === isd.length && isd.length > 0 ? 'Full descriptions' : 'Limited or mixed source text',
    summary: supported.length
      ? `The readable ISD adverts contain signals for ${supported.map((signal) => signal.label.toLowerCase()).join('; ')}. These suggest possible ways for ISD to remain useful inside Frontier, not an approved survival strategy.`
      : 'There is not enough matching ISD text in this snapshot to infer a strategic direction.',
    method: 'Only roles classified as ISD are evidence for ISD. FDE is a separate comparison, never folded into ISD. A signal requires a topic and an action in the same passage of Overview or Responsibilities; Qualifications are excluded. When only a published overview excerpt is available, coverage is limited. Counts are adverts, not independent decisions; shared wording is deduplicated in the source examples. These are heuristic text matches, not verified commitments.',
    frontierReading: 'The hypothesis to examine is complementary roles: ISD providing repeatable customer delivery and FDE providing forward-deployed engineering. The comparison below tests overlap in advertised work; it cannot establish a reporting line, a formal hand-off, budget allocation or replacement of one unit by the other.',
    signals,
    unknowns: [
      'Internal leadership intent, budgets, margins, utilisation and the approved organisation roadmap are not observable in job adverts.',
      'Open postings are not headcount, completed hires or evidence of growth. A missing signal is not proof that a capability is absent.',
      'ISD and FDE classification is heuristic. Compare the linked advert before relying on a unit assignment.',
      'Repeated daily observations can track advertised requirements, but revenue, delivery success and organisational viability need independent evidence.',
    ],
  };
}
