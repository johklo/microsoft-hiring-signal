/**
 * Maps raw posting text onto business-meaningful buckets: what part of the
 * company the role serves, which products it advances, and how senior it is.
 */

/** Evaluated in order — the first match wins, so broader terms come last. */
const SENIORITY_RULES = [
  [/\b(intern|internship|university|new grad|graduate program|apprentice|aspire)\b/i, 'Intern / University'],
  [/\b(corporate vice president|vice president|cvp|evp)\b/i, 'Vice President+'],
  [/\b(general manager)\b/i, 'General Manager'],
  [/\bpartner\s+(director|group|software|hardware|architect|solution|research|program|product|data|applied|design|marketing|technical|engineering|manager|scientist)/i, 'Partner (Distinguished)'],
  [/\b(distinguished|technical fellow|fellow)\b/i, 'Partner (Distinguished)'],
  [/\bdirector\b/i, 'Director'],
  [/\bprincipal\b/i, 'Principal'],
  [/\b(senior|sr\.?)\b/i, 'Senior'],
  [/\b(lead|staff)\b/i, 'Lead / Staff'],
  [/\bmanager\b/i, 'Manager'],
  [/\b(associate|junior|jr\.?|entry)\b/i, 'Associate / Entry'],
];

export function classifySeniority(title = '') {
  for (const [re, label] of SENIORITY_RULES) {
    if (re.test(title)) return label;
  }
  return 'Mid / Unspecified';
}

/**
 * Business themes describe *why the role exists* — which strategic bet or
 * revenue engine it feeds. A posting can belong to several themes.
 */
