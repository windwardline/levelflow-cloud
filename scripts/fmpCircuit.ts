// One shared circuit breaker for every local FMP consumer.
//
// WHY IT EXISTS. FMP bills bytes over a trailing 30 days and publishes no
// usage endpoint, so nothing in this system can read the meter — that is
// §21's whole premise, and the proxy that would fix it is parked. Until then
// every consumer independently decides to call, and independently discovers
// the wall.
//
// Measured on 2026-08-31, while the account sat NINE GB over a 250 GB ceiling:
// the minute bank fired twice daily and spent 97 symbols x 5 retries against
// the refusal each time; the cache top-up fired twice daily and climbed a
// seven-step backoff ladder totalling ~11 minutes; two hourly pg_cron jobs
// called Edge functions that call FMP; and the deploy-time E2E suite ran on
// every merge, nineteen times that day. Six independent consumers, each
// rediscovering the same fact, none able to tell the others.
//
// WHAT THIS DOES NOT CLAIM. The retries did not deepen the exhaustion. FMP
// bills BYTES, not requests, and a bandwidth-refusal body is a few hundred of
// them — measured across a whole roster run it is under a megabyte. The cost
// is wall time, log noise, and a wall nobody can see the shape of. The breaker
// is about making the refusal VISIBLE and shared, not about saving bytes.
//
// The design is deliberately the smallest thing that works without the proxy:
// a dated marker one consumer writes and every consumer reads. It converts N
// consumers x M symbols x R retries into one probe per cool-off window, and it
// makes "are we still refused?" a question anything can answer for free.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const FMP_CIRCUIT_PATH = ".fmp-circuit.json";

/**
 * How long the breaker stays open before it will let ONE consumer probe again.
 *
 * Six hours, and the number is derived rather than chosen. The wall this
 * exists for is a trailing-30-day bandwidth window that drains by the day, so
 * probing more often than a few times a day cannot learn anything new — while
 * probing less often than daily would let a recovered allowance sit unused,
 * and the minute bank's provider window is only three days wide. Six hours
 * gives four probes a day: enough that recovery is noticed the same day,
 * few enough that a refusal is not rediscovered ninety-seven times.
 */
export const COOL_OFF_MS = 6 * 60 * 60 * 1000;

export type CircuitState = {
  /** Null when the breaker has never tripped or was closed by a success. */
  openedAt: number | null;
  /** The refusal that tripped it, verbatim, so a reader need not guess. */
  reason: string | null;
  /** When some consumer last spent a probe against the open breaker. */
  lastProbeAt: number | null;
};

const CLOSED: CircuitState = { lastProbeAt: null, openedAt: null, reason: null };

/**
 * Is this refusal the BANDWIDTH wall, or an ordinary rate limit?
 *
 * The distinction is the whole point. FMP returns 429 for both, and they want
 * opposite responses: a per-minute rate limit is exactly what a backoff ladder
 * is for and clears in seconds, while a bandwidth refusal clears in days and a
 * ladder against it is pure noise. The bank's own retry comment says five
 * attempts "costs a doomed run only time" — true of the first, false of the
 * second, and nothing distinguished them.
 *
 * Matched on the provider's own words rather than the status code, because the
 * code cannot carry the difference.
 */
export function isBandwidthRefusal(body: string): boolean {
  return /bandwidth limit/i.test(body) || /upgrade your plan/i.test(body);
}

export function readCircuit(path = FMP_CIRCUIT_PATH): CircuitState {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CircuitState>;
    return {
      lastProbeAt: typeof raw.lastProbeAt === "number" ? raw.lastProbeAt : null,
      openedAt: typeof raw.openedAt === "number" ? raw.openedAt : null,
      reason: typeof raw.reason === "string" ? raw.reason : null,
    };
  } catch {
    // An absent or unreadable marker is a CLOSED breaker, never an open one.
    // Failing open would be the wrong direction: a consumer that cannot read
    // the file must still be able to work, and the cost of one unnecessary
    // attempt is a request, while the cost of a false refusal is the minute
    // bank going dark for a day it can never recover.
    return { ...CLOSED };
  }
}

function write(state: CircuitState, path: string): void {
  mkdirSync(dirname(path) === "" ? "." : dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

/** Record that the provider refused on bandwidth. Idempotent per outage. */
export function openCircuit(
  reason: string,
  now: number,
  path = FMP_CIRCUIT_PATH,
): CircuitState {
  const current = readCircuit(path);
  // Keep the FIRST opening instant across an outage. Refreshing it on every
  // refusal would reset the cool-off each time and defeat the breaker — the
  // marker records when the wall appeared, not when it was last bumped into.
  const next: CircuitState = {
    lastProbeAt: now,
    openedAt: current.openedAt ?? now,
    reason,
  };
  write(next, path);
  return next;
}

/** Record that the provider answered. Closes the breaker. */
export function closeCircuit(path = FMP_CIRCUIT_PATH): CircuitState {
  write({ ...CLOSED }, path);
  return { ...CLOSED };
}

export type Decision =
  | { allowed: true; probe: boolean; reason: null }
  | { allowed: false; probe: false; reason: string };

/**
 * May this consumer call FMP right now?
 *
 * `probe` marks the one call per cool-off window that is allowed THROUGH an
 * open breaker, so recovery is noticed without the roster being spent to
 * notice it. A caller that receives `probe: true` should make exactly one
 * request and then close or re-open the breaker by its result.
 */
export function mayCall(now: number, path = FMP_CIRCUIT_PATH): Decision {
  const state = readCircuit(path);
  if (state.openedAt === null) {
    return { allowed: true, probe: false, reason: null };
  }
  const since = now - (state.lastProbeAt ?? state.openedAt);
  if (since >= COOL_OFF_MS) {
    return { allowed: true, probe: true, reason: null };
  }
  const hours = ((COOL_OFF_MS - since) / 3_600_000).toFixed(1);
  const openFor = ((now - state.openedAt) / 3_600_000).toFixed(1);
  return {
    allowed: false,
    probe: false,
    reason:
      `FMP circuit open for ${openFor}h — ${state.reason ?? "provider refused"}. ` +
      `Next probe in ${hours}h. The trailing-30-day window drains by time ` +
      `only, so re-running cannot shorten it.`,
  };
}
