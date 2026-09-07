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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anchored to THIS MODULE, not the process cwd.
 *
 * The marker is gitignored, so `scripts/scratch-clone.sh` excludes it — and a
 * scratch copy resolving it against its own cwd reads a CLOSED breaker and
 * believes the allowance is untouched. That matters most exactly when it is
 * most expensive: a sweep launched from a scratch clone.
 */
export const FMP_CIRCUIT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".fmp-circuit.json",
);

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
 * Which wall is this, if any?
 *
 * THREE conditions arrive as a refusal and they want three different answers:
 *
 *   - a per-minute rate limit (429, bare) clears in seconds and is exactly
 *     what the backoff ladder was written for;
 *   - the BANDWIDTH ceiling (429, "Bandwidth Limit Reach") clears in days,
 *     by time alone, and a ladder against it is pure noise;
 *   - an ENTITLEMENT gap (402, "Restricted Endpoint") clears when the plan
 *     changes and never otherwise — not by retrying, not by waiting.
 *
 * The original split was drawn on the provider's words rather than the status
 * code, because 429 covers the first two and the code could not separate them.
 * That reasoning was right for two conditions and wrong the moment a third
 * arrived: the match included `/upgrade your plan/i`, and FMP ends BOTH its
 * bandwidth body and its 402 body with that same courtesy sentence. So from
 * 2026-09-04 an entitlement gap opened the bandwidth breaker, and the minute
 * bank spent four days reporting that a wall which drains by nothing would
 * drain by time.
 *
 * The rule that keeps this honest: match the NARROWEST phrase unique to the
 * condition ("bandwidth limit"), never a sentence the vendor reuses across
 * every paywall, and let the status code do the separating wherever it can.
 */
export type RefusalKind = "bandwidth" | "entitlement";

export function classifyRefusal(body: string): RefusalKind | null {
  // Entitlement first. Its body also says "upgrade your plan", so any future
  // widening of the bandwidth pattern cannot silently swallow it again.
  if (
    /restricted endpoint/i.test(body) ||
    /not available under your current subscription/i.test(body)
  ) {
    return "entitlement";
  }
  if (/bandwidth limit/i.test(body)) return "bandwidth";
  return null;
}

/**
 * Should the shared breaker trip for this refusal?
 *
 * True for both walls. Neither clears by retrying, so both are worth turning
 * into every consumer's knowledge rather than each one's private discovery —
 * that value was never specific to bandwidth. The rate limit stays false: its
 * ladder works.
 */
export function isCircuitRefusal(body: string): boolean {
  return classifyRefusal(body) !== null;
}

/** Strictly the bandwidth ceiling. No longer true of a 402. */
export function isBandwidthRefusal(body: string): boolean {
  return classifyRefusal(body) === "bandwidth";
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

/**
 * What a reader should DO about the open breaker, per condition.
 *
 * The lever differs, so one sentence cannot serve both. Saying "drains by
 * time" about an entitlement gap is not merely imprecise — it is the sentence
 * that made four days of a dead job read as ordinary waiting.
 */
function recoveryClause(reason: string | null): string {
  switch (classifyRefusal(reason ?? "")) {
    case "bandwidth":
      return (
        "The trailing-30-day window drains by time only, so re-running " +
        "cannot shorten it."
      );
    case "entitlement":
      return (
        "This is a subscription gap, not a bandwidth wall: it does not drain " +
        "by time and no re-run clears it — the FMP plan is the only lever. " +
        "The breaker still probes on the cool-off, so the first run after the " +
        "plan is restored closes it with no further step."
      );
    default:
      // An unclassified reason, or a marker written by an older build. Claim
      // neither remedy: a wrong instruction is worse than an absent one.
      return (
        "The provider's refusal did not match a known condition, so neither " +
        "waiting nor re-running is known to clear it — read the reason above."
      );
  }
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
    // `fmpCircuitOpen:` is a STABLE TOKEN for shell consumers that classify a
    // driver's output by grep. The breaker refuses before the provider is
    // asked, so the provider's own "(429)" never appears in a refused run —
    // the nightly top-up read exactly that as "a real failure" (2026-09-02).
    reason:
      `fmpCircuitOpen: FMP circuit open for ${openFor}h — ${state.reason ?? "provider refused"}. ` +
      `Next probe in ${hours}h. ${recoveryClause(state.reason)}`,
  };
}