export const BUSINESS_THEMES = [
  {
    id: 'ai_copilot',
    label: 'AI Platform & Copilot',
    blurb: 'Building and shipping Microsoft\u2019s generative-AI products and the platform beneath them.',
    keywords: ['copilot', 'openai', 'ai foundry', 'azure ai', 'generative ai', 'genai', 'llm', 'large language model', 'agentic', 'ai agent', 'semantic kernel', 'prompt engineering', 'foundation model', 'inference'],
  },
  {
    id: 'ml_research',
    label: 'ML & Applied Research',
    blurb: 'Research and applied science that feeds future model and product capability.',
    keywords: ['machine learning', 'deep learning', 'applied scientist', 'research scientist', 'reinforcement learning', 'computer vision', 'natural language processing', 'speech recognition', 'model training', 'pytorch', 'recommendation system'],
  },
  {
    id: 'cloud_azure',
    label: 'Azure Cloud Platform',
    blurb: 'The core cloud compute, storage and networking business.',
    keywords: ['azure', 'kubernetes', 'virtual machine', 'iaas', 'paas', 'cloud native', 'serverless', 'container', 'distributed systems', 'hypervisor', 'networking stack'],
  },
  {
    id: 'datacenter',
    label: 'Datacenter & Capacity Buildout',
    blurb: 'Physical infrastructure expansion \u2014 the capital-intensive side of the AI/cloud bet.',
    keywords: ['datacenter', 'data center', 'critical environment', 'colocation', 'commissioning', 'capacity planning', 'power and cooling', 'site selection', 'construction management', 'mechanical electrical', 'facilities engineering'],
  },
  {
    id: 'silicon',
    label: 'Silicon & Hardware Engineering',
    blurb: 'Custom chips, boards and devices that reduce cost and differentiate the stack.',
    keywords: ['silicon', 'asic', 'soc', 'rtl', 'verilog', 'fpga', 'pcb', 'signal integrity', 'thermal', 'firmware', 'semiconductor', 'chip design', 'hardware validation'],
  },
  {
    id: 'security',
    label: 'Security, Identity & Compliance',
    blurb: 'Protecting the estate and selling security as a product line.',
    // Deliberately no bare "security": it appears in screening boilerplate and
    // in passing on most adverts. Only role-indicating phrases count.
    keywords: ['cybersecurity', 'security engineering', 'security engineer', 'security operations', 'information security', 'application security', 'cloud security', 'security architect', 'security research', 'defender for endpoint', 'microsoft defender', 'microsoft sentinel', 'entra', 'zero trust', 'threat detection', 'threat intelligence', 'threat modeling', 'vulnerability management', 'penetration test', 'cryptograph', 'identity and access', 'purview', 'malware', 'red team'],
  },
  {
    id: 'data_analytics',
    label: 'Data & Analytics Platform',
    blurb: 'Data estate products and the internal analytics that steer the business.',
    keywords: ['fabric', 'power bi', 'data engineer', 'data platform', 'synapse', 'data warehouse', 'etl', 'analytics', 'databricks', 'cosmos db', 'sql server'],
  },
  {
    id: 'm365',
    label: 'Microsoft 365 & Productivity',
    blurb: 'The seat-based productivity franchise.',
    keywords: ['microsoft 365', 'm365', 'sharepoint', 'outlook', 'onedrive', 'viva', 'microsoft teams', 'productivity suite', 'office 365'],
  },
  {
    id: 'biz_apps',
    label: 'Dynamics & Business Applications',
    blurb: 'ERP/CRM and low-code \u2014 competing for line-of-business budget.',
    keywords: ['dynamics 365', 'business applications', 'power platform', 'power apps', 'power automate', 'erp', 'crm', 'supply chain management', 'finance and operations'],
  },
  {
    id: 'gaming',
    label: 'Gaming & Xbox',
    blurb: 'Content, console and game-subscription revenue.',
    keywords: ['xbox', 'gaming', 'game studio', 'activision', 'blizzard', 'game development', 'console', 'game pass', 'minecraft'],
  },
  {
    id: 'devices',
    label: 'Devices & Mixed Reality',
    blurb: 'First-party hardware and spatial computing.',
    keywords: ['surface', 'hololens', 'mixed reality', 'industrial design', 'device manufacturing', 'accessories', 'wearable'],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    blurb: 'The professional network and its talent/marketing revenue.',
    keywords: ['linkedin'],
  },
  {
    id: 'windows',
    label: 'Windows & Client Platform',
    blurb: 'The client OS and its ecosystem.',
    keywords: ['windows', 'client os', 'kernel', 'device driver', 'operating system'],
  },
  {
    id: 'devtools',
    label: 'Developer Tools & GitHub',
    blurb: 'Winning developer mindshare and the tooling funnel into Azure.',
    keywords: ['github', 'visual studio', 'vs code', 'developer tools', 'devops', 'ci/cd', 'sdk', '.net', 'typescript', 'open source'],
  },
  {
    id: 'gtm',
    label: 'Go-to-Market & Revenue',
    blurb: 'Quota-carrying and customer-facing roles that convert product into revenue.',
    keywords: ['quota', 'pipeline', 'account executive', 'customer success', 'solution sales', 'partner ecosystem', 'go-to-market', 'territory', 'revenue growth', 'consumption growth', 'renewal', 'deal'],
  },
  {
    id: 'industry',
    label: 'Industry & Public Sector',
    blurb: 'Verticalised solutions and regulated/government business.',
    keywords: ['healthcare', 'financial services', 'public sector', 'government', 'federal', 'defense', 'sovereign cloud', 'retail industry', 'manufacturing industry', 'education sector', 'automotive'],
  },
  {
    id: 'quantum',
    label: 'Quantum Computing',
    blurb: 'Long-horizon research bet.',
    keywords: ['quantum', 'majorana', 'topological qubit', 'qubit'],
  },
  {
    id: 'sustainability',
    label: 'Energy & Sustainability',
    blurb: 'Powering the buildout and meeting carbon commitments.',
    keywords: ['sustainability', 'carbon', 'renewable energy', 'energy strategy', 'water stewardship', 'net zero'],
  },
  {
    id: 'trust',
    label: 'Trust, Policy & Responsible AI',
    blurb: 'Regulatory, safety and accessibility obligations.',
    keywords: ['responsible ai', 'trust and safety', 'privacy', 'regulatory', 'public policy', 'accessibility', 'ethics', 'content moderation'],
  },
  {
    id: 'corporate',
    label: 'Corporate & Enabling Functions',
    blurb: 'Finance, HR, legal and operations that run the company itself.',
    keywords: ['financial planning', 'human resources', 'talent acquisition', 'legal counsel', 'procurement', 'accounting', 'internal audit', 'corporate strategy', 'payroll', 'benefits'],
  },
];

