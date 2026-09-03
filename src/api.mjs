import {
  API_BASE,
  BLOCK_COOLDOWN_MS,
  BLOCK_ESCALATION,
  DOMAIN,
  MAX_BLOCK_COOLDOWN_MS,
  MAX_RETRIES,
  MIN_INTERVAL_MS,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  SITE_BASE,
  USER_AGENT,
} from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Browser-shaped headers; the WAF is noticeably less tolerant without them. */
const HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: SITE_BASE + '/',
  origin: SITE_BASE,
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'sec-fetch-dest': 'empty',
  'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

class HttpError extends Error {
  constructor(status, url, blocked = false) {
    super(`HTTP ${status}${blocked ? ' (WAF block)' : ''} for ${url}`);
    this.status = status;
    this.blocked = blocked;
  }
}

// ---- global pacing ---------------------------------------------------------
// One shared schedule, so the total request rate is bounded no matter how many
// workers are running.
let nextSlot = 0;
let blockedUntil = 0;
let currentCooldown = BLOCK_COOLDOWN_MS;
let blockEvents = 0;

async function takeSlot() {
  while (true) {
    const wait = blockedUntil - Date.now();
    if (wait > 0) {
      await sleep(Math.min(wait, 5000));
      continue;
    }
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + MIN_INTERVAL_MS;
    const delay = slot - now;
    if (delay > 0) await sleep(delay);
    return;
  }
}

/** Pause every worker; called when the WAF starts refusing us. */
function tripBreaker() {
  if (blockedUntil > Date.now()) return;
  blockEvents++;
  blockedUntil = Date.now() + currentCooldown;
  noticeHandler(Math.round(currentCooldown / 1000), blockEvents);
  currentCooldown = Math.min(MAX_BLOCK_COOLDOWN_MS, Math.round(currentCooldown * BLOCK_ESCALATION));
}

/** Called after a clean response so the cooldown decays back toward normal. */
function noteSuccess() {
  if (currentCooldown > BLOCK_COOLDOWN_MS) {
    currentCooldown = Math.max(BLOCK_COOLDOWN_MS, Math.round(currentCooldown * 0.85));
  }
}

export function rateStats() {
  return { blockEvents, currentCooldownMs: currentCooldown };
}

let noticeHandler = (secs, n) =>
  console.warn(`\n  ! WAF block #${n} \u2014 pausing all requests for ${secs}s...`);
export function onBlockNotice(fn) {
  noticeHandler = fn;
}

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.min(20000, 700 * 2 ** (attempt - 1)) + Math.random() * 500);
    await takeSlot();

    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      // A 403 from Front Door is a rate block, not a permanent denial.
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        tripBreaker();
        throw new HttpError(res.status, url, res.status === 403);
      }
      if (!res.ok) throw new HttpError(res.status, url);

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        tripBreaker();
        throw new Error(`Non-JSON response (${ct}) for ${url}`);
      }

      const body = await res.json();
      if (body && body.status && body.status !== 200) {
        throw new Error(`API status ${body.status}: ${body.error?.message || 'unknown'}`);
      }
      noteSuccess();
      return body;
    } catch (err) {
      lastErr = err;
      // Genuine client errors will not succeed on retry.
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && !err.blocked && err.status !== 429) {
        throw err;
      }
    }
  }
  throw lastErr;
}

/** Fetch one page of the public job search. `start` is a 0-based row offset. */
export async function fetchSearchPage(start) {
  const url =
    `${API_BASE}/search?domain=${DOMAIN}&query=&location=&start=${start}` +
    `&num=${PAGE_SIZE}&sort_by=relevance&hl=en`;
  const body = await getJson(url);
  return {
    total: body?.data?.count ?? 0,
    positions: body?.data?.positions ?? [],
    filterDef: body?.data?.filterDef ?? null,
  };
}

/** Fetch the rich detail record for a single position id. */
export async function fetchPositionDetails(positionId) {
  const url = `${API_BASE}/position_details?position_id=${positionId}&domain=${DOMAIN}&hl=en`;
  const body = await getJson(url);
  return body?.data ?? null;
}

/** True when the public API is currently reachable. */
export async function probe() {
  try {
    const r = await fetchSearchPage(0);
    return r.total > 0;
  } catch {
    return false;
  }
}

/**
 * Run `worker` over `items` with bounded concurrency.
 * Failures are collected rather than aborting the whole batch.
 */
export async function pool(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  const errors = [];
  let cursor = 0;
  let done = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = undefined;
        errors.push({ item: items[i], error: err.message });
      }
      done++;
      if (onProgress) await onProgress(done, items.length, i, results[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return { results, errors };
}
