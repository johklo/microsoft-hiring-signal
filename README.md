# Hiring Signal

A local website that reads every role advertised on **careers.microsoft.com** and turns it into
business insight: what kind of work is being bought, which strategic bets it serves, how the
organisation is being shaped, and what the advertising implies about direction.

Everything runs on your machine. No account, no API key, no third-party service.

---

## Quick start

```powershell
npm run batch      # collect the data (first run is a full crawl, ~65 min)
npm run serve      # open http://localhost:4173
```

There is nothing to install — the project uses only Node's standard library (Node 18+).

The first run walks the whole index and fetches a detail record for every posting. Later runs are
incremental and take a few minutes.

If a run is interrupted, just run `npm run batch` again — progress is checkpointed and it resumes
where it left off.

---

## Daily batch

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
| **05 · Momentum** | What is over- and under-represented in the last 30 days, the daily posting trend, monthly composition by cluster and business unit, and the share shift between the last three months and the three before. |
| **06 · Geography** | Countries, cities, work-site policy and travel requirements. |
| **07 · Index** | Every role, filterable by cluster, business unit, industry vertical, profession, country, seniority and free text. |
| **08 · Changes** | What each daily batch opened, closed and edited. |

### The dimensions

Each role is placed on several independent axes, so the same posting can be read several ways:

1. **Strategic cluster** — which bet the work serves (AI Platform, Datacenter Buildout, Go-to-Market…). Multi-valued.
2. **Business unit** — which part of the company is hiring, with the division it reports into:
   **MCAPS** (ATU, CSU, GPS, CE&S, CSS, SME&C), **Microsoft Frontier Company** (ISD, FDE), and the
   **engineering and product divisions** (CO+I, SCHIE, MAI, CoreAI, Microsoft Security, Cloud + AI,
   E+D, MSR, Gaming, LinkedIn). Single-valued.

   A unit is only counted when the advert **identifies itself** — *"within Microsoft's Global Partner
   Solutions (GPS) organization"*, *"Microsoft Industry Solutions Delivery (ISD) is a global
   organization"* — and only from the **Overview** section. This matters: the Responsibilities
   section routinely lists teams a role merely collaborates with (*"across organizations (e.g., ATU,
   CSU, ISD, GPS)"*), and counting those put field roles such as Account Technology Strategist in
   the wrong unit entirely. About a third of adverts qualify; the rest are reported as *not stated*
   rather than guessed, so unit totals are a floor rather than a census.
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
| `npm run batch` | Incremental daily batch (full crawl on first run). |
| `npm run batch:full` | Force a re-fetch of every detail record. |
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
that the missing jobs were closed.

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
  daily.mjs         batch orchestrator
  rebuild.mjs       recompute from cache, no network
  schedule.mjs      Windows Scheduled Task install/remove
  server.mjs        static file server
  store.mjs         atomic JSON reads/writes
docs/               the published site (vanilla HTML/CSS/JS, no build step, no CDN)
data/              raw crawl cache + logs  (local only, git-ignored)
```

`data/` is the durable local record. `docs/` is what gets committed and served —
including `docs/data/stats.json` and `docs/data/jobs.min.json`, the two files the browser reads.

No runtime or build dependencies: Node's standard library only.

---

## Publishing

`docs/` is a self-contained static site, so GitHub Pages can serve it directly
(**Settings → Pages → Source: `main` branch, `/docs` folder**).

The crawler cannot run on Pages — the origin blocks datacenter traffic — so the batch runs on your
machine and publishes the result:

```powershell
npm run batch
git add docs
git commit -m "data: daily batch"
git push
```

To make the scheduled task publish automatically, append those three lines to
`scripts/run-daily.cmd` after the batch command.

---

## Accuracy notes

Two corrections worth knowing about, because they changed the numbers a lot:

- **Boilerplate is stripped before tagging.** Roughly 27 % of a typical description is standard
  legal, benefits and pay-band text. Left in, the phrase *"ability to meet … government security
  screening requirements"* alone made three quarters of all roles look like security roles.
- **Body text needs corroboration.** A keyword in the title, profession, discipline or department
  tags a role outright. In the free-text body a single mention is not enough — nearly half of all
  adverts name Azure somewhere — so two distinct keyword hits are required.
- **Organisations must identify themselves.** An advert naming a team is not the same as belonging
  to it. Only possessive constructions in the Overview count, which cut business-unit coverage from
  56 % to about a third but removed the false positives entirely.

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
