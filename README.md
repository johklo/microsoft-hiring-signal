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
| **00 · Brief** | The one-page executive summary: headline figure, six KPIs, four evidence sections, and a numbered outlook reading the hiring as strategy. |
| **The plate** | Share of all postings touching the AI / datacenter / silicon build-out. |
| **01 · Clusters** | Which strategic bet each role serves, plus named products and platforms. |
| **02 · Shape** | Build vs sell vs capacity vs run, the seniority pyramid, and profession × role type. |
| **03 · Momentum** | Which clusters are over- or under-represented in the last 30 days, and the posting trend. |
| **04 · Geography** | Countries, cities, work-site policy and travel requirements. |
| **05 · Index** | Every role, filterable by cluster, profession, country, seniority and free text. |
| **06 · Changes** | What each daily batch opened, closed and edited. |

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
| `npm run fonts` | Re-vendor the Archivo webfont into `public/fonts`. |

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
  taxonomy.mjs      boilerplate stripping, seniority rules, clusters, products
  analyze.mjs       breakdowns, crosstabs, trends
  insight.mjs       the one-page executive brief
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

Cluster shares overlap by design (a role can serve several), so they do not sum to 100 %. Where a
combined figure is quoted, such as the AI / datacenter / silicon share, it is a **set union**, not a
sum of the parts.

---

## Design

Built with the Hallmark design skill.

- **Macrostructure** Stat-Led — the data is the narrative.
- **Genre** editorial · **Theme** Grid (Swiss neo-grotesque, exposed 12-column hairline grid,
  one signal ink in ultramarine).
- **Nav** N3 numbered side-rail · **Footer** Ft4 dense colophon, set in Grid's label voice.
- Figures are hand-drawn CSS and SVG on the column grid rather than a chart library, so they inherit
  the theme exactly and the page stays dependency-free and fully offline.
- Archivo is vendored into `docs/fonts`, so nothing is fetched from a CDN at runtime.
