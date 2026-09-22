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
// them. The breaker is about making the refusal VISIBLE and shared, not about
// saving bytes.
//
// AN EVENT LOG, NOT A MARKER (2026-09-16). The first version was one JSON file
// every consumer rewrote whole, and two defects followed from that shape: a
// close written by one process could erase a newer refusal written by another,
// and a probe claim could re-open a breaker that had just been closed. It was
// also ONE key, so a 402 the top-up met on the economic calendar refused the
// minute bank's 1-minute run twenty minutes later (09-05 and 09-08, 11:00Z and
// 11:20Z) for a wall that endpoint did not have.
//
// So every writer now appends one event — refused, answered, claim, release —
// to `.fmp-state/breaker/`, and a reader folds them. Open or closed is decided
// by EVIDENCE TIME, the newest refusal against the newest answer, whatever
// order the lines landed in. A bandwidth or suspension refusal is a fact about
// the account; an entitlement refusal is a fact about one endpoint, keyed by
// its pathname. The one probe per cool-off is decided by file order, which is
// total, so two consumers past the cool-off cannot both probe.
//
// The minute bank never asks this module for permission (§21c: the bank
// "cannot be refused"); it only reports what its scout learned.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import {
  LedgerUnreadableError,
  LedgerWriteError,
  ProbeLostError,
} from "./fmpByteBudget.ts";
import {
  appendRecord,
  type FmpStatePaths,
  pruneOnce,
  readRecords,
  reportBookkeepingFailure,
  reportUnreadableState,
  RETAIN_DAYS,
  StateReadError,
  utcDay,
} from "./fmpState.ts";

/**
 * How long the breaker stays open before it will let ONE consumer probe again.
 *
 * Six hours, and the number is derived rather than chosen. The wall this
 * exists for is a trailing-30-day bandwidth window that drains by the day, so
 * probing more often than a few times a day cannot learn anything new — while
 * probing less often than daily would let a recovered allowance sit unused.
 * Six hours gives four probes a day: enough that recovery is noticed the same
 * day, few enough that a refusal is not rediscovered ninety-seven times.
 */
export const COOL_OFF_MS = 6 * 60 * 60 * 1000;

/**
 * Which wall is this, if any?
 *
 * FOUR conditions arrive as a refusal and they want four different answers:
 *
 *   - the BANDWIDTH ceiling (429, "Bandwidth Limit Reach") clears in days, by
 *     time alone;
 *   - an ENTITLEMENT gap (402, "Restricted Endpoint") clears when the plan
 *     changes and never otherwise;
 *   - a SUSPENSION (403, "Account suspended", captured in the minute bank's log
 *     from 2026-09-08T23:20:01Z) clears when the owner resolves it with FMP;
 *   - a REJECTED KEY (401, "Invalid API KEY", 805 stored rows on 2026-08-18)
 *     clears when the key a consumer holds is one FMP accepts.
 *
 * A bare per-minute rate limit is none of them: its ladder works.
 *
 * The rule that keeps this honest: match the NARROWEST phrase unique to the
 * condition, never a sentence the vendor reuses across every paywall. FMP ends
 * both its bandwidth body and its 402 body with "upgrade your plan", and a
 * pattern on that sentence opened the bandwidth breaker on an entitlement gap
 * for four days from 2026-09-04. Entitlement is tested first so no later
 * widening can swallow it again.
 */
export const REFUSAL_KINDS = ["bandwidth", "entitlement", "suspended", "invalidKey"] as const;

export type RefusalKind = (typeof REFUSAL_KINDS)[number];

export function classifyRefusal(body: string): RefusalKind | null {
  if (
    /restricted endpoint/i.test(body) ||
    /not available under your current subscription/i.test(body)
  ) {
    return "entitlement";
  }
  if (/account suspended/i.test(body)) return "suspended";
  if (/invalid api key/i.test(body)) return "invalidKey";
  if (/bandwidth limit/i.test(body)) return "bandwidth";
  return null;
}

/**
 * Should the shared breaker trip for this refusal?
 *
 * True for the three walls that are facts about the account or its plan. A
 * rejected key is not: it is a fact about the copy of the key one consumer
 * holds, and a consumer holding a good copy must not be refused because
 * another holds a stale one. It is still classified, and still red.
 */
export function isCircuitRefusal(body: string): boolean {
  const kind = classifyRefusal(body);
  return kind === "bandwidth" || kind === "entitlement" || kind === "suspended";
}