/**
 * Named products tracked individually. Each carries an explicit pattern because
 * several product names are also ordinary English words ("teams", "fabric",
 * "surface", "outlook"), which a bare word match would wildly over-count.
 */
const PRODUCT_DEFS = [
  ['Azure', /\bazure\b/i],
  ['Copilot', /\bcopilot\b/i],
  ['Microsoft 365', /\b(microsoft 365|m365|office 365|o365)\b/i],
  ['Dynamics 365', /\bdynamics(\s?365)?\b/i],
  ['Power BI', /\bpower ?bi\b/i],
  ['Power Platform', /\bpower (platform|apps|automate|pages)\b/i],
  ['Microsoft Fabric', /\b(microsoft|ms) fabric\b|\bfabric (workspace|capacity|lakehouse|platform)\b/i],
  ['Microsoft Teams', /\b(microsoft|ms) teams\b|\bteams (client|meetings|rooms|platform|calling)\b/i],
  ['GitHub', /\bgithub\b/i],
  ['Xbox', /\bxbox\b/i],
  ['LinkedIn', /\blinkedin\b/i],
  ['Windows', /\bwindows (server|client|os|11|10|365)\b|\bwindows\b(?! of )/i],
  ['Surface', /\bmicrosoft surface\b|\bsurface (device|pro|laptop|hub|duo|studio)\b/i],
  ['SharePoint', /\bsharepoint\b/i],
  ['Visual Studio', /\bvisual studio\b|\bvs code\b/i],
  ['Microsoft Defender', /\bdefender\b/i],
  ['Microsoft Sentinel', /\bsentinel\b/i],
  ['Entra ID', /\bentra\b/i],
  ['Purview', /\bpurview\b/i],
  ['OpenAI', /\bopen ?ai\b/i],
  ['Kubernetes', /\b(kubernetes|\baks\b)/i],
  ['SQL Server', /\bsql server\b/i],
  ['Cosmos DB', /\bcosmos ?db\b/i],
  ['Synapse', /\bsynapse\b/i],
  ['HoloLens', /\bhololens\b/i],
  ['Minecraft', /\bminecraft\b/i],
  ['Bing', /\bbing\b/i],
  ['Viva', /\bviva\b/i],
  ['Azure AI Foundry', /\bai foundry\b/i],
  ['.NET', /(^|[^a-z0-9])\.net\b/i],
];

export const PRODUCT_TERMS = PRODUCT_DEFS.map(([t]) => t);

/**
 * Microsoft business units, as they actually name themselves in the adverts.
 * Ordered most-specific first: a role inside Industry Solutions Delivery also
 * says MCAPS, and the narrower unit is the more useful answer.
 *
 * Single-valued — a role sits in one organisation.
 */
