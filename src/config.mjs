export const DOMAIN = 'microsoft.com';
export const API_BASE = 'https://apply.careers.microsoft.com/api/pcsx';
export const SITE_BASE = 'https://jobs.careers.microsoft.com';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** The search endpoint ignores `num` and always returns 10 rows per page. */
export const PAGE_SIZE = 10;

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

/**
 * Pacing. The origin sits behind an Azure Front Door WAF with a rate rule that
 * blocks the client IP for minutes once tripped, so the crawler is deliberately
 * slow and self-throttling. Override via env vars for tuning.
 */
export const CONCURRENCY = num(process.env.MSJOBS_CONCURRENCY, 2);
/** Minimum gap between the start of any two requests, globally. */
export const MIN_INTERVAL_MS = num(process.env.MSJOBS_INTERVAL_MS, 1200);
/**
 * Observed behaviour: blocks are burst-triggered and clear within ~1-2 minutes,
 * so the breaker waits patiently rather than escalating hard.
 */
export const BLOCK_COOLDOWN_MS = num(process.env.MSJOBS_COOLDOWN_MS, 90000);
export const BLOCK_ESCALATION = 1.25;
export const MAX_BLOCK_COOLDOWN_MS = 10 * 60 * 1000;

export const REQUEST_TIMEOUT_MS = 30000;
/** Generous, because a block costs several attempts before the window clears. */
export const MAX_RETRIES = 12;

/** Re-fetch a job's detail record if the cached copy is older than this. */
export const DETAIL_REFRESH_DAYS = 14;

/** Persist partial progress every N detail fetches so a block never loses work. */
export const CHECKPOINT_EVERY = 50;

/**
 * Maximum detail records fetched in a single run. The origin throttles hard, so
 * the corpus backfills across successive daily batches rather than in one burst.
 * 0 disables the cap.
 */
export const DETAIL_BUDGET = num(process.env.MSJOBS_DETAIL_BUDGET, 700);

/** How many daily runs to retain in the change log. */
export const CHANGELOG_RUNS = 120;
