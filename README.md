# Hiring Signal

A static website that reads roles advertised on **careers.microsoft.com** and turns them into
business insight: what kind of work is being bought, which strategic bets it serves, how the
organisation is being shaped, and what the advertising implies about direction.

Run it locally without an API key, or use GitHub Actions for daily collection and GitHub Pages
for publishing. The hosted workflow uses the repository's built-in `GITHUB_TOKEN`; no personal token is needed.

---

## Quick start

```powershell
npm run batch      # collect the index and up to 700 outstanding descriptions
npm run serve      # open http://localhost:4173
```

There is nothing to install — the project uses only Node's standard library (Node 18+).

Local batches walk the index and fetch up to 700 new, reposted, or stale descriptions per run.
Repeat to backfill, or set `MSJOBS_DETAIL_BUDGET=0` and use `npm run batch:full` for all descriptions.
Runtime depends on corpus size and source rate limiting; a full crawl can take hours.

If a run is interrupted, just run `npm run batch` again — progress is checkpointed and it resumes
where it left off.

---

## Daily batch

### GitHub-hosted automation (recommended)

`.github/workflows/daily.yml` runs at **07:00 KST**, expressed as `0 22 * * *` UTC on the
preceding calendar day, and can be started manually. GitHub schedules are best-effort: runs may
be delayed or dropped under load, and inactive public repositories can have schedules disabled.
The workflow must exist on the default `main` branch. Runs are serialized without cancelling an
active crawl, with a 180-minute crawl timeout.

Hosted runs restore the last successful snapshot, fetch the complete index and **every description**
(`--full --strict`, `MSJOBS_DETAIL_BUDGET=0`), compare additions / closures / edits, regenerate the
site, then atomically push both:

- `main`: only `docs/data/stats.json` and `docs/data/jobs.min.json`.
- `crawl-state`: only `data/jobs.json`, `data/changes.json`, `data/history.json`, and
  `data/last-run.json`, preserving the previous state commit as parent.

The state branch, not an Actions cache or expiring artifact, is the durable comparison record.
It contains public-source job descriptions and observation history and is **public in a public
repository**, even though `data/` is ignored on `main`. Never put credentials or private material
in these files. State history grows over time; the recent change log retains 120 runs while daily
aggregates and state-branch commits remain available.

**First-time setup**

1. Enable Actions and allow the workflow's `GITHUB_TOKEN` to write repository contents.
   Branch/ruleset policies must allow the workflow to create/update `crawl-state` and update `main`;
   the workflow never force-pushes or bypasses protections.
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**, not
   “Deploy from a branch”. Allow the `github-pages` environment to deploy from `main`.
3. From Actions, run **Daily crawl** on `main` with **bootstrap** checked, or:

   ```powershell
   gh workflow run daily.yml --ref main -f bootstrap=true
   ```

   This option is used only when `crawl-state` is absent. The first successful snapshot is labelled
   `baseline`, with zero observed additions/closures/edits—not thousands of supposedly new jobs.
   It does not reset an existing state branch. Subsequent runs compare against the baseline.
4. Check the crawl and **Publish Pages** jobs. Normal manual refresh:
   `gh workflow run daily.yml --ref main` (without bootstrap).
5. **Only after the first GitHub collection succeeds**, disable/remove an existing Windows task
   with `npm run schedule:remove` to avoid duplicate collection and competing publications.
   Keep the local task until that success is verified; setup does not remove it automatically.

**Failure safety and recovery**

Missing state on a scheduled run, invalid JSON/state shape, any failed search page, empty index,
coverage that remains inconsistent after bounded reconciliation, or any unresolved missing/failed description
causes a nonzero exit. Strict runs do not write partial checkpoints.
No failed collection is pushed. Concurrent source/state pushes reject the atomic publication of
**both** branches; rerun from current `main`, rather than overwriting another writer's work.

