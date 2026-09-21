/**
 * The Edge side of the FMP governor — one ledger, shared through the database.
 *
 * `scripts/fmpGovernor.ts` gave the local tooling a chokepoint: a shared
 * breaker and a byte ledger per UTC DAY rather than per process. The Edge
 * functions cannot read that file. They are ephemeral isolates, so the
 * analyzer, the chart feed and the calendar each spent against one allowance
 * with no idea what the others had used — the same shape as the in-memory
 * `candleCache` the bar store replaced, one layer up.
 *
 * THE PRIORITY ORDER IS THE POINT, not the ceiling. The owner's rule
 * (2026-08-31): background work does not touch the allowance unless the app
 * needs it, the bulk of each 30-day window stays UNUSED so the desk can scale
 * into it, and of what IS spent the bulk should be live users generating real
 * trades. A single total cannot say "background yields first". Two classes can.
 *
 * THE ONE CHOKEPOINT (2026-09-16). Until then `mayFetch` had no production
 * caller, so the ceilings were bookkeeping, and a parked desk still bought bytes
 * for any signed-in session. Now every Edge provider fetch requires an
 * `FmpSpendPermit`, and the only thing that mints one is `mayFetch`, once per
 * request. A permit is branded for the type-checker and registered at runtime,
 * so neither a cast nor an object of the right shape passes
 * `assertSpendPermit`, which every fetch site calls before it builds a URL.
 *
 * WHAT THIS IS NOT. It does not make a request cheaper — that is the bar
 * store's job, and the two are complementary: the store removes bytes nobody
 * needed to buy, and this refuses bytes nobody budgeted. Nor is it a rate
 * limit; `claim_analyzer_request` bounds requests per user per minute, while
 * this bounds BYTES per class per day. A caller can be inside its rate limit
 * and still be told the day is spent.
 *
 * WHAT IT BOUNDS, exactly. The ceiling stops the NEXT request, not the one in
 * flight, and bytes are recorded fire-and-forget after the response, so the
 * bound is the ceiling plus in-flight and unrecorded bytes. Whether every
 * un-awaited write completes after the isolate answers is unverified.
 */
import { DESK_PARKED } from "../_shared/deskParking.ts";
import { redactProviderSecrets } from "./redact.ts";

/**
 * The database calls this module needs, passed in rather than imported.
 *
 * The same split `barStore.ts` and `barStoreDb.ts` use, for the same reason:
 * `supabaseRest.ts` reaches for Deno globals, so a module importing it cannot
 * be type-checked or exercised by the test config at all. Keeping the decision
 * logic pure means every branch here is testable without a database, and the
 * boundary lives in one file next door.
 */
export type FmpBudgetDeps = {
  claim: (
    consumerClass: FmpConsumerClass,
    dailyLimitBytes: number,
  ) => Promise<
    Array<{
      allowed: boolean;
      limit_bytes: number | string;
      spent_today: number | string;
      trailing_30_bytes: number | string;
    }>
  >;
  record: (consumerClass: FmpConsumerClass, bytes: number) => Promise<void>;
};

/**
 * Who is spending, and therefore who yields first.
 *
 * `user` is a live operator waiting on an answer — a chart they opened, a scan
 * they asked for, an outcome refresh their Desk sent. `background` is scheduled
 * or automated work nobody is watching: outcome-sync's grading, the calendar
 * sync, a warm-up.
 */
export type FmpConsumerClass = "background" | "user";

/**
 * Daily ceilings, in bytes.
 *
 * DERIVED FROM THE PLAN, not chosen. The base subscription is 150 GB per
 * trailing 30 days, so 5 GB/day is the break-even burn — the rate at which the
 * allowance is exactly consumed and nothing is left for growth. The owner's
 * rule is that the BULK stays unused, so these ceilings sum to 1 GB/day: a
 * fifth of break-even, leaving roughly 80% of every 30-day window free for the
 * desk to scale into.
 *
 * The split is the rule itself. `user` gets 80% because that is where the
 * spending is supposed to be; `background` gets 20% and hits its wall first,
 * which is what "background yields" means when both are hungry.
 *
 * For scale: a full 97-market scan costs ~6 MB with the bar store warm, so the
 * user ceiling is ~130 full scans a day. A single operator cannot approach it,
 * and if one ever does, the number to revisit is the PLAN rather than this.
 */