/** Strictly the bandwidth ceiling. */
export function isBandwidthRefusal(body: string): boolean {
  return classifyRefusal(body) === "bandwidth";
}

/**
 * What a reader should DO, per condition. The lever differs, so one sentence
 * cannot serve all four: "drains by time" said about an entitlement gap is the
 * sentence that made four days of a dead job read as ordinary waiting.
 */
export function recoveryClause(kind: RefusalKind | null): string {
  switch (kind) {
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
    case "suspended":
      return (
        "The account is suspended: no wait, re-run or plan allowance clears " +
        "it. The owner resolves it with FMP. The first run after reinstatement " +
        "closes the breaker with no further step."
      );
    case "invalidKey":
      return (
        "FMP rejected the key: the Keychain item fmp-api-key, or a stale copy " +
        "of it in a consumer, holds a key FMP does not accept; no wait or " +
        "re-run clears it."
      );
    default:
      return (
        "The provider's refusal did not match a known condition, so neither " +
        "waiting nor re-running is known to clear it — read the reason above."
      );
  }
}

/**
 * Which open entry names a blocked run when more than one blocks it.
 *
 * The table is total over the kinds, so nothing ranks by omission: a rejected
 * key sat at 0 for want of a row. One property is load-bearing — BANDWIDTH
 * RANKS LOWEST, below an unclassified refusal too. It is the one wall that
 * drains by time and the one kind the nightly top-up stands down green on, so
 * a bandwidth entry that outranked anything else would report a co-open red
 * condition as a green stand-down, which is the expensive direction. Above it
 * the order is by reach, and only decides which condition the line names: the
 * one nothing recognises, then one endpoint's plan, then one consumer's copy
 * of the key, then the whole account. A rejected key never opens the breaker
 * at all — `openCircuit` refuses to write one and `readBreaker` drops one
 * from any record — so its row is there for totality, and sits above
 * bandwidth for the same reason as the rest.
 *
 * In practice it compares the account's entry against an endpoint's
 * entitlement: the account entry holds one kind at a time, its newest.
 */
const SEVERITY: Record<RefusalKind | "unclassified", number> = {
  bandwidth: 1,
  unclassified: 2,
  entitlement: 3,
  invalidKey: 4,
  suspended: 5,
};

/** The rank of a refusal kind; a kind this build does not know ranks unclassified. */
export function refusalSeverity(kind: RefusalKind | null): number {
  if (kind === null) return SEVERITY.unclassified;
  return Object.hasOwn(SEVERITY, kind) ? SEVERITY[kind] : SEVERITY.unclassified;
}

type RefusedEvent = {
  t: "refused";
  at: number;
  key: string;
  kind: RefusalKind | null;
  reason: string;
};
type AnsweredEvent = { t: "answered"; at: number; endpointPath: string };
type ClaimEvent = { t: "claim"; at: number; id: string; keys: string[] };
type ReleaseEvent = { t: "release"; at: number; id: string };
type BreakerEvent = RefusedEvent | AnsweredEvent | ClaimEvent | ReleaseEvent;

function asEvent(record: unknown): BreakerEvent | null {
  const value = record as Record<string, unknown>;
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
  switch (value.t) {
    case "refused":
      return typeof value.key === "string" && typeof value.reason === "string"
        ? {
          at: value.at,
          key: value.key,
          kind: typeof value.kind === "string" ? value.kind as RefusalKind : null,
          reason: value.reason,
          t: "refused",
        }
        : null;
    case "answered":
      return typeof value.endpointPath === "string"
        ? { at: value.at, endpointPath: value.endpointPath, t: "answered" }
        : null;
    case "claim":
      return typeof value.id === "string" && Array.isArray(value.keys) &&
          value.keys.every((key) => typeof key === "string")
        ? { at: value.at, id: value.id, keys: value.keys as string[], t: "claim" }
        : null;
    case "release":
      return typeof value.id === "string" ? { at: value.at, id: value.id, t: "release" } : null;
    default:
      return null;
  }
}

export type BreakerEntry = {
  /** "account", or the pathname an entitlement refusal was met on. */
  key: string;
  open: boolean;
  kind: RefusalKind | null;
  reason: string;
  /** The first refusal after the last answer covering this key. */
  openedAt: number;
  lastRefusedAt: number;
  lastAnsweredAt: number | null;
  /** The latest valid probe claim, or null. */
  lastProbeAt: number | null;
  probeWinnerId: string | null;
};

