// Round-8 OP-6: the one retry policy for every FMP consumer on this
// machine. One key serves the fleet, the scan and the minute banks;
// 3,000 requests/min is the published ceiling and, until this module,
// nothing retried a 429 — the probable killer of the first fleet's
// silent shard deaths. The fetch is injected so every branch is
// unit-testable without a network.
//
// Policy: 429 and transient 5xx retry with the caller's backoff ladder;
// durable 4xx return immediately (a 404 is an answer, not an outage).
// After exhaustion the FINAL response returns to the caller, whose own
// site law decides — the sweep's calendar site throws (a run that cannot
// see the whole calendar must stop, I3), the COT site warns and returns
// empty. The retry never overrides a site's law; it only spends attempts
// first.

type RetryableResponse = { ok: boolean; status: number };

export type FmpRetryOptions = {
  // Backoff ladder in milliseconds; attempts = delays + 1.
  delaysMs?: number[];
  // Called before each retry sleep, so a run that spent forty minutes
  // retrying is distinguishable from one that sailed through. Both retry
  // reasons were invisible before: a driver could not tell a clean sweep
  // from one that hit five hundred 429s.
  onRetry?: (event: FmpRetryEvent) => void;
  // Optional global pacing: every request (first attempt included) waits
  // until at least this many ms after the previous request THROUGH THIS
  // MODULE. One knob for the whole process — the fleet pacing flag.
  paceMs?: number;
};

export type FmpRetryEvent = {
  // 0-based index of the attempt that just failed.
  attempt: number;
  delayMs: number;
  detail: string;
  // "status" = the server answered and asked us to back off (429/5xx).
  // "transport" = there was no answer at all.
  reason: "status" | "transport";
};

const DEFAULT_DELAYS_MS = [2_000, 8_000, 30_000];

// Pacing runs on performance.now(), never Date.now() (#364 round-9 CI):
// the wall clock steps under NTP — a forward step under-waits the pace
// and bursts through the 3,000/min ceiling this module exists to respect
// (a CI runner's ~5ms step cut a 25ms pace to 19.7ms), and a backward
// step of minutes would stall every consumer that long. The monotonic
// clock can do neither. null = no request has gone through yet, so the
// first is never paced (performance.now() starts near 0 at process
// start, which a numeric sentinel would read as a recent request).
let lastRequestAtMs: number | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 429 || status >= 500;
}

export async function fetchFmpWithRetry<T extends RetryableResponse>(
  request: () => Promise<T>,
  options: FmpRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const paceMs = options.paceMs ?? 0;
  let response: T;
  for (let attempt = 0; ; attempt += 1) {
    await applyPace(paceMs);
    // A socket that times out, resets or fails DNS never produces a
    // status, so it never reached shouldRetry below — this module retried
    // the server asking us to slow down and did not retry the network
    // dropping the call. Three consecutive v4 cache rebuilds died exactly
    // here, on `TypeError: fetch failed / read ETIMEDOUT`, at 58, 72 and 75
    // markets of 98, each throwing away hours of a run whose every
    // completed market was already durable on disk.
    //
    // The throw is retried on the same ladder and, once the ladder is
    // spent, the ORIGINAL error is rethrown — never swallowed, never
    // dressed up as a response. A caller must still be able to tell "the
    // network is down" from "the provider answered".
    try {
      response = await request();
    } catch (error) {
      if (attempt >= delays.length) {
        throw error;
      }
      options.onRetry?.({
        attempt,
        delayMs: delays[attempt],
        detail: errorDetail(error),
        reason: "transport",
      });
      await sleep(delays[attempt]);
      continue;
    }
    if (response.ok || !shouldRetry(response.status)) {
      return response;
    }
    if (attempt >= delays.length) {
      return response;
    }
    options.onRetry?.({
      attempt,
      delayMs: delays[attempt],
      detail: `HTTP ${response.status}`,
      reason: "status",
    });
    await sleep(delays[attempt]);
  }
}