export const FMP_DAILY_CEILINGS: Record<FmpConsumerClass, number> = {
  background: 200 * 1024 * 1024,
  user: 800 * 1024 * 1024,
};

/** Why a spend was refused. Carried on the wire as `fmpSpendRefused`. */
export type FmpSpendRefusal = "ceiling" | "ledger-unavailable" | "parked";

declare const spendPermitBrand: unique symbol;

/** Minted only by `mayFetch`; see `assertSpendPermit`. */
export type FmpSpendPermit = {
  readonly consumerClass: FmpConsumerClass;
  readonly [spendPermitBrand]: true;
};

export type FmpSpendDecision =
  | {
    allowed: true;
    limitBytes: number;
    permit: FmpSpendPermit;
    spentToday: number;
    trailing30: number;
  }
  | FmpSpendRefused;

export type FmpSpendRefused = {
  allowed: false;
  /**
   * What the ledger threw, redacted and bounded; null for every other refusal.
   * For the operator's log, never the client: `fmpSpendRefusalBody` omits it.
   */
  cause: string | null;
  consumerClass: FmpConsumerClass;
  limitBytes: number;
  reason: string;
  refusal: FmpSpendRefusal;
  spentToday: number | null;
  trailing30: number | null;
};

const minted = new WeakSet<object>();

export class FmpSpendPermitError extends Error {
  constructor() {
    super(
      "FMP spend attempted without a permit minted by mayFetch — nothing was fetched",
    );
    this.name = "FmpSpendPermitError";
  }
}

/**
 * The first statement of every fetch site, outside any try block.
 *
 * Throws before a byte is bought, and before a catch can turn the refusal into
 * a cached "unavailable" result (macroContext caches for fifteen minutes).
 */
export function assertSpendPermit(
  permit: unknown,
): asserts permit is FmpSpendPermit {
  if (typeof permit !== "object" || permit === null || !minted.has(permit)) {
    throw new FmpSpendPermitError();
  }
}

/**
 * May this class spend now?
 *
 * FAILS CLOSED, and it used to fail open. The old argument was that refusing
 * the desk because the ledger blinked takes the product down to protect a
 * budget, and it held only while nothing called this. A ledger that cannot
 * answer is now the only thing between a session and the allowance — the
 * position `claimMarketDataRequest` has always refused from — and the minute
 * bank's loss is permanent while an hour without charts is not.
 *
 * THE COST, stated rather than defaulted: a ledger outage turns off charts,
 * scans and grading until the ledger answers again.
 *
 * `parked` is passed in so the branch is testable; production passes
 * `DESK_PARKED` through `mayFetch`. It refuses class `user` only.
 */
export async function decideFmpSpend(
  deps: FmpBudgetDeps,
  consumerClass: FmpConsumerClass,
  parked: boolean,
): Promise<FmpSpendDecision> {
  const limitBytes = FMP_DAILY_CEILINGS[consumerClass];
  if (parked && consumerClass === "user") {
    return {
      allowed: false,
      cause: null,
      consumerClass,
      limitBytes,
      reason:
        "the desk is parked (DESK_PARKED): user-class provider spend is refused before any byte is bought",
      refusal: "parked",
      spentToday: null,
      trailing30: null,
    };
  }

  let row: Awaited<ReturnType<FmpBudgetDeps["claim"]>>[number] | undefined;
  try {
    const rows = await deps.claim(consumerClass, limitBytes);
    row = Array.isArray(rows) ? rows[0] : undefined;
  } catch (error) {
    // Kept, because failing closed made it matter: an outage turns the desk
    // off, and the fixed sentence cannot say whether the ledger answered 401,
    // lost its function or never answered. adminRpcRows throws the response
    // text and a transport error can carry a URL, so it is redacted here.
    const cause = redactProviderSecrets(
      error instanceof Error ? error.message : String(error),
    ).slice(0, 400);
    return ledgerUnavailable(
      consumerClass,
      limitBytes,
      "the FMP ledger could not be read; spending is refused until it answers",
      cause,
    );
  }
  if (!row) {
    return ledgerUnavailable(
      consumerClass,
      limitBytes,
      "the FMP ledger returned no row; spending is refused until it answers",
      null,
    );
  }

  const spentToday = Number(row.spent_today) || 0;
  const trailing30 = Number(row.trailing_30_bytes) || 0;
  const ceiling = Number(row.limit_bytes) || limitBytes;
  // Strictly the boolean the RPC declares. A truthy string is not a yes.
  if (row.allowed === true) {
    const permit = Object.freeze({ consumerClass }) as FmpSpendPermit;
    minted.add(permit);
    return { allowed: true, limitBytes: ceiling, permit, spentToday, trailing30 };
  }
  return {
    allowed: false,
    cause: null,
    consumerClass,
    limitBytes: ceiling,
    reason: `${consumerClass} has spent its day: ` +
      `${(spentToday / 1e6).toFixed(1)} MB of ` +
      `${(limitBytes / 1e6).toFixed(1)} MB. Trailing 30 days across all ` +
      `classes: ${(trailing30 / 1e9).toFixed(2)} GB.`,
    refusal: "ceiling",
    spentToday,
    trailing30,
  };
}

