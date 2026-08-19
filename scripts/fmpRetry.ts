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
  // Optional global pacing: every request (first attempt included) waits
  // until at least this many ms after the previous request THROUGH THIS
  // MODULE. One knob for the whole process — the fleet pacing flag.
  paceMs?: number;
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
    response = await request();
    if (response.ok || !shouldRetry(response.status)) {
      return response;
    }
    if (attempt >= delays.length) {
      return response;
    }
    await sleep(delays[attempt]);
  }
}