export const ORG_UNITS = [
  {
    id: 'coi',
    label: 'Cloud Operations + Innovation (CO+I)',
    blurb: 'Builds and runs the datacenter estate that all of Microsoft Cloud sits on.',
    re: /\bCO\s?[+&]\s?I\b|Cloud Operations\s*(?:\+|&|and)\s*Innovation/i,
  },
  {
    id: 'schie',
    label: 'Silicon, Cloud Hardware & Infrastructure Engineering (SCHIE)',
    blurb: 'Designs the custom silicon, servers and hardware inside those datacenters.',
    re: /\bSCHIE\b|Silicon,?\s*Cloud Hardware/i,
  },
  {
    id: 'mai',
    label: 'Microsoft AI (MAI)',
    blurb: 'The consumer-facing AI organisation — Copilot, Bing and in-house models.',
    re: /\bMicrosoft AI\b|\bMAI\b/,
  },
  {
    id: 'coreai',
    label: 'CoreAI — Platform & Tools',
    blurb: 'The developer platform and AI tooling stack, including AI Foundry.',
    re: /\bCoreAI\b|\bCore AI\b/i,
  },
  {
    id: 'security',
    label: 'Microsoft Security',
    blurb: 'The security product division: Defender, Sentinel, Entra, Purview.',
    re: /\bMicrosoft Security\b|\bSecurity Division\b/i,
  },
  {
    id: 'isd',
    label: 'Industry Solutions Delivery (ISD)',
    blurb: 'Microsoft\u2019s own consulting arm — delivers and implements for customers.',
    re: /\bISD\b|Industry Solutions Delivery|\bIndustry Solutions\b/i,
  },
  {
    id: 'css',
    label: 'Customer Service & Support (CSS)',
    blurb: 'Front-line and escalation support for customers already on the platform.',
    // Never a bare "CSS" — that is the stylesheet language on front-end adverts.
    re: /Customer Service\s*(?:&|and)\s*Support|\bCSS\s+(?:organization|team)\b/i,
  },
  {
    id: 'smec',
    label: 'Small, Medium Enterprises & Channel (SME&C)',
    blurb: 'Volume segment sold largely through partners.',
    re: /\bSME&C\b|Small,?\s*Medium Enterprises?\s*(?:&|and)\s*Channel/i,
  },
  {
    id: 'ces',
    label: 'Customer Experience & Success (CE&S)',
    blurb: 'Post-sale adoption, success and support across the customer base.',
    re: /\bCE&S\b|Customer Experience\s*(?:&|and)\s*Success/i,
  },
  {
    id: 'mcaps',
    label: 'Customer & Partner Solutions (MCAPS)',
    blurb: 'The global commercial field organisation — sales, partners, go-to-market.',
    re: /\bMCAPS\b|Microsoft Customer and Partner Solutions/i,
  },
  {
    id: 'cloudai',
    label: 'Cloud + AI',
    blurb: 'The Azure platform engineering organisation.',
    re: /\bCloud\s*\+\s*AI\b|\bCloud and AI\b/i,
  },
  {
    id: 'ed',
    label: 'Experiences + Devices (E+D)',
    blurb: 'Microsoft 365, Windows, Teams and first-party devices.',
    re: /\bE\+D\b|Experiences\s*\+\s*Devices/i,
  },
  {
    id: 'msr',
    label: 'Microsoft Research (MSR)',
    blurb: 'Long-horizon research, largely decoupled from shipping product.',
    re: /\bMicrosoft Research\b|\bMSR\b/,
  },
  {
    id: 'gaming',
    label: 'Gaming',
    blurb: 'Xbox, the studios and the games subscription business.',
    re: /\bXbox\b|Game Studios|\bMicrosoft Gaming\b|\bGaming (?:organization|division|team)\b/i,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    blurb: 'The professional network, run as its own business.',
    re: /\bLinkedIn\b/i,
  },
];

/**
 * Commercial solution areas — how the field organises what it sells. These are
 * the practice names a customer-facing role is hired against.
 */
export const SOLUTION_AREAS = [
  { id: 'data_ai', label: 'Data & AI', re: /\bData\s*(?:&|and)\s*AI\b|\bAzure Data\b/i },
  { id: 'infra', label: 'Azure Infrastructure', re: /\bAzure Infrastructure\b|\bCloud\s*(?:&|and)\s*AI Infrastructure\b|\bInfrastructure Solution Area\b/i },
  { id: 'apps', label: 'Digital & App Innovation', re: /\bDigital\s*(?:&|and)\s*App(?:lication)? Innovation\b|\bApp Innovation\b/i },
  { id: 'bizapps', label: 'Business Applications', re: /\bBusiness Applications\b|\bDynamics 365\b/i },
  { id: 'modernwork', label: 'Modern Work', re: /\bModern Work\b/i },
  { id: 'securitysa', label: 'Security', re: /\bSecurity Solution Area\b|\bcybersecurity solutions?\b|\bMicrosoft Security\b/i },
];