/** Both ledger-outage refusals, each logged once with what is known of why. */
function ledgerUnavailable(
  consumerClass: FmpConsumerClass,
  limitBytes: number,
  reason: string,
  cause: string | null,
): FmpSpendRefused {
  console.error("FMP ledger unavailable; provider spend refused", consumerClass, reason, cause ?? "");
  return {
    allowed: false,
    cause,
    consumerClass,
    limitBytes,
    reason,
    refusal: "ledger-unavailable",
    spentToday: null,
    trailing30: null,
  };
}

/** The one production decision: once per request, at the first point that needs the provider. */
export function mayFetch(
  deps: FmpBudgetDeps,
  consumerClass: FmpConsumerClass,
): Promise<FmpSpendDecision> {
  return decideFmpSpend(deps, consumerClass, DESK_PARKED);
}

/**
 * The §21f refusal body: which refusal, the class, and that class's own day.
 *
 * Sent with HTTP 503 by every Edge path, so a refusal can never read as the
 * rate limit's 429. supabase-js hides a non-2xx body from `data`, and nothing in
 * src/ reads `error.context`, so `error` here is a diagnostic, not reader copy.
 *
 * It carries NO account-wide figure. `trailing30` sums both classes over thirty
 * days, and `fmp_usage` is readable by no client role; a signed-in caller who
 * fetches the function URL reads this body, so the body must not restate what
 * the table's revoke withholds. The full reason, trailing figure included, is
 * what the callers log server-side (console and `analyzer_events`, both closed
 * to clients).
 */
export function fmpSpendRefusalBody(refused: FmpSpendRefused) {
  return {
    consumerClass: refused.consumerClass,
    error: refused.refusal === "ceiling" && refused.spentToday !== null
      ? `${refused.consumerClass} has spent its day: ` +
        `${(refused.spentToday / 1e6).toFixed(1)} MB of ` +
        `${(refused.limitBytes / 1e6).toFixed(1)} MB.`
      : refused.reason,
    fmpSpendRefused: refused.refusal,
    limitBytes: refused.limitBytes,
    spentToday: refused.spentToday,
  };
}

/**
 * Credit bytes already served, to the class the permit was minted for.
 *
 * Never throws. These bytes were spent before they could be counted, and a
 * failure to RECORD must not also fail the request that already paid for
 * them — that would turn one accounting outage into a user-visible error on a
 * response the desk already holds.
 */
export async function recordFetch(
  deps: FmpBudgetDeps,
  permit: FmpSpendPermit,
  bytes: number,
): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  try {
    await deps.record(permit.consumerClass, Math.round(bytes));
  } catch {
    // Swallowed on purpose, and it is the one swallow in this file. The
    // alternative is failing a request whose data is already in hand.
  }
}

/** Measure a response body once, for both the caller and the ledger. */
export async function readAndRecord(
  deps: FmpBudgetDeps,
  response: { text: () => Promise<string> },
  permit: FmpSpendPermit,
): Promise<string> {
  const body = await response.text();
  await recordFetch(deps, permit, new TextEncoder().encode(body).length);
  return body;
}