/**
 * The global pace, applied before every request through this module.
 *
 * Extracted so `fetchFmpJsonWithRetry` shares ONE implementation with
 * `fetchFmpWithRetry` rather than carrying a second copy — a pace that
 * throttled one entry point and not the other would be worse than none,
 * because the ceiling it protects is per-process.
 */
async function applyPace(paceMs: number) {
  if (paceMs > 0) {
    if (lastRequestAtMs !== null) {
        // Re-check after waking: setTimeout can fire up to ~1ms early on
        // libuv's ms-truncated timer clock, and "at least paceMs apart"
        // is a floor, not a target. Because the loop re-reads the
        // module-global stamp, N CONCURRENT callers serialize one pace
        // apart instead of computing one shared wait and firing
        // together — intended (#364 round 9, smaller): the pace exists
        // to hold the whole process under FMP's ceiling, and a
        // simultaneous burst of N is exactly what it must prevent.
      let elapsed = performance.now() - lastRequestAtMs;
      while (elapsed < paceMs) {
        await sleep(paceMs - elapsed);
        elapsed = performance.now() - lastRequestAtMs;
      }
    }
    lastRequestAtMs = performance.now();
  }
}

/**
 * Fetch AND consume a body as ONE retryable unit.
 *
 * `fetchFmpWithRetry` retries getting a RESPONSE. It cannot retry reading
 * one: it returns the moment the headers arrive, and the body is streamed by
 * the caller afterwards, outside every guard this module provides. For the
 * sweep's bar fetches the body is the large, slow, risky part — hundreds of
 * thousands of bars per request — so the unprotected half was most of the
 * exposure.
 *
 * That is what killed the fifth v4 rebuild attempt, at 88 markets of 98:
 * `Fetch.onAborted` with `cause: read ECONNRESET`, thrown while streaming a
 * response whose headers had already arrived. It logged no retry, because
 * from this module's point of view the request had already succeeded.
 *
 * On a throw from EITHER half, the whole attempt repeats — a partially read
 * body is a failed request, not a partial success. After the ladder is spent
 * the original error is rethrown, never swallowed.
 *
 * The caller is handed a discriminated result rather than a response, because
 * a non-ok status must not be consumed and the caller owns what that means:
 * the sweep's calendar site throws, the COT site warns and returns empty.
 */
export async function fetchFmpJsonWithRetry<
  T extends RetryableResponse,
  R,
>(
  request: () => Promise<T>,
  consume: (response: T) => Promise<R>,
  options: FmpRetryOptions = {},
): Promise<{ body: R; ok: true } | { ok: false; response: T }> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    let response: T;
    try {
      await applyPace(options.paceMs ?? 0);
      response = await request();
      if (response.ok) {
        return { body: await consume(response), ok: true };
      }
    } catch (error) {
      if (attempt >= delays.length) {
        throw error;
      }
      options.onRetry?.({
        attempt,
        delayMs: delays[attempt],
        detail: errorDetail(error),
        reason: "transport",
      });
      await sleep(delays[attempt]);
      continue;
    }
    if (!shouldRetry(response.status) || attempt >= delays.length) {
      return { ok: false, response };
    }
    options.onRetry?.({
      attempt,
      delayMs: delays[attempt],
      detail: `HTTP ${response.status}`,
      reason: "status",
    });
    await sleep(delays[attempt]);
  }
}

/**
 * A short, log-safe description of a thrown transport failure.
 *
 * Node reports every socket failure as the same `TypeError: fetch failed`
 * and puts the real signal — ETIMEDOUT, ECONNRESET, ENOTFOUND — on `cause`.
 * A message alone would make every network fault look identical in a log,
 * which is how three identical-looking rebuild deaths went undiagnosed.
 */
function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  const code = cause instanceof Error && "code" in cause
    ? String((cause as { code?: unknown }).code)
    : undefined;
  return code ? `${error.message} (${code})` : error.message;
}
