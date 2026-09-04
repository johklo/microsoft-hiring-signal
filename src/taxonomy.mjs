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
 * Microsoft business units as they name themselves in adverts, with the parent
 * they report into.
 *
 * Ordered most-specific first: a role inside Industry Solutions Delivery also
 * mentions Frontier, and the narrower unit is the more useful answer.
 *
 * Single-valued — a role sits in one organisation.
 */
export const ORG_PARENTS = {
  mcaps: 'Customer & Partner Solutions (MCAPS)',
  frontier: 'Microsoft Frontier Company',
  engineering: 'Engineering & product divisions',
};

export const ORG_UNITS = [
  // ---- MCAPS field organisation ----------------------------------------
  {
    id: 'atu',
    parent: 'mcaps',
    label: 'Account Team Unit (ATU)',
    blurb: 'Owns the customer relationship inside named enterprise accounts.',
    re: /\bATU\b|Account Team Unit/i,
  },
  {
    id: 'csu',
    parent: 'mcaps',
    label: 'Customer Success Unit (CSU)',
    blurb: 'Drives adoption and consumption after the sale.',
    re: /\bCSU\b|Customer Success Unit/i,
  },
  {
    id: 'gps',
    parent: 'mcaps',
    label: 'Global Partner Solutions (GPS)',
    blurb: 'Builds and sells through the partner channel.',
    re: /\bGPS\b|Global Partner Solutions/i,
  },
  {
    id: 'css',
    parent: 'mcaps',
    label: 'Customer Service & Support (CSS)',
    blurb: 'Front-line and escalation support, inside CE&S.',
    // Never a bare "CSS" — that is the stylesheet language on front-end adverts.
    re: /Customer Service\s*(?:&|and)\s*Support/i,
  },
  {
    id: 'ces',
    parent: 'mcaps',
    label: 'Customer Experience & Success (CE&S)',
    blurb: 'Post-sale success, support and delivery across the customer base.',
    re: /\bCE&S\b|Customer Experience\s*(?:&|and)\s*Success/i,
  },
  {
    id: 'smec',
    parent: 'mcaps',
    label: 'Small, Medium Enterprises & Channel (SME&C)',
    blurb: 'The volume segment, sold largely through partners.',
    re: /\bSME&C\b|Small,?\s*Medium Enterprises?\s*(?:&|and)\s*Channel/i,
  },
  {
    id: 'stu',
    parent: 'mcaps',
    label: 'Solution Team Unit (STU)',
    blurb: 'Technical pre-sales — the solution engineers behind the specialist motion.',
    re: /\bSTU\b|Solution Team Unit/i,
  },
  {
    id: 'mcaps',
    parent: 'mcaps',
    label: 'MCAPS \u2014 other / unspecified',
    blurb: 'Named the commercial field organisation without naming a sub-unit.',
    re: /\bMCAPS\b|Microsoft Customer and Partner Solutions/i,
  },

  // ---- commercial sub-organisations ---------------------------------------
  // These carry `precedence: 'high'`: when one of them names itself, it beats
  // the department map. The department says what discipline a role practises —
  // a Global Black Belt is filed under Solution Area Specialists — while these
  // names say which organisation runs it, which is the more specific answer.
  // The opposite case is why the department normally wins: a Cloud Solution
  // Architecture posting that calls itself CE&S is naming the umbrella above
  // its own unit.
  {
    id: 'gbb',
    parent: 'mcaps',
    precedence: 'high',
    label: 'Global Black Belt (GBB)',
    blurb: 'The deep-specialist sales force, pulled into deals the field cannot close alone.',
    re: /Global Black Belt|\bGBB\b/,
  },
  {
    id: 'ceai',
    parent: 'mcaps',
    precedence: 'high',
    label: 'Commercial Engineering & AI (CEAI)',
    blurb: 'Builds the engineering and AI capability inside the commercial organisation itself.',
    re: /\bCEAI\b|Commercial Engineering\s*(?:&|and)\s*AI/i,
  },
  {
    id: 'digitalsales',
    parent: 'mcaps',
    precedence: 'high',
    label: 'Digital Sales & Digital Natives',
    blurb: 'The scaled remote motion \u2014 digital account executives, specialists, startups and ISVs.',
    re: /\bDigital Natives?\b|\bDigital Sales\b/i,
  },
  {
    id: 'msdigital',
    parent: 'mcaps',
    precedence: 'high',
    label: 'Microsoft Digital',
    blurb: 'Microsoft\u2019s own IT and corporate systems, run as customer zero.',
    re: /\bMicrosoft Digital\b/i,
  },

  // ---- Microsoft Frontier Company ---------------------------------------
  {
    id: 'isd',
    parent: 'frontier',
    label: 'Industry Solutions Delivery (ISD)',
    blurb: 'Microsoft\u2019s own consulting and delivery arm, inside Frontier.',
    // Never a bare "Industry Solutions": an ordinary noun phrase that also turns
    // up in lists of collaborating teams. GCID, the Global Center for
    // Innovation and Delivery, is ISD's own delivery centre and is folded in.
    re: /\bISD\b|Industry Solutions Delivery|Microsoft Industry Solutions|\bGCID\b|Global Cent(?:er|re) (?:for )?Innovation and Delivery/i,
  },
  {
    id: 'fde',
    parent: 'frontier',
    label: 'Forward Deployed Engineering (FDE)',
    blurb: 'Engineers embedded directly in customer transformations.',
    re: /\bFDE\b|Forward Deployed Engineer/i,
  },
  {
    id: 'frontier',
    parent: 'frontier',
    label: 'Frontier Company \u2014 other / unspecified',
    blurb: 'The organisation rebuilding Microsoft\u2019s commercial business around AI.',
    re: /Microsoft Frontier Company|Frontier Company|frontier organization/i,
  },

  // ---- engineering and product divisions --------------------------------
  {
    id: 'coi',
    parent: 'engineering',
    label: 'Cloud Operations + Innovation (CO+I)',
    blurb: 'Builds and runs the datacenter estate that all of Microsoft Cloud sits on.',
    re: /\bCO\s?[+&]\s?I\b|Cloud Operations\s*(?:\+|&|and)\s*Innovation/i,
  },
  {
    id: 'schie',
    parent: 'engineering',
    label: 'Silicon, Cloud Hardware & Infrastructure Engineering (SCHIE)',
    blurb: 'Designs the custom silicon, servers and hardware inside those datacenters.',
    re: /\bSCHIE\b|Silicon,?\s*Cloud Hardware/i,
  },
  {
    id: 'mai',
    parent: 'engineering',
    label: 'Microsoft AI (MAI)',
    blurb: 'The consumer-facing AI organisation \u2014 Copilot, Bing and in-house models.',
    re: /\bMicrosoft AI\b|\bMAI\b/,
  },
  {
    id: 'coreai',
    parent: 'engineering',
    label: 'CoreAI \u2014 Platform & Tools',
    blurb: 'The developer platform and AI tooling stack, including AI Foundry.',
    re: /\bCoreAI\b|\bCore AI\b/i,
  },
  {
    id: 'security',
    parent: 'engineering',
    label: 'Microsoft Security',
    blurb: 'The security product division: Defender, Sentinel, Entra, Purview.',
    re: /\bMicrosoft Security\b|\bSecurity Division\b/i,
  },
  {
    id: 'cloudai',
    parent: 'engineering',
    label: 'Cloud + AI',
    blurb: 'The Azure platform engineering organisation.',
    // Only the "+" form. "Microsoft cloud and AI solutions" is marketing prose,
    // not the division.
    re: /\bCloud\s*\+\s*AI\b/i,
  },
  {
    id: 'ed',
    parent: 'engineering',
    label: 'Experiences + Devices (E+D)',
    blurb: 'Microsoft 365, Windows, Teams and first-party devices.',
    re: /\bE\+D\b|Experiences\s*\+\s*Devices/i,
  },
  {
    id: 'msr',
    parent: 'engineering',
    label: 'Microsoft Research (MSR)',
    blurb: 'Long-horizon research, largely decoupled from shipping product.',
    re: /\bMicrosoft Research\b|\bMSR\b/,
  },
  {
    id: 'gaming',
    parent: 'engineering',
    label: 'Gaming',
    blurb: 'Xbox, the studios and the games subscription business.',
    re: /\bXbox\b|Game Studios|\bMicrosoft Gaming\b|\bGaming (?:organization|division|team)\b/i,
  },
  {
    id: 'linkedin',
    parent: 'engineering',
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

/**
 * Industry verticals.
 *
 * The delivery organisations — Industry Solutions Delivery above all — are
 * organised by industry rather than by product, so this is the axis that says
 * which markets delivery capacity is being built for. Tagged with the same
 * two-tier rule as clusters: decisive in the structured fields, two
 * corroborating hits required in the body.
 */
export const INDUSTRIES = [
  {
    id: 'public',
    label: 'Government & Public Sector',
    blurb: 'Civilian government, state and local, citizen services.',
    keywords: ['public sector', 'government', 'federal agencies', 'state and local', 'citizen services', 'fedramp', 'government agencies', 'public administration', 'civilian agencies'],
  },
  {
    id: 'defense',
    label: 'Defense & National Security',
    blurb: 'Defence, intelligence and classified workloads.',
    keywords: ['department of defense', 'national security', 'defense', 'defence', 'warfighter', 'intelligence community', 'classified environments', 'air gapped', 'gcc high', 'nato', 'military', 'security clearance'],
  },
  {
    id: 'finserv',
    label: 'Financial Services',
    blurb: 'Banking, capital markets, insurance and payments.',
    keywords: ['financial services', 'banking', 'capital markets', 'insurance', 'fintech', 'payments', 'wealth management', 'financial institutions', 'basel', 'trading platform'],
  },
  {
    id: 'health',
    label: 'Healthcare & Life Sciences',
    blurb: 'Providers, payers, pharma and medical research.',
    keywords: ['healthcare', 'health care', 'life sciences', 'clinical', 'patient', 'electronic health record', 'fhir', 'hipaa', 'payers and providers', 'pharmaceutical', 'medical imaging', 'health systems'],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & Mobility',
    blurb: 'Discrete and process manufacturing, automotive, industrials.',
    // Not bare "manufacturing": Microsoft manufactures its own hardware, and
    // that is a different thing from selling to manufacturers.
    keywords: ['manufacturing industry', 'manufacturing customers', 'discrete manufacturing', 'process manufacturing', 'automotive', 'industrial equipment', 'shop floor', 'factory operations', 'digital twin', 'product lifecycle management', 'industrial iot', 'mobility industry'],
  },
  {
    id: 'energy',
    label: 'Energy & Resources',
    blurb: 'Utilities, oil and gas, mining and the grid.',
    // Deliberately not "power" or bare "energy" — datacenter adverts are full
    // of both, and mean something else entirely.
    keywords: ['oil and gas', 'energy industry', 'energy sector', 'energy customers', 'energy and resources', 'utilities', 'grid operator', 'upstream operations', 'mining industry', 'natural resources'],
  },
  {
    id: 'retail',
    label: 'Retail & Consumer Goods',
    blurb: 'Retailers, CPG and commerce.',
    keywords: ['retail industry', 'retail customers', 'retailers', 'consumer goods', 'merchandising', 'point of sale', 'omnichannel', 'e-commerce', 'store operations', 'consumer packaged goods'],
  },
  {
    id: 'telco',
    label: 'Telco & Media',
    blurb: 'Operators, networks, broadcast and entertainment.',
    keywords: ['telecommunications', 'telco', 'network operator', 'media and entertainment', 'broadcast', 'content delivery', 'operator network', 'communications industry'],
  },
  {
    id: 'education',
    label: 'Education',
    blurb: 'Higher education, schools and research institutions.',
    // Not bare "education": it turns up in the qualifications clause on most
    // adverts ("degree or equivalent education").
    keywords: ['higher education', 'k-12', 'edtech', 'academic institutions', 'student success', 'education sector', 'education industry', 'education customers'],
  },
  {
    id: 'sovereign_ind',
    label: 'Sovereign & Regulated',
    blurb: 'Data-residency-constrained and nationally operated cloud.',
    keywords: ['sovereign cloud', 'data residency', 'data sovereignty', 'regulated industries', 'regulated customers', 'national cloud', 'regulatory compliance requirements'],
  },
];



/**
 * How a role is shaped, read from its title.
 *
 * Single-valued and evaluated in order, so the more specific archetype wins.
 * On a delivery organisation this is the most direct read of what is being
 * bought: architects and consultants mean billable delivery capacity, sellers
 * and specialists mean demand generation, managers mean new scaffolding.
 */
export const ROLE_ARCHETYPES = [
  {
    id: 'business_support',
    label: 'Business & executive support',
    blurb: 'Assistants and administrators who support a leadership team.',
    // Ahead of leadership: an assistant *to* a CVP is not a CVP.
    re: /\bexecutive (?:assistant|business administrator)\b|\badministrative assistant\b|\bbusiness administrator\b|\b\(EA\)/i,
  },
  {
    id: 'leadership',
    label: 'Leadership',
    blurb: 'Director and above — new scaffolding rather than delivery capacity.',
    re: /\b(director|general manager|vice president|\bcvp\b|\bcto\b|chief technology officer|chief of staff|head of)\b/i,
  },
  {
    id: 'architect',
    label: 'Architect',
    blurb: 'Solution, cloud and technical architects — the billable technical spine.',
    re: /\barchitect(?:ure)?\b/i,
  },
  {
    id: 'consultant',
    label: 'Consultant',
    blurb: 'Named consulting delivery.',
    re: /\bconsultant\b|\bconsulting\b|\badvisor\b|\badvisory\b/i,
  },
  {
    id: 'delivery_lead',
    label: 'Delivery & engagement lead',
    blurb: 'Owns an engagement, a practice or a delivery portfolio.',
    re: /\b(delivery|engagement|practice|portfolio|service)\s+(lead|leader|manager|management|director|executive|partner)\b|\bdelivery (?:excellence|management)\b|\bengagement manager\b/i,
  },
  {
    id: 'program',
    label: 'Program & project management',
    blurb: 'Programme, project and technical programme managers.',
    re: /\b(program|programme|project|technical program)\s+manager\b|\bTPM\b|\bproject management\b|\bscrum master\b/i,
  },
  {
    id: 'csam',
    label: 'Customer success account management',
    blurb: 'Owns consumption and adoption inside an account.',
    re: /\bcustomer success account manager\b|\bCSAM\b|\bcustomer success manager\b/i,
  },
  {
    id: 'sales',
    label: 'Sales & specialist',
    blurb: 'Quota-carrying and pre-sales specialist roles.',
    re: /\b(account executive|account manager|account technology|sales|seller|specialist|business development|solution area)\b/i,
  },
  {
    id: 'data_ai',
    label: 'Data & AI engineering',
    blurb: 'Data scientists, AI and ML engineers building the customer-facing models.',
    re: /\b(data scientist|data engineer|machine learning|applied scientist|\bAI\b engineer|ai engineer|research scientist)\b/i,
  },
  {
    id: 'engineer',
    label: 'Software & forward-deployed engineering',
    blurb: 'Engineers who write code inside customer engagements.',
    re: /\b(software engineer|forward deployed|developer|full[- ]stack|platform engineer|devops engineer|site reliability)\b/i,
  },
  {
    id: 'support',
    label: 'Support & escalation engineering',
    blurb: 'Reactive support, escalation and technical account management.',
    re: /\b(support engineer|escalation engineer|technical support|customer engineer|technical account manager)\b/i,
  },
  {
    id: 'security',
    label: 'Security delivery',
    blurb: 'Security consulting, incident response and compliance delivery.',
    re: /\b(security|cybersecurity|incident response|compliance)\b/i,
  },
  {
    id: 'manager',
    label: 'People management (other)',
    blurb: 'A manager title with no delivery discipline named.',
    re: /\bmanager\b|\bmanagement\b|\blead\b/i,
  },
];

export function classifyArchetype(title = '') {
  for (const a of ROLE_ARCHETYPES) if (a.re.test(title)) return a.id;
  return 'other';
}

export const ARCHETYPE_LABELS = {
  ...Object.fromEntries(ROLE_ARCHETYPES.map((a) => [a.id, a.label])),
  other: 'Other / unclassified',
};

/**
 * Only a *self-identifying* mention counts as the role's own organisation.
 *
 * Adverts routinely name other teams the role will work with — "collaborate
 * with Global Partner Solutions (GPS)", "across organizations (e.g., ATU, CSU,
 * ISD, GPS)" — and counting those put field roles in the wrong unit entirely.
 * So a match must sit in a possessive construction:
 *
 *   before:  "within Microsoft's Global Partner Solutions (GPS) organization"
 *   after:   "Microsoft Industry Solutions Delivery (ISD) is a global organization"
 *
 * Detection also reads the Overview block only. Qualifications and
 * Responsibilities are where other teams get named.
 */
const SELF_BEFORE =
  String.raw`(?:within|inside|part of|joining|join|welcome to|we are|we're|our|here at|in the|role in|role within|member of)\s+` +
  String.raw`(?:the\s+)?(?:Microsoft(?:['\u2019]s)?\s+)?(?:the\s+)?`;

const SELF_AFTER =
  String.raw`\s*(?:\([^)]{1,24}\)\s*)?` +
  String.raw`(?:organi[sz]ation|team|group|division|business unit|is\s+(?:a|an|the)\s|is looking|is hiring|is seeking|are looking|are hiring` +
  // Verbs a team uses about itself. "Microsoft Digital (MSD) builds and manages
  // the critical products Microsoft runs on" is a self-description; the same
  // name inside "collaborate with Global Black Belts (GBBs) on competitive
  // positioning" is followed by a preposition and still will not match.
  String.raw`|partners\b|builds\b|develops\b|delivers\b|operates\b|manages\b|owns\b|drives\b|runs\b)`;

const selfCache = new Map();
function selfPatterns(unit) {
  if (!selfCache.has(unit.id)) {
    const src = unit.re.source;
    selfCache.set(unit.id, [
      new RegExp(SELF_BEFORE + `(?:${src})`, 'i'),
      new RegExp(`(?:${src})` + SELF_AFTER, 'i'),
    ]);
  }
  return selfCache.get(unit.id);
}

/**
 * Resolve the organisation a posting sits in, in four steps of falling
 * specificity:
 *
 *   1. A commercial sub-organisation naming itself. GBB and CEAI are filed
 *      under ordinary field departments, so the department would otherwise
 *      bury them.
 *   2. The structured department, where it names a team outright.
 *   3. The structured profession, for the scaled digital motion.
 *   4. Any other unit naming itself in the Overview.
 *
 * Steps 2 and 3 sit above step 4 because a structured field states what the
 * role is while the Overview is hand-written and can name the wrong parent —
 * Cloud Solution Architecture postings sit in the Customer Success Unit, but a
 * fifth of them describe themselves as the CE&S umbrella above it.
 *
 * @param {string} strongText  title / profession / discipline / department
 * @param {string} overviewText the advert's Overview block
 * @param {string} department   the posting's structured department field
 * @param {string} profession   the posting's structured profession field
 * @returns {string|null} unit id, or null when no organisation is identifiable
 */
export function detectOrg(strongText = '', overviewText = '', department = '', profession = '') {
  const hay = `${strongText}\n${overviewText}`;

  const names = (unit) => {
    const [before, after] = selfPatterns(unit);
    return before.test(hay) || after.test(hay);
  };

  for (const u of ORG_UNITS) {
    if (u.precedence === 'high' && names(u)) return u.id;
  }

  const byDepartment = unitForDepartment(department);
  if (byDepartment) return byDepartment;

  const byProfession = unitForProfession(profession);
  if (byProfession) return byProfession;

  for (const u of ORG_UNITS) {
    if (u.precedence !== 'high' && names(u)) return u.id;
  }
  return null;
}

/** The parent division an org id reports into. */
export function orgParent(id) {
  return ORG_UNITS.find((u) => u.id === id)?.parent ?? null;
}

/**
 * Second-tier organisation detection: the role family, read from the posting's
 * structured `department` field.
 *
 * Self-identification is the better evidence and stays first — but it only
 * covers about a third of the book, and a large block of what it misses is
 * field roles whose department names the team outright. A Cloud Solution
 * Architect posting is a Customer Success Unit posting whether or not its
 * Overview says so.
 *
 * Matching is on the exact department string, not a pattern. That matters:
 * "Partner Development Management" is the partner organisation, while "HR
 * Business Partnership" and "Client Delivery Partnership" are not, and a
 * regex on "partner" would take all three.
 *
 * Two departments are deliberately absent. "Technical Support Engineering"
 * already self-identifies as CSS on almost every posting, and "Business
 * Program Management" spans every division rather than naming one.
 */
export const UNIT_BY_DEPARTMENT = new Map([
  // Customer Success Unit
  ['cloud solution architecture', 'csu'],
  ['customer success account mgmt', 'csu'],
  // Solution Team Unit — technical pre-sales and the specialist sellers
  ['solution engineering', 'stu'],
  ['solution area specialists', 'stu'],
  // Account Team Unit — the in-country account teams
  ['account technology', 'atu'],
  ['strategic account technology', 'atu'],
  ['account management', 'atu'],
  ['strategic account management', 'atu'],
  ['services account management', 'atu'],
  // Global Partner Solutions
  ['partner development management', 'gps'],
  ['partner solution sales', 'gps'],
  ['partner enablement program mgmt', 'gps'],
  // Industry Solutions Delivery — the billable delivery disciplines
  ['technology consulting', 'isd'],
  ['solution architecture', 'isd'],
  ['consulting project management', 'isd'],
]);

/**
 * The scaled digital motion is a profession, not a department. Every one of the
 * four "Digital …" departments — account management, solution area specialists,
 * solution engineering, cloud solution architecture — carries the profession
 * "Digital Sales and Solutions" on every posting, and each is the digital
 * counterpart of a field discipline rather than part of it. Keying on the
 * profession collects all four in one rule instead of four department entries
 * that would each have to be kept in step.
 */
export const UNIT_BY_PROFESSION = new Map([['digital sales and solutions', 'digitalsales']]);

export function unitForDepartment(department = '') {
  return UNIT_BY_DEPARTMENT.get(String(department).trim().toLowerCase()) ?? null;
}

export function unitForProfession(profession = '') {
  return UNIT_BY_PROFESSION.get(String(profession).trim().toLowerCase()) ?? null;
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

const INDUSTRY_MATCHERS = INDUSTRIES.map((v) => ({
  id: v.id,
  regexes: v.keywords.map((k) => new RegExp(`(^|[^a-z0-9])${escape(k)}([^a-z0-9]|$)`, 'i')),
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

/** Industry verticals, tagged with the same two-tier rule as clusters. */
export function detectIndustries(strongText = '', bodyText = '') {
  const strong = String(strongText).toLowerCase();
  const body = String(bodyText).toLowerCase();
  const hits = [];

  for (const m of INDUSTRY_MATCHERS) {
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

/** Pull the "Overview" paragraph, which states the team's business purpose. */
export function extractOverview(plainText = '') {
  const m = plainText.match(/Overview\s*\n+([\s\S]{40,900}?)(?:\n\s*(?:Qualifications|Responsibilities|Required\/Minimum)\b|$)/i);
  const raw = m ? m[1] : plainText.slice(0, 600);
  return raw.replace(/\s+/g, ' ').trim().slice(0, 700);
}

/**
 * The full Overview block. This is where a team describes itself; the
 * Qualifications and Responsibilities sections instead name *other* teams the
 * role will work with, which is why organisation detection must not read them.
 */
export function extractOverviewBlock(plainText = '') {
  const m = plainText.match(/Overview\s*\n+([\s\S]*?)(?:\n\s*(?:Qualifications|Responsibilities|Required\/Minimum|Additional or Preferred)\b|$)/i);
  return (m ? m[1] : plainText.slice(0, 2500)).slice(0, 4000);
}

/**
 * The Qualifications block — what the advert asks the candidate to already
 * have. Skills are read from here and nowhere else, for the same reason
 * organisations are read from the Overview and nowhere else: the Overview
 * describes the team's ambitions and the Responsibilities describe the job, and
 * both name technology the role will merely be *near*. Only this block is a
 * statement of demand.
 */
export function extractQualificationsBlock(plainText = '') {
  const m = plainText.match(
    /(?:Required\/Minimum Qualifications|Qualifications)\s*\n+([\s\S]*?)(?:\n\s*(?:Responsibilities|Benefits|Microsoft is an equal)\b|$)/i
  );
  return (m ? m[1] : '').slice(0, 6000);
}

/**
 * Skills, as an advert states them. Categorised so the page can report which
 * *kind* of capability is being bought, not just which named tool.
 *
 * Patterns are explicit because several skill names are ordinary words. A skill
 * counts on a single mention inside the Qualifications block — unlike the
 * cluster rules, where a passing mention in the body proves nothing. A
 * qualifications list is not prose about the team; every line in it is a
 * demand, so one appearance is the signal.
 */
export const SKILL_CATEGORIES = [
  { id: 'lang', label: 'Languages & runtimes' },
  { id: 'cloud', label: 'Cloud & platform' },
  { id: 'data_ai', label: 'Data, ML & AI' },
  { id: 'agentic', label: 'Agents & Copilot stack' },
  { id: 'security', label: 'Security' },
  { id: 'infra', label: 'Datacenter & physical infrastructure' },
  { id: 'silicon', label: 'Silicon & hardware' },
  { id: 'practice', label: 'Engineering practice' },
  { id: 'delivery', label: 'Delivery & programme' },
  { id: 'commercial', label: 'Commercial & customer-facing' },
  { id: 'credential', label: 'Credentials & clearance' },
  // Not a capability — a note on how the advert is written. Excluded from the
  // capability ranking and reported on its own.
  { id: 'openlist', label: 'Open-list clauses' },
];

export const SKILLS = [
  // ---- languages and runtimes -------------------------------------------
  { id: 'python', cat: 'lang', label: 'Python', re: /\bpython\b/i },
  { id: 'csharp', cat: 'lang', label: 'C#', re: /\bc#|\bc\s?sharp\b|\.net\b/i },
  { id: 'java', cat: 'lang', label: 'Java', re: /\bjava\b(?!script)/i },
  { id: 'js', cat: 'lang', label: 'JavaScript / TypeScript', re: /\bjavascript\b|\btypescript\b|\breact\b|\bnode\.?js\b/i },
  { id: 'cpp', cat: 'lang', label: 'C / C++', re: /\bc\+\+|\bc\/c\+\+/i },
  { id: 'go', cat: 'lang', label: 'Go', re: /\bgolang\b|\bgo\s+(?:programming|language)\b/i },
  { id: 'rust', cat: 'lang', label: 'Rust', re: /\brust\b/i },
  { id: 'sql', cat: 'lang', label: 'SQL', re: /\bsql\b|\bt-sql\b|\bkql\b/i },
  { id: 'shell', cat: 'lang', label: 'PowerShell / Bash', re: /\bpowershell\b|\bbash\b|\bshell scripting\b/i },
  {
    id: 'any_lang',
    cat: 'openlist',
    label: 'Any mainstream language (open list)',
    // The standard engineering-ladder clause. Reported as its own requirement
    // rather than as demand for each language it happens to enumerate.
    re: /\blanguages?,?\s+includ(?:ing|e)\b/i,
  },
  {
    id: 'any_background',
    cat: 'openlist',
    label: 'Any of several backgrounds (open list)',
    // "5+ years experience in consulting, industry advisory, digital
    // transformation, program management, or related roles" — an enumeration of
    // acceptable histories, not a list of required skills.
    re: /\bor\s+(?:related|similar)\s+(?:roles?|fields?|areas?|disciplines?|experience|domains?)\b/i,
  },

  // ---- cloud and platform ------------------------------------------------
  { id: 'azure', cat: 'cloud', label: 'Azure', re: /\bazure\b/i },
  { id: 'aws_gcp', cat: 'cloud', label: 'AWS / GCP', re: /\baws\b|\bamazon web services\b|\bgoogle cloud\b|\bgcp\b/i },
  { id: 'k8s', cat: 'cloud', label: 'Kubernetes & containers', re: /\bkubernetes\b|\bk8s\b|\bdocker\b|\bcontaineri[sz]ation\b/i },
  { id: 'iac', cat: 'cloud', label: 'Infrastructure as code', re: /\bterraform\b|\bbicep\b|\barm templates?\b|\binfrastructure as code\b|\bansible\b|\bpulumi\b/i },
  { id: 'linux', cat: 'cloud', label: 'Linux', re: /\blinux\b|\bunix\b/i },
  { id: 'networking', cat: 'cloud', label: 'Networking', re: /\bnetworking\b|\btcp\/ip\b|\bbgp\b|\bdns\b|\bload balanc/i },
  { id: 'distributed', cat: 'cloud', label: 'Distributed systems', re: /\bdistributed systems?\b|\bmicroservices?\b|\bhigh availability\b|\bscalab(?:le|ility) (?:systems?|architecture)\b/i },

  // ---- data, ML and AI ---------------------------------------------------
  { id: 'ml', cat: 'data_ai', label: 'Machine learning', re: /\bmachine learning\b|\bdeep learning\b|\bneural network/i },
  { id: 'llm', cat: 'data_ai', label: 'LLMs & generative AI', re: /\blarge language model|\bllms?\b|\bgenerative ai\b|\bgenai\b|\bfoundation models?\b|\bfine[- ]tuning\b/i },
  { id: 'mlframe', cat: 'data_ai', label: 'PyTorch / TensorFlow', re: /\bpytorch\b|\btensorflow\b|\bonnx\b|\bhugging ?face\b|\bcuda\b/i },
  { id: 'dataeng', cat: 'data_ai', label: 'Data engineering', re: /\bdata engineering\b|\betl\b|\bdata pipelines?\b|\bdata warehous|\bspark\b|\bdatabricks\b|\bsynapse\b/i },
  { id: 'analytics', cat: 'data_ai', label: 'Analytics & BI', re: /\bpower ?bi\b|\bdata analysis\b|\bdata visuali[sz]ation\b|\bbusiness intelligence\b|\bdashboards?\b/i },
  { id: 'mlops', cat: 'data_ai', label: 'MLOps & model operations', re: /\bmlops\b|\bmodel deployment\b|\bmodel monitoring\b|\bmodel serving\b|\binference optimi[sz]ation\b/i },
  { id: 'stats', cat: 'data_ai', label: 'Statistics & experimentation', re: /\bstatistics\b|\bstatistical\b|\ba\/b test|\bexperimentation\b|\bcausal inference\b/i },

  // ---- the agent stack ---------------------------------------------------
  { id: 'agents', cat: 'agentic', label: 'Agent frameworks', re: /\bagentic\b|\bai agents?\b|\bagent frameworks?\b|\bmulti[- ]agent\b|\bautogen\b|\bsemantic kernel\b|\blangchain\b|\bmodel context protocol\b|\bmcp\b/i },
  { id: 'copilot_dev', cat: 'agentic', label: 'Copilot & Copilot Studio', re: /\bcopilot studio\b|\bmicrosoft copilot\b|\bcopilot extensib/i },
  { id: 'rag', cat: 'agentic', label: 'RAG & prompt engineering', re: /\bretrieval[- ]augmented\b|\brag\b|\bprompt engineering\b|\bvector (?:search|database|store)\b|\bembeddings?\b/i },
  { id: 'aifoundry', cat: 'agentic', label: 'Azure AI Foundry / OpenAI', re: /\bai foundry\b|\bazure openai\b|\bopenai\b/i },

  // ---- security -----------------------------------------------------------
  { id: 'secops', cat: 'security', label: 'Security operations', re: /\bsecurity operations\b|\bsiem\b|\bincident response\b|\bthreat (?:detection|hunting|intelligence)\b|\bsentinel\b|\bsoc analyst\b/i },
  { id: 'appsec', cat: 'security', label: 'Application & cloud security', re: /\bapplication security\b|\bcloud security\b|\bsecure coding\b|\bthreat model|\bpenetration test|\bvulnerability (?:management|assessment)\b/i },
  { id: 'iam', cat: 'security', label: 'Identity & access', re: /\bidentity and access\b|\biam\b|\bentra\b|\bactive directory\b|\bzero trust\b|\boauth\b|\bsso\b/i },
  { id: 'crypto', cat: 'security', label: 'Cryptography', re: /\bcryptograph|\bencryption\b|\bpki\b|\bkey management\b/i },
  { id: 'compliance', cat: 'security', label: 'Compliance frameworks', re: /\bsoc ?2\b|\biso ?27001\b|\bnist\b|\bfedramp\b|\bgdpr\b|\bhipaa\b|\bpci[- ]dss\b|\bregulatory compliance\b/i },

  // ---- datacenter and physical -------------------------------------------
  { id: 'critenv', cat: 'infra', label: 'Critical environment operations', re: /\bcritical environment\b|\bdata ?cent(?:er|re) operations\b|\bups\b|\bgenerators?\b|\bswitchgear\b|\bcooling systems?\b/i },
  { id: 'electrical', cat: 'infra', label: 'Electrical & mechanical', re: /\belectrical engineering\b|\bmechanical engineering\b|\bhvac\b|\bmedium voltage\b|\bpower distribution\b/i },
  { id: 'construction', cat: 'infra', label: 'Construction & commissioning', re: /\bconstruction management\b|\bcommissioning\b|\bgeneral contractor|\bsite selection\b|\bpermitting\b/i },
  { id: 'supplychain', cat: 'infra', label: 'Supply chain & sourcing', re: /\bsupply chain\b|\bsourcing\b|\bprocurement\b|\blogistics\b|\bdemand planning\b|\binventory management\b/i },

  // ---- silicon and hardware ----------------------------------------------
  { id: 'rtl', cat: 'silicon', label: 'RTL & verification', re: /\brtl\b|\bverilog\b|\bsystemverilog\b|\bvhdl\b|\buvm\b|\bdesign verification\b/i },
  { id: 'chip', cat: 'silicon', label: 'SoC / ASIC / FPGA', re: /\basic\b|\bfpga\b|\bsystem[- ]on[- ]chip\b|\bsoc design\b|\bphysical design\b|\btiming closure\b|\bsynthesis\b/i },
  { id: 'board', cat: 'silicon', label: 'Board & signal integrity', re: /\bpcb\b|\bsignal integrity\b|\bpower integrity\b|\bschematic\b|\bthermal (?:design|analysis)\b/i },
  { id: 'firmware', cat: 'silicon', label: 'Firmware & embedded', re: /\bfirmware\b|\bembedded systems?\b|\bdevice drivers?\b|\bbios\b|\buefi\b/i },

  // ---- engineering practice ----------------------------------------------
  { id: 'cicd', cat: 'practice', label: 'CI/CD & DevOps', re: /\bci\/cd\b|\bcontinuous (?:integration|delivery|deployment)\b|\bdevops\b|\bgithub actions\b|\bazure devops\b/i },
  { id: 'sre', cat: 'practice', label: 'SRE & reliability', re: /\bsite reliability\b|\bsre\b|\bobservability\b|\bmonitoring and alerting\b|\bslo\b|\bon[- ]call\b/i },
  { id: 'agile', cat: 'practice', label: 'Agile delivery', re: /\bagile\b|\bscrum\b|\bkanban\b|\bsprint\b/i },
  { id: 'testing', cat: 'practice', label: 'Testing & quality', re: /\bunit test|\btest automation\b|\bquality assurance\b|\btest[- ]driven\b/i },
  { id: 'architecture', cat: 'practice', label: 'Architecture & design', re: /\bsystem design\b|\bsolution architecture\b|\barchitectural (?:design|patterns?)\b|\bdesign patterns?\b|\bapi design\b/i },

  // ---- delivery ------------------------------------------------------------
  { id: 'stakeholder', cat: 'delivery', label: 'Stakeholder & executive engagement', re: /\bstakeholder (?:management|engagement)\b|\bexecutive (?:presence|communication|engagement)\b|\bc[- ]level\b|\binfluenc(?:e|ing) without authority\b/i },
  {
    id: 'delivery_mgmt',
    cat: 'delivery',
    label: 'Delivery & programme management',
    // No bare "risk management" — it belongs to finance and security adverts as
    // often as to delivery ones.
    re: /\bproject management\b|\bprogram(?:me)? management\b|\bdelivery management\b|\bportfolio management\b/i,
  },
  {
    id: 'consulting',
    cat: 'delivery',
    label: 'Consulting & advisory',
    re: /\bconsult(?:ing|ant|ancy)\b|\badvisory\b|\bclient engagements?\b|\bworkshops?\b/i,
  },

  // ---- commercial and customer-facing --------------------------------------
  { id: 'presales', cat: 'commercial', label: 'Pre-sales & solutioning', re: /\bpre[- ]?sales\b|\bsolution selling\b|\btechnical sales\b|\bproof of concept\b/i },
  {
    id: 'customer_facing',
    cat: 'commercial',
    label: 'Customer-facing experience',
    // Its own requirement rather than evidence of pre-sales: customer success,
    // support and programme roles all ask for it and none of them sell.
    re: /\bcustomer[- ]facing\b|\bclient[- ]facing\b/i,
  },
  { id: 'quota', cat: 'commercial', label: 'Quota & pipeline', re: /\bquota\b|\bpipeline management\b|\brevenue targets?\b|\bsales forecast|\bclosing deals\b|\bdeal (?:cycle|structuring|closure)\b/i },
  {
    id: 'industry_know',
    cat: 'commercial',
    label: 'Industry domain knowledge',
    // Not "industry experience" — that phrase means commercial experience of
    // any kind ("industry experience with cloud technologies"), not knowledge
    // of a customer's industry.
    re: /\bindustry (?:knowledge|expertise)\b|\bdomain (?:knowledge|expertise)\b|\bvertical expertise\b/i,
  },

  // ---- credentials --------------------------------------------------------
  { id: 'clearance', cat: 'credential', label: 'Security clearance', re: /\bsecurity clearance\b|\btop secret\b|\bts\/sci\b|\bpolygraph\b|\bnv1\b|\bbaseline clearance\b/i },
  { id: 'azure_cert', cat: 'credential', label: 'Azure certification', re: /\baz-\d{3}\b|\bazure certif|\bmicrosoft certified\b/i },
  { id: 'pm_cert', cat: 'credential', label: 'PMP / delivery certification', re: /\bpmp\b|\bprince2\b|\bitil\b|\bcsm\b|\bscrum master certif/i },
  { id: 'sec_cert', cat: 'credential', label: 'Security certification', re: /\bcissp\b|\bcism\b|\bceh\b|\bcomptia\b|\bsecurity\+\b/i },
];

const SKILL_CAT_LABELS = Object.fromEntries(SKILL_CATEGORIES.map((c) => [c.id, c.label]));
export const SKILL_META = Object.fromEntries(
  SKILLS.map((s) => [s.id, { label: s.label, cat: s.cat, catLabel: SKILL_CAT_LABELS[s.cat] }])
);

/**
 * Clauses inside a Qualifications block that enumerate options rather than
 * state requirements. Each is matched as an "open list" requirement in its own
 * right (`any_lang`, `any_background`) and then removed, so the specific things
 * it happens to name are not each counted as separately demanded.
 *
 * Both were found by reading what the patterns actually matched:
 *
 *   "coding in languages including, but not limited to, C, C++, C#, Java,
 *    JavaScript, or Python"            -> five languages, one requirement
 *   "5+ years experience in consulting, industry advisory, digital
 *    transformation, program management, or related roles"
 *                                      -> four disciplines, one requirement
 *   "Bachelor's Degree in Construction Project Management"
 *                                      -> a degree subject, not a skill
 */
const OPEN_LIST_CLAUSES = [
  /\blanguages?,?\s+includ(?:ing|e)\b[^.]*\.?/gi,
  /\bexperience\s+(?:in|with)\b[^;\n]{0,240}?\bor\s+(?:related|similar)\s+(?:roles?|fields?|areas?|disciplines?|experience|domains?)\b/gi,
  /\bdegree\s+in\s+[^.;\n]{0,120}?(?=\s+(?:AND|OR)\b|[.;\n]|$)/gi,
];

/**
 * @param {string} strongText  title / profession / discipline
 * @param {string} qualifications the advert's Qualifications block
 */
export function detectSkills(strongText = '', qualifications = '') {
  if (!qualifications) return [];

  let trimmedQual = qualifications;
  for (const re of OPEN_LIST_CLAUSES) trimmedQual = trimmedQual.replace(re, ' ');

  const full = `${strongText}\n${qualifications}`;
  const trimmed = `${strongText}\n${trimmedQual}`;
  const OPEN_LIST_IDS = new Set(['any_lang', 'any_background']);

  // The open-list markers read the original text; everything else reads the
  // text with those clauses removed.
  return SKILLS.filter((s) => s.re.test(OPEN_LIST_IDS.has(s.id) ? full : trimmed)).map((s) => s.id);
}

/**
 * The entry bar in years, as stated. Adverts list several thresholds — a lower
 * one for the degree-holding route, a higher one for the experience-only route
 * — so the *minimum* stated is the bar the advert will actually accept.
 * Values above 20 are almost always a typo or a date, and are dropped.
 */
export function requiredYears(qualifications = '') {
  const found = [...qualifications.matchAll(/(\d{1,2})\+?\s*years?\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1 && n <= 20);
  return found.length ? Math.min(...found) : null;
}

/** The highest degree the Qualifications block names, if any. */
export function degreeLevel(qualifications = '') {
  if (/\b(ph\.?d|doctorate)\b/i.test(qualifications)) return 'PhD';
  if (/\bmaster'?s?\b|\bm\.?s\.?\b|\bmba\b/i.test(qualifications)) return "Master's";
  if (/\bbachelor'?s?\b|\bb\.?s\.?\b|\bundergraduate degree\b/i.test(qualifications)) return "Bachelor's";
  return null;
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