export type BreakerRead =
  | { ok: true; entries: BreakerEntry[]; legacyUnreadable: boolean; skippedLines: number }
  | { ok: false; unreadable: string };

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const DAY_MS = 86_400_000;

/**
 * The pre-2026-09-16 marker, read as history. An open marker becomes one
 * account-scope refusal at its last probe; a torn one, or one that exists and
 * cannot be read at all, is ignored and reported as unreadable. Only an absent
 * file is absent. Nothing in this module writes it. It predates the rule
 * that a rejected key opens nothing, so it can hold one; `readBreaker` drops
 * it with the rest.
 */
function legacyEvent(path: string): { event: RefusedEvent | null; unreadable: boolean } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { event: null, unreadable: (error as { code?: string }).code !== "ENOENT" };
  }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw.openedAt !== "number") return { event: null, unreadable: false };
    const reason = typeof raw.reason === "string" ? raw.reason : "provider refused";
    return {
      event: {
        at: typeof raw.lastProbeAt === "number" ? raw.lastProbeAt : raw.openedAt,
        key: "account",
        kind: classifyRefusal(reason),
        reason,
        t: "refused",
      },
      unreadable: false,
    };
  } catch {
    return { event: null, unreadable: true };
  }
}

/** Fold the breaker log and the legacy marker into one entry per key. */
export function readBreaker(nowMs: number, state: FmpStatePaths): BreakerRead {
  const events: BreakerEvent[] = [];
  let skippedLines = 0;
  const legacy = legacyEvent(state.legacyCircuitPath);
  if (legacy.event) events.push(legacy.event);
  try {
    let names: string[] = [];
    try {
      names = readdirSync(state.breakerDir);
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw new StateReadError(state.breakerDir, error);
      }
    }
    const oldest = utcDay(nowMs - RETAIN_DAYS * DAY_MS);
    const days = names
      .map((name) => DAY_FILE.exec(name)?.[1])
      .filter((day): day is string => day !== undefined && day >= oldest)
      .sort();
    for (const day of days) {
      const read = readRecords(state.breakerDir, day);
      skippedLines += read.skippedLines;
      for (const record of read.records) {
        const event = asEvent(record);
        if (event) events.push(event);
        else skippedLines += 1;
      }
    }
  } catch (error) {
    return { ok: false, unreadable: error instanceof Error ? error.message : String(error) };
  }

  const released = new Set(
    events.filter((event): event is ReleaseEvent => event.t === "release").map((event) => event.id),
  );
  // A rejected key opens nothing, whichever record carries one. `openCircuit`
  // refuses to write it, because it is a fact about one consumer's copy of the
  // key rather than about the account; the legacy marker predates that rule and
  // the 2026-08-18 key failure (805 stored rows) is a shape it can hold; and a
  // log line with that kind can only be a hand edit. Read through, either would
  // refuse every top-up and ad-hoc run under `invalidKey`. The consumer holding
  // the bad key still meets it, red, on its own call.
  const refusals = events.filter(
    (event): event is RefusedEvent => event.t === "refused" && event.kind !== "invalidKey",
  );
  const answers = events.filter((event): event is AnsweredEvent => event.t === "answered");
  const claims = events.filter((event): event is ClaimEvent => event.t === "claim");
  const keys = [...new Set(refusals.map((event) => event.key))].sort();

  const entries = keys.map((key): BreakerEntry => {
    const own = refusals.filter((event) => event.key === key);
    const lastRefusedAt = Math.max(...own.map((event) => event.at));
    const covering = answers.filter((event) => key === "account" || event.endpointPath === key);
    const lastAnsweredAt = covering.length > 0 ? Math.max(...covering.map((event) => event.at)) : null;
    // The newest refusal names the condition; a tie goes to the later line.
    let newest = own[0];
    for (const event of own) if (event.at >= newest.at) newest = event;
    const sinceAnswer = own.filter((event) => lastAnsweredAt === null || event.at > lastAnsweredAt);
    const openedAt = sinceAnswer.length > 0
      ? Math.min(...sinceAnswer.map((event) => event.at))
      : lastRefusedAt;
    let base = lastRefusedAt;
    let lastProbeAt: number | null = null;
    let probeWinnerId: string | null = null;
    for (const claim of claims) {
      if (!claim.keys.includes(key) || released.has(claim.id)) continue;
      if (claim.at >= base + COOL_OFF_MS) {
        base = claim.at;
        lastProbeAt = claim.at;
        probeWinnerId = claim.id;
      }
    }
    return {
      key,
      kind: newest.kind,
      lastAnsweredAt,
      lastProbeAt,
      lastRefusedAt,
      open: lastAnsweredAt === null || lastRefusedAt > lastAnsweredAt,
      openedAt,
      probeWinnerId,
      reason: newest.reason,
    };
  });
  return { entries, legacyUnreadable: legacy.unreadable, ok: true, skippedLines };
}