/**
 * Named strategic initiatives. These are the narratives the company is
 * currently hiring against, distinct from the product a role serves.
 */
export const INITIATIVES = [
  {
    id: 'frontier_firm',
    label: 'Frontier Firm transformation',
    blurb: 'Reorganising customers \u2014 and Microsoft itself \u2014 around AI agents.',
    re: /\bFrontier Firm\b|\bfrontier transformation\b|\bFrontier Industry\b/i,
  },
  {
    id: 'frontier_models',
    label: 'Frontier-scale AI',
    blurb: 'Training and serving frontier models and the supercomputers behind them.',
    re: /\bfrontier (?:AI|model|models|scale|training)\b|\bfrontier[- ]class\b/i,
  },
  {
    id: 'agentic',
    label: 'Agentic AI',
    blurb: 'Autonomous agents as the next interaction model.',
    re: /\bagentic\b|\bAI agents?\b|\bagent framework\b/i,
  },
  {
    id: 'sovereign',
    label: 'Sovereign & regulated cloud',
    blurb: 'Data-residency and government-grade cloud demand.',
    re: /\bsovereign(?: cloud| ai)?\b|\bair[- ]gapped\b|\bgovernment cloud\b|\bFedRAMP\b|\bIL[45]\b/i,
  },
  {
    id: 'security_future',
    label: 'Secure Future Initiative',
    blurb: 'The company-wide security engineering programme.',
    re: /\bSecure Future Initiative\b|\bSFI\b/,
  },
];

/** First matching unit wins; returns null when no organisation is named. */
export function detectOrg(strongText = '', bodyText = '') {
  const hay = `${strongText}\n${bodyText}`;
  for (const u of ORG_UNITS) {
    if (u.re.test(hay)) return u.id;
  }
  return null;
}

export function detectSolutionAreas(text = '') {
  return SOLUTION_AREAS.filter((s) => s.re.test(text)).map((s) => s.id);
}

export function detectInitiatives(text = '') {
  return INITIATIVES.filter((i) => i.re.test(text)).map((i) => i.id);
}

const WORD_BOUNDARY_SAFE = /[.*+?^${}()|[\]\\]/g;
const escape = (s) => s.replace(WORD_BOUNDARY_SAFE, '\\$&');

const THEME_MATCHERS = BUSINESS_THEMES.map((t) => ({
  id: t.id,
  regexes: t.keywords.map((k) => new RegExp(`(^|[^a-z0-9])${escape(k)}([^a-z0-9]|$)`, 'i')),
}));

const PRODUCT_MATCHERS = PRODUCT_DEFS.map(([term, regex]) => ({ term, regex }));