Strict detail recovery logs each failed ID and original error, waits **30 seconds**, then retries
**only failed details once** (in addition to the API's existing paced retries/backoff). If failures
remain, it performs **one fresh strict index enumeration**, with the same completeness checks and
three-pass limit. A failed ID is considered gone only if absent from that complete index—never
from a 404/403 alone. Still-listed failures abort immediately. Otherwise the final job set uses
the refreshed index, fetching newly discovered IDs and reusing only successful details from this
logical run with their original fetch timestamps. Any new detail failure aborts; there is no
second recovery/reconciliation cycle. Successful counts cover unique final open jobs, index
metadata describes the final enumeration, and all additions/edits/closures compare against the
original durable state. Cached descriptions do not satisfy strict full collection.

Inspect the Actions logs and run summary for the first failing step. The last published site and
remote state remain available after a failed collection. A timeout discards that runner's partial
work; retry later, or deliberately adjust pacing/timeout after investigating. Corrupt state must
be repaired from a known-good state-branch commit; bootstrap cannot bypass corruption. If the
state branch was accidentally deleted, recover its history rather than casually bootstrapping a
new comparison series. There is no fallback to a runner's stale local cache.

Successful persistence explicitly invokes the reusable Pages workflow because pushes made with
`GITHUB_TOKEN` do **not** trigger another push workflow. If deployment alone fails, the new state
and generated data are already durable: rerun **Publish Pages** without recrawling.

**Limits of daily observation**

The search endpoint is live, not an atomic snapshot. Collection uses its supported **Latest**
ordering (`sort_by=timestamp`), verified against the public careers frontend and the API's
`sortBy` acknowledgement on September 5, 2026—not the previously used relevance ordering.
Strict collection checks the acknowledgement, reported count, full unique-ID coverage, and
fresh first/last windows before accepting an index. If counts, boundaries, or coverage shift,
it makes at most **three independent passes**: normal 10-row windows first, then overlapping
5-row offsets to reconcile boundary duplicates. Each retry starts a new ID set; it never unions
different incomplete passes into a supposedly complete baseline. The accepted pass must still
contain exactly as many unique jobs as the API reports. `last-run.json` records the successful
ordering, pass count, request count, and coverage.

Latest ordering improves repeatability but is not a guaranteed unique tie-breaker, and the
observed `postedTs` fields are not perfectly ordered. Coverage and boundary checks cannot prove
there was no same-count change inside the source during a crawl. Persistent duplicate/shifted
windows still fail safely; reconciliation also increases runtime and request volume. Hosted runner
IPs may be rate-limited or blocked; the workflow cannot guarantee a daily successful refresh.
Changes between successful snapshots can be missed (including a role opened and closed between
runs). “Edited” covers the crawler's tracked fields, including the full-description hash; taxonomy
changes can also change derived tracked fields such as organisation and seniority. Run/history
dates are UTC even though the scheduled launch time is described in KST.

### Optional local Windows schedule

The site is designed to be refreshed daily so it accumulates a change history.

```powershell
npm run schedule:install              # runs every day at 07:00
npm run schedule:install -- --time 06:30
npm run schedule:status
npm run schedule:remove
```

This registers a Windows Scheduled Task (`MicrosoftHiringSignal`) that runs
`scripts/run-daily.cmd` and appends to `data/batch.log`. Registering a task may need an elevated
terminal.

Each batch:

1. Walks every page of the live search index.
2. Fetches detail records for **new** postings, for postings that were re-posted, and for anything
   whose cached copy is older than 14 days.
3. Diffs against the previous snapshot to produce **added / closed / edited** lists.
4. Appends a compact daily aggregate to `data/history.json` so trends accumulate over time.
5. Recomputes `stats.json`, the one-page brief, and the role index.

Postings that disappear from the site are **not deleted** — they are marked `closed` with a
`daysOpen` value, which is what makes time-to-close analysis possible later.

---

## What the site shows

| Section | What it answers |
| --- | --- |
| **00 · Brief** | The one-page executive summary: headline figure, six KPIs, six evidence sections, and a numbered outlook reading the hiring as strategy. |
| **The plate** | Share of all postings touching the AI / datacenter / silicon build-out. |
| **01 · Clusters** | Which strategic bet each role serves, plus named products and platforms. |
| **02 · Organisation** | Which division and business unit is hiring — MCAPS (ATU, CSU, GPS, CE&S, CSS, SME&C), Microsoft Frontier Company (ISD, FDE), and the engineering divisions (CO+I, SCHIE, MAI, CoreAI, Microsoft Security…) — plus commercial solution areas, named strategic initiatives, and business unit × seniority. |
| **03 · Frontier** | A deep read of the Frontier Company cohort on its own: unit split, industry verticals, role shapes, capability stack, seniority and travel against the rest of the book, monthly composition, distinctive language, the newest postings, and a written reading of where it is heading. |
| **04 · Shape** | Build vs sell vs capacity vs run, the seniority pyramid, and profession × role type. |
| **05 · Skills** | What the market is asked to supply: capability mix, most-named requirements, the demand index over the last 90 days, the entry bar in years and degrees, the market trend in the AI stack, and which requirements travel together. |
| **06 · Momentum** | What is over- and under-represented in the last 30 days, the daily posting trend, monthly composition by cluster and business unit, and the share shift between the last three months and the three before. |
| **07 · Geography** | Countries, cities, work-site policy and travel requirements. |
| **08 · Index** | Every role, filterable by cluster, business unit, industry vertical, profession, country, seniority and free text. |
| **09 · Changes** | What each daily batch opened, closed and edited. |

### The dimensions

Each role is placed on several independent axes, so the same posting can be read several ways:

1. **Strategic cluster** — which bet the work serves (AI Platform, Datacenter Buildout, Go-to-Market…). Multi-valued.
2. **Business unit** — which part of the company is hiring, with the division it reports into:
   **MCAPS** (ATU, CSU, STU, GPS, CE&S, CSS, SME&C), **Microsoft Frontier Company** (ISD, FDE), and the
   **engineering and product divisions** (CO+I, SCHIE, MAI, CoreAI, Microsoft Security, Cloud + AI,
   E+D, MSR, Gaming, LinkedIn). Single-valued.

   Resolved in two tiers. First the posting's **structured department**, where that names the team
   outright — a *Cloud Solution Architecture* posting is a Customer Success Unit posting, a *Solution
   Engineering* posting is an STU posting — because a structured field states what the role is while
   the Overview is hand-written and can name the wrong parent. A fifth of Cloud Solution
   Architecture postings describe themselves as the CE&S umbrella above CSU.

   Where no department maps, the advert has to **identify itself** — *"within Microsoft's Global
   Partner Solutions (GPS) organization"*, *"Microsoft Industry Solutions Delivery (ISD) is a global
   organization"* — and only from the **Overview** section. This matters: the Responsibilities
   section routinely lists teams a role merely collaborates with (*"across organizations (e.g., ATU,
   CSU, ISD, GPS)"*), and counting those put field roles such as Account Technology Strategist in
   the wrong unit entirely.

   The department map is a list of exact department strings, not a pattern — *Partner Development
   Management* is the partner organisation while *HR Business Partnership* is not, and a regex on
   "partner" would take both. Two departments are deliberately absent: *Solution Architecture*
   without "Cloud" leans Industry Solutions rather than the field, and *Technical Support
   Engineering* already self-identifies as CSS on almost every posting.

   About two fifths of adverts resolve; the rest are reported as *not stated* rather than guessed,
   so unit totals are a floor rather than a census.
3. **Solution area** — the commercial practice a customer-facing role is sold against.
4. **Initiative** — the named narrative it is hired against, such as Agentic AI or the Frontier Firm
   transformation. Worth separating: *Frontier Firm* is a go-to-market story sold to customers,
   while *frontier-scale AI* is an engineering one about model training. They are counted apart.
5. **Industry vertical** — which market the work is aimed at (Financial Services, Healthcare & Life
   Sciences, Government & Public Sector, Defense, Manufacturing…). Multi-valued, tagged with the same
   two-tier rule as clusters. The delivery organisations are structured by industry rather than by
   product, so this is the axis that shows which markets delivery capacity is being built for.
6. **Role shape** — an archetype read from the title: architect, consultant, delivery and engagement
   lead, programme management, sales and specialist, data and AI engineering, forward-deployed
   engineering, support, leadership. Single-valued, first match wins. On a delivery organisation this
   is the most direct read of what is being bought.
7. **Requirements** — the skills, years of experience and degree an advert asks for, read from the
   **Qualifications block only**. That block is the one part of a posting that states demand; the
   Overview describes the team's ambitions and the Responsibilities describe the job, and both name
   technology the role will merely be near. Multi-valued, grouped into ten capability categories.

### Reading the Skills section

Section 05 reads the other side of the advert: not what Microsoft is buying, but the bar a candidate
has to clear.

- **The demand index** is a requirement's share of the last 90 days of postings divided by its share
  of the whole open book — the same method the momentum section uses for clusters. It is what the
  section leans on, because it compares recent postings against the book rather than against an
  earlier month.
- **The market-trend lines** plot the AI-stack requirement and the median entry bar month by month.
  Only months carrying at least 25 postings are drawn, and the earlier months are a
  survivorship-biased sample: a role posted in spring is only visible if it is *still* unfilled. The
  page says so next to the chart; read the recent end of those lines, not the slope from the start.
- **One boilerplate clause is handled specially.** The engineering ladder's standard sentence —
  *"coding in languages including, but not limited to, C, C++, C#, Java, JavaScript, or Python"* —
  enumerates every mainstream language as an OR-list. Counted naively it makes five languages look
  separately demanded on the same advert, which is how a boilerplate sentence becomes the top of a
  chart. It is matched as its own requirement ("any mainstream language") and then removed, so a
  named language only counts where an advert asks for it specifically. That single correction moved
  Python from 613 adverts to 244.
- **The entry bar takes the lowest threshold** an advert states, since that is the bar it will
  actually accept. The manager band therefore reads low: what it asks for is years of people
  management, a different clock from the technical bands.

### Reading the Frontier section

Section 03 answers a narrower question than the rest of the site: given that Frontier is the
organisation Microsoft built to rebuild its commercial business around AI, what is it actually
buying?

Every figure there is a **comparison**. A count on a cohort of this size says little on its own, so
each breakdown carries an index — the cohort's share of a thing divided by the share the rest of the
open book gives it. Above `1.00` means Frontier over-weights it relative to everyone else; where
nothing outside the cohort mentions it at all, the row says *only in this cohort* rather than
printing a fake ratio.

Three things are worth knowing about how it is computed:

- **The recency window is 90 days, not 30.** The cohort is small enough that a single month of
  postings is noise.
- **Distinctive language** is measured by document frequency — counted once per advert, so one
  advert repeating a phrase cannot manufacture a signal — and lift is smoothed, so a phrase absent
  from the rest of the book gets a large but finite score rather than infinity. Single words have to
  clear a higher bar than phrases, because on their own they are usually house style rather than
  signal.
- **Mentions are separated from membership.** Adverts that name Frontier, ISD or FDE without claiming
  to be part of them are reported as a separate *surface* figure, never folded into the cohort. That
  is the same rule that governs business-unit detection everywhere else on the site.

### ISD's future inside Frontier

Section 03 separates **what the adverts say** from **possible strategic interpretations**.
It considers five possible sources of ISD's continuing relevance: production AI delivery,
industry and business outcomes, reusable delivery assets, sustained adoption, and complex
trusted implementation. These are hypotheses to examine, not an approved survival strategy.

Each signal shows matching ISD adverts, a separately calculated FDE comparison, source
passages and links, an interpretation, an alternative explanation or risk, and what to watch.
Only Overview and Responsibilities passages are used, with a topic and action required in the
same passage. Qualifications do not establish organisational intent. Shared wording is
deduplicated in examples, while counts remain per advert. Percentages use readable adverts
in each unit; no readable evidence is `n/a`, not zero demand.

The initial published preview uses the existing, truncated overview excerpts and is labelled
**Limited or mixed source text**. A full batch or rebuild from the raw cache uses complete
descriptions. No matching passage means no observed support, not that the capability is absent.
Classification and passage matching remain heuristic; open the cited advert before relying
on the interpretation.

The feature cannot reveal leadership's private intent, budgets, margins, headcount plans or
whether ISD will survive, shrink, merge or replace another unit. FDE overlap is not evidence of
replacement. Establishing a formal ISD/FDE operating model needs independent evidence beyond
job adverts.

### How "business purpose" is derived

Each posting carries structured fields the site reads directly — profession, discipline, role type
(individual contributor vs people manager), employment type, work-site policy and required travel —
plus the full job description.

Those fields and the description are matched against a keyword taxonomy in
[`src/taxonomy.mjs`](src/taxonomy.mjs) that maps a role onto **strategic clusters** (AI Platform &
Copilot, Datacenter & Capacity Buildout, Silicon, Go-to-Market, and so on). A role can belong to
several. `src/insight.mjs` then turns those distributions into the written brief.

The momentum **index** is a cluster's share of the last 30 days of postings divided by its share of
the whole open book. Above `1.00` means the cluster is over-represented in recent hiring.

### Time

Three separate time views, because they answer different questions:

- **Daily trend** — postings created per day, over the last 180 days.
- **Monthly composition** — small multiples showing how each cluster and business unit has moved
  month by month. Drawn in a single ink rather than as a stacked colour chart, so the theme holds.
- **Share shift** — each cluster's and unit's share of the last three months of postings against its
  share of the three months before, in percentage points. This is the clearest read on direction.

All three are computed from each posting's creation date. Only currently-open roles are visible, so
earlier months are progressively understated as roles close, and the current month is partial. The
page says so next to the chart; read the shape and the share shift rather than the absolute level.
Once several daily batches have run, `data/history.json` also accumulates a true observed series.

### What it cannot tell you

- Only **advertised** roles are visible. Internal transfers and unadvertised hiring are not.
- A posting is not a hire. Volumes show intent and capacity planning, not headcount added.
- Roles that close quickly are slightly under-counted in the momentum index.
- Cluster tagging is keyword-based, so it is directional rather than exact.

These caveats are printed in the site's colophon too, so the numbers are never read without them.

---

## Commands

| Command | Does |
| --- | --- |
| `npm run batch` | Local incremental batch; up to 700 outstanding descriptions by default. |
| `npm run batch:full` | Refresh cached descriptions too; set `MSJOBS_DETAIL_BUDGET=0` to remove the cap. |
| `node --test test/automation.test.mjs` | Offline automation/strict-crawl tests using disposable local fixture repositories. |
| `npm run rebuild` | Recompute the analysis and brief from cached data, no network. |
| `npm run serve` | Serve the dashboard on `http://localhost:4173`. |
| `npm run fonts` | Re-vendor the Newsreader / Source Serif 4 / IBM Plex Sans webfonts into `docs/fonts`. |

`npm run rebuild` is the fast loop when changing the taxonomy or the brief wording.

---

## Rate limiting

The origin sits behind an Azure Front Door WAF that blocks bursts. The crawler therefore paces
itself globally (about one request per 1.2 s), and when it is blocked it pauses every worker,
waits, and resumes. Tune with environment variables:

```powershell
$env:MSJOBS_INTERVAL_MS = '1500'   # slower, safer
$env:MSJOBS_CONCURRENCY = '2'
$env:MSJOBS_COOLDOWN_MS = '90000'  # pause length after a block
$env:MSJOBS_DETAIL_BUDGET = '0'    # 0 = no cap; default 700 detail fetches per run
npm run batch
```

If more than 2 % of index pages fail, the batch **aborts without writing** rather than concluding
that the missing jobs were closed, and exits nonzero. Hosted strict mode is more conservative:
**any** failed index page, inconsistent coverage, or incomplete description collection aborts
before canonical writes. Local incremental mode still checkpoints partial detail progress.

---

## Layout

```
src/
  config.mjs        pacing, endpoints, thresholds
  api.mjs           paced HTTP client, retry + WAF circuit breaker
  scrape.mjs        index walk, record building, change detection
  taxonomy.mjs      boilerplate stripping, seniority rules, clusters, products,
                    organisations, industry verticals, role archetypes
  analyze.mjs       breakdowns, crosstabs, trends
  insight.mjs       the one-page executive brief
  frontier.mjs      the Frontier / ISD deep dive in section 03
  skills.mjs        the requirements market in section 05
  daily.mjs         batch orchestrator
  automation.mjs    durable state restore and atomic state/site publication
  rebuild.mjs       recompute from cache, no network
  schedule.mjs      Windows Scheduled Task install/remove
  server.mjs        static file server
  store.mjs         atomic JSON reads/writes
docs/               the published site (vanilla HTML/CSS/JS, no build step, no CDN)
data/               raw crawl state + local logs (git-ignored on main)
.github/workflows/  scheduled collection and explicit Pages deployment
```

`data/` is the local record; hosted runs persist the four named state files on `crawl-state`.
`docs/` is what gets committed on `main` and served —
including `docs/data/stats.json` and `docs/data/jobs.min.json`, the two files the browser reads.

No runtime or build dependencies: Node's standard library only.

---

## Publishing

`docs/` is a self-contained static site. Set **Settings → Pages → Source: GitHub Actions**.
`.github/workflows/pages.yml` uploads `docs/` and deploys it with the `github-pages` environment,
`pages:write`, and `id-token:write`; it checks out the latest `main`. It runs after successful
hosted collection, on human pushes changing `docs/**` or that workflow, and via manual dispatch:

```powershell
gh workflow run pages.yml --ref main
```

Pages serves files; it does not execute the crawler. Collection runs separately in Actions or on
your machine. Local `npm run batch`, `npm run rebuild`, and `npm run serve` remain supported.
If publishing locally generated data to `main`, be aware it does **not** update `crawl-state`;
the next hosted crawl will compare against its previous hosted snapshot. Prefer one publishing
owner rather than mixing a Windows auto-push task with the hosted workflow.

---

## Accuracy notes

Two corrections worth knowing about, because they changed the numbers a lot:

- **Boilerplate is stripped before tagging.** Roughly 27 % of a typical description is standard
  legal, benefits and pay-band text. Left in, the phrase *"ability to meet … government security
  screening requirements"* alone made three quarters of all roles look like security roles.
- **Body text needs corroboration.** A keyword in the title, profession, discipline or department
  tags a role outright. In the free-text body a single mention is not enough — nearly half of all
  adverts name Azure somewhere — so two distinct keyword hits are required.
- **Organisations are resolved in two tiers.** The structured department first, where it names the
  team outright, then self-identification in the Overview. An advert naming a team is not the same
  as belonging to it, so only possessive constructions in the Overview count for the second tier —
  which cut business-unit coverage from 56 % to a third when it was introduced, and removed the
  false positives entirely. Adding the department tier took coverage back to about two fifths
  without loosening that rule.
- **Requirements are read from the Qualifications block only**, and the standard "languages
  including, but not limited to…" clause is counted as one open-list requirement rather than as
  demand for each language it enumerates. Left alone it put five languages in the top ten.
- **The daily trend is zero-filled.** It previously emitted only the days that carried a posting,
  so a 180-point series spanned 283 calendar days with 103 days missing. Anything that treated the
  index as time — the dated axis, the 7-day mean — was wrong by however many days were absent.

Cluster shares overlap by design (a role can serve several), so they do not sum to 100 %. Where a
combined figure is quoted, such as the AI / datacenter / silicon share, it is a **set union**, not a
sum of the parts.

---

## Design

Built with the Hallmark design skill.

- **Macrostructure** Long Document — the page reads as a printed research note, not a dashboard.
- **Genre** editorial · **Theme** Newsprint (warm stock, roman serif display, one brick signal ink).
- **Nav** N6 newspaper masthead with a sticky ruled section index · **Footer** Ft1 mast-headed,
  colophon beneath.
- **Type** Newsreader (display) · Source Serif 4 (body) · IBM Plex Sans (label voice and figures).
  Three families, vendored into `docs/fonts` by `npm run fonts`, so nothing is fetched at runtime.
  Every number on the page is set in tabular lining figures, which is what makes a column of
  numbers read as a column.
- **Motion** none. Newsprint is a print metaphor: the page does not animate, and the headline
  figure is set rather than counted up.

### Figures

Charts are hand-drawn SVG and CSS on the document measure rather than a chart library, so they
inherit the theme exactly and the page stays dependency-free and fully offline. Each one carries an
axis, a scale and a unit:

- **Daily trend** — dated x-axis with month ticks, labelled y-axis, the raw daily series, and a
  centred 7-day mean in the signal ink so the trend is legible through the day-of-week noise. The
  peak is marked and named.
- **Momentum** — a dot plot on a 0–2 index scale with the 1.00 parity rule drawn through it. A stem
  runs from parity to the value, so over- and under-representation read as direction. A value past
  the end of the scale is drawn as an arrowhead, never as a dot sitting on 2.00.
- **Monthly composition** — small multiples on one shared scale, with the scale's maximum named and
  the current, still-filling month drawn in a lighter ink.
- **Share shift** — diverging bars around a zero rule, with the axis range printed in percentage
  points.
- **Ranks** — hairline bars whose full width is stated, so the bar is a reading aid and the number
  is the fact.

`docs/lab.html` (git-ignored) is a local style-comparison sheet: the same section rendered in six
visual registers. It loads webfonts from a CDN and is never published.