type Consumer = "bank" | "topup" | "adhoc";

function appendEvent(state: FmpStatePaths, atMs: number, event: object): void {
  appendRecord(state.breakerDir, atMs, event);
  pruneOnce(state.breakerDir, atMs);
}

/**
 * Record a refusal that no retry clears. Throws on a rejected key: that is a
 * fact about one consumer's copy of the key, and opening the shared breaker on
 * it is a programming error rather than a judgement call.
 */
export function openCircuit(
  input: {
    reason: string;
    kind: RefusalKind;
    endpointPath: string;
    atMs: number;
    consumer: Consumer;
  },
  state: FmpStatePaths,
): void {
  if (input.kind === "invalidKey") {
    throw new Error(
      "openCircuit: a rejected key does not open the shared breaker — classify " +
        "it red at the consumer instead",
    );
  }
  appendEvent(state, input.atMs, {
    at: input.atMs,
    consumer: input.consumer,
    endpointPath: input.endpointPath,
    key: input.kind === "entitlement" ? input.endpointPath : "account",
    kind: input.kind,
    pid: process.pid,
    reason: input.reason.slice(0, 500),
    t: "refused",
  });
}

/** Record that the provider answered at `evidenceAtMs`. */
export function closeCircuit(
  input: { evidenceAtMs: number; endpointPath: string; consumer: Consumer },
  state: FmpStatePaths,
): void {
  appendEvent(state, input.evidenceAtMs, {
    at: input.evidenceAtMs,
    consumer: input.consumer,
    endpointPath: input.endpointPath,
    pid: process.pid,
    t: "answered",
  });
}

export type BreakerDecision =
  | { allowed: true; probe: false }
  | { allowed: true; probe: true; keys: string[] }
  | { allowed: false; kind: string; reason: string };

const hours = (ms: number) => (ms / 3_600_000).toFixed(1);

/**
 * May a consumer that needs `requiredPaths` call FMP right now? Read-only.
 *
 * Blocking entries are the open account entry and the open entries for the
 * paths this run will request. Inside any blocking entry's cool-off the run is
 * refused, and the kind it reports is the most severe across every blocking
 * entry, so a bandwidth wall inside its cool-off cannot hide a suspension past
 * its own. Past every cool-off, one probe is granted for the blocking keys;
 * `createProbeGate` claims it at the first request.
 *
 * `fmpCircuitOpen:` stays the reason's head for the people and tests that read
 * it; no shell reader greps for it since 2026-09-16.
 */