/** Strip HTML tags and decode the handful of entities the API emits. */
export function toPlainText(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Microsoft postings carry several standard legal/benefits blocks. They are
 * identical across thousands of adverts and badly skew keyword classification
 * (the "government security screening" clause alone made three quarters of all
 * roles look like security roles). Strip them before tagging.
 */
const BOILERPLATE = [
  // Everything from the EEO notice onward is trailing legal text.
  /Microsoft is an equal opportunity employer[\s\S]*$/i,

  // Standard mission / values paragraphs.
  /Microsoft(?:’|')s mission is to empower every person and every organization on the planet to achieve more[\s\S]*?(?=\n\s*\n|$)/gi,
  /In alignment with our Microsoft values[^\n]*/gi,

  // Screening, clearance and background-check clauses. These mention "security"
  // on most adverts and would otherwise dominate the security cluster.
  /Ability to meet Microsoft, customer and\s*\/?\s*or government security screening[\s\S]*?(?=\n\s*\n|$)/gi,
  /Microsoft Cloud Background Check[\s\S]*?(?=\n\s*\n|$)/gi,
  /(?:NV1|PV|NACI|Top Secret|TS\/SCI)[^\n]*Clearance[^\n]*/gi,
  /This position may require an enhanced background check[^\n]*/gi,

  // Compensation bands and benefits.
  /[^\n]*typical base pay range for this role[\s\S]*?(?=\n\s*\n|$)/gi,
  /Certain roles may be eligible for benefits and other compensation[^\n]*/gi,
  /Benefits\/perks listed below may vary[^\n]*/gi,

  // Application-window and return-to-office notices.
  /This position will be open for a minimum of[^\n]*/gi,
  /Microsoft will accept applications[^\n]*/gi,
  /Starting\s+\w+\s+\d{1,2},\s*\d{4},\s*Microsoft[^\n]*/gi,

  // Org blurbs enumerate the whole product portfolio; the list is not a signal
  // that the role works on any of those products.
  /online (?:services|businesses)[^.\n]{0,240}\./gi,

  /https?:\/\/\S+/g,
];

export function stripBoilerplate(text = '') {
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, ' ');
  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Two-tier tagging.
 *
 * A keyword in a role's *structured* fields (title, profession, discipline,
 * department) is decisive — that is what the role is. In the free-text body a
 * single passing mention is not enough (nearly half of all adverts name Azure
 * somewhere), so the body must corroborate with two distinct keyword hits.
 */
export function detectThemes(strongText = '', bodyText = '') {
  const strong = String(strongText).toLowerCase();
  const body = String(bodyText).toLowerCase();
  const hits = [];

  for (const m of THEME_MATCHERS) {
    if (m.regexes.some((re) => re.test(strong))) {
      hits.push(m.id);
      continue;
    }
    let n = 0;
    for (const re of m.regexes) {
      if (re.test(body) && ++n >= 2) break;
    }
    if (n >= 2) hits.push(m.id);
  }
  return hits;
}

export function detectProducts(text) {
  return PRODUCT_MATCHERS.filter((m) => m.regex.test(text)).map((m) => m.term);
}

/** Pull the "Overview" paragraph, which states the team's business purpose. */
export function extractOverview(plainText = '') {
  const m = plainText.match(/Overview\s*\n+([\s\S]{40,900}?)(?:\n\s*(?:Qualifications|Responsibilities|Required\/Minimum)\b|$)/i);
  const raw = m ? m[1] : plainText.slice(0, 600);
  return raw.replace(/\s+/g, ' ').trim().slice(0, 700);
}

const COUNTRY_ALIASES = {
  USA: 'United States',
  UK: 'United Kingdom',
};

/**
 * The API formats a location as "Country, Region, City" — country FIRST.
 * A handful of two-part values are "City, Country" instead, so they invert.
 * The paired `standardizedLocations` entry ends in the ISO country code.
 *
 * "United States, Washington, Redmond" -> { country: 'United States', city: 'Redmond' }
 * "Egypt, Multiple Locations, Multiple Locations" -> { country: 'Egypt', city: 'Multiple Locations' }
 */
export function parseLocation(loc = '', standardized = '') {
  const parts = String(loc).split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { city: 'Unknown', country: 'Unknown', code: null, raw: loc };

  let country;
  let city;
  if (parts.length >= 3) {
    country = parts[0];
    city = parts[parts.length - 1];
  } else if (parts.length === 2) {
    country = parts[1];
    city = parts[0];
  } else {
    country = parts[0];
    city = parts[0];
  }

  country = COUNTRY_ALIASES[country] || country;
  const codeParts = String(standardized).split(',').map((s) => s.trim()).filter(Boolean);
  const code = codeParts.length ? codeParts[codeParts.length - 1] : null;

  return { city, country, code, raw: loc };
}

/** Human label for a city, disambiguated by its country. */
export function cityLabel(city, country) {
  if (!city || /^multiple locations$/i.test(city)) return `${country} — multiple sites`;
  return `${city}, ${country}`;
}