export function mayCall(
  nowMs: number,
  input: { requiredPaths: readonly string[]; emit?: (line: string) => void },
  state: FmpStatePaths,
): BreakerDecision {
  const read = readBreaker(nowMs, state);
  if (!read.ok) {
    return {
      allowed: false,
      kind: "ledgerUnreadable",
      reason: `fmpBreakerUnreadable: the shared FMP breaker log could not be read, so no spender may assume it is closed: ${read.unreadable}`,
    };
  }
  if (read.skippedLines > 0) {
    reportUnreadableState(
      `breaker log ${state.breakerDir}`,
      `${read.skippedLines} unreadable line(s) skipped; the events they carried are not counted`,
      input.emit,
    );
  }
  if (read.legacyUnreadable) {
    reportUnreadableState(
      `legacy breaker ${state.legacyCircuitPath}`,
      "exists and could not be read; it is read as no refusal",
      input.emit,
    );
  }
  const blocking = read.entries.filter((entry) =>
    entry.open && (entry.key === "account" || input.requiredPaths.includes(entry.key))
  );
  if (blocking.length === 0) return { allowed: true, probe: false };
  const lastTouch = (entry: BreakerEntry) => Math.max(entry.lastRefusedAt, entry.lastProbeAt ?? -Infinity);
  const inCoolOff = blocking.filter((entry) => nowMs - lastTouch(entry) < COOL_OFF_MS);
  if (inCoolOff.length === 0) {
    return { allowed: true, keys: blocking.map((entry) => entry.key), probe: true };
  }
  const ordered = [...blocking].sort((a, b) =>
    refusalSeverity(b.kind) - refusalSeverity(a.kind) ||
    Number(nowMs - lastTouch(a) >= COOL_OFF_MS) - Number(nowMs - lastTouch(b) >= COOL_OFF_MS)
  );
  const mostSevere = ordered[0].kind;
  const segments = ordered.map((entry) => {
    const remaining = COOL_OFF_MS - (nowMs - lastTouch(entry));
    const next = remaining > 0 ? `Next probe in ${hours(remaining)}h.` : "Probe due.";
    return `for ${hours(nowMs - entry.openedAt)}h on ${entry.key} — ${entry.reason}. ${next} ${recoveryClause(entry.kind)}`;
  });
  return {
    allowed: false,
    kind: mostSevere ?? "unclassified",
    reason: `fmpCircuitOpen: FMP circuit open ${segments.join(" Also open ")}`,
  };
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ProbeGate = {
  beforeRequest: () => void;
  answered: () => void;
  noAnswer: () => void;
  wrapFetch: <F extends FetchLike>(f: F) => F;
};

/**
 * Claim the breaker's one probe at the first request, and release it if no
 * answer came.
 *
 * The claim is appended and the log re-folded; for every key still open, the
 * winner — the first valid unreleased claim in file order — must be this
 * gate's own. A loser releases and stands down with `ProbeLostError`. Once the
 * provider has answered, the claim stays: the answer itself either closes the
 * key (a success appends an answered event) or re-arms it (a refusal appends
 * a newer one). A transport failure releases it, so a network that was down
 * does not cost every other consumer six hours.
 */
export function createProbeGate(
  decision: { allowed: boolean; probe?: boolean; keys?: readonly string[] },
  options: { consumer: Consumer; now: () => number },
  state: FmpStatePaths,
): ProbeGate {
  if (!decision.allowed || decision.probe !== true) {
    return {
      answered: () => {},
      beforeRequest: () => {},
      noAnswer: () => {},
      wrapFetch: (f) => f,
    };
  }
  const keys = [...(decision.keys ?? [])];
  let held: string | null = null;
  let settled = false;
  let lost: ProbeLostError | null = null;

  const append = (event: object, what: string) => {
    const at = options.now();
    try {
      appendEvent(state, at, { ...event, at, consumer: options.consumer, pid: process.pid });
    } catch (error) {
      reportBookkeepingFailure(`breaker ${what}`, error);
      throw new LedgerWriteError(
        `the FMP breaker ${what} could not be recorded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const gate: ProbeGate = {
    answered() {
      settled = true;
    },
    beforeRequest() {
      if (lost) throw lost;
      if (held !== null || settled) return;
      const id = randomUUID();
      append({ id, keys, t: "claim" }, "probe claim");
      held = id;
      const read = readBreaker(options.now(), state);
      if (!read.ok) {
        append({ id, t: "release" }, "probe release");
        held = null;
        throw new LedgerUnreadableError(`the FMP breaker log could not be re-read after a probe claim: ${read.unreadable}`);
      }
      const stillOpen = read.entries.filter((entry) => entry.open && keys.includes(entry.key));
      const taken = stillOpen.filter((entry) => entry.probeWinnerId !== id);
      if (taken.length > 0) {
        append({ id, t: "release" }, "probe release");
        held = null;
        const kind = [...taken].sort((a, b) => refusalSeverity(b.kind) - refusalSeverity(a.kind))[0].kind ?? "unclassified";
        lost = new ProbeLostError(
          kind,
          `fmpCircuitOpen: another consumer claimed the FMP breaker's probe for ` +
            `${taken.map((entry) => entry.key).join(", ")} first; standing down ` +
            `rather than probing twice. ${recoveryClause(taken[0].kind)}`,
        );
        throw lost;
      }
    },
    noAnswer() {
      if (held === null || settled) return;
      const id = held;
      held = null;
      append({ id, t: "release" }, "probe release");
    },
    wrapFetch: <F extends FetchLike>(f: F): F =>
      ((input: string | URL | Request, init?: RequestInit) => {
        gate.beforeRequest();
        return f(input, init).then(
          (response) => {
            gate.answered();
            return response;
          },
          (error: unknown) => {
            gate.noAnswer();
            throw error;
          },
        );
      }) as F,
  };
  return gate;
}
