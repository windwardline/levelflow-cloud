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
 * WHAT THIS IS NOT. It does not make a request cheaper — that is the bar
 * store's job, and the two are complementary: the store removes bytes nobody
 * needed to buy, and this refuses bytes nobody budgeted. Nor is it a rate
 * limit; `claim_analyzer_request` bounds requests per user per minute, while
 * this bounds BYTES per class per day. A caller can be inside its rate limit
 * and still be told the day is spent.
 */

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
 * they asked for. `background` is scheduled or automated work nobody is
 * watching: outcome resolution, the calendar sync, a warm-up.
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

export type FmpBudgetDecision = {
  allowed: boolean;
  limitBytes: number;
  reason: string | null;
  spentToday: number;
  trailing30: number;
};

/**
 * May this class spend today?
 *
 * FAILS OPEN, and the asymmetry against `claimMarketDataRequest` is deliberate.
 * That one guards an unbounded per-request path where a meter that cannot
 * answer is all that stands between one browser tab and the allowance — so it
 * refuses. This one is a DAILY aggregate on paths that are already bounded per
 * request, and refusing the whole desk because the ledger is briefly
 * unreachable would take the product down to protect a budget. A missed day of
 * accounting is recoverable; a desk that cannot answer is the failure the
 * budget exists to prevent.
 *
 * The choice is stated rather than defaulted, because the two directions look
 * identical in a diff and only one of them is right for a given guard.
 */
export async function mayFetch(
  deps: FmpBudgetDeps,
  consumerClass: FmpConsumerClass,
): Promise<FmpBudgetDecision> {
  const limitBytes = FMP_DAILY_CEILINGS[consumerClass];
  try {
    const rows = await deps.claim(consumerClass, limitBytes);
    const row = rows[0];
    if (!row) {
      return {
        allowed: true,
        limitBytes,
        reason: "the FMP ledger returned no row; spending was not accounted",
        spentToday: 0,
        trailing30: 0,
      };
    }
    const spentToday = Number(row.spent_today) || 0;
    const trailing30 = Number(row.trailing_30_bytes) || 0;
    return {
      allowed: Boolean(row.allowed),
      limitBytes: Number(row.limit_bytes) || limitBytes,
      reason: row.allowed ? null : `${consumerClass} has spent its day: ` +
        `${(spentToday / 1e6).toFixed(1)} MB of ` +
        `${(limitBytes / 1e6).toFixed(1)} MB. Trailing 30 days across all ` +
        `classes: ${(trailing30 / 1e9).toFixed(2)} GB.`,
      spentToday,
      trailing30,
    };
  } catch {
    return {
      allowed: true,
      limitBytes,
      reason: "the FMP ledger could not be read; spending was not accounted",
      spentToday: 0,
      trailing30: 0,
    };
  }
}

/**
 * Credit bytes already served.
 *
 * Never throws. These bytes were spent before they could be counted, and a
 * failure to RECORD must not also fail the request that already paid for
 * them — that would turn one accounting outage into a user-visible error on a
 * response the desk already holds.
 */
export async function recordFetch(
  deps: FmpBudgetDeps,
  consumerClass: FmpConsumerClass,
  bytes: number,
): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  try {
    await deps.record(consumerClass, Math.round(bytes));
  } catch {
    // Swallowed on purpose, and it is the one swallow in this file. The
    // alternative is failing a request whose data is already in hand.
  }
}

/** Measure a response body once, for both the caller and the ledger. */
export async function readAndRecord(
  deps: FmpBudgetDeps,
  response: { text: () => Promise<string> },
  consumerClass: FmpConsumerClass,
): Promise<string> {
  const body = await response.text();
  await recordFetch(deps, consumerClass, new TextEncoder().encode(body).length);
  return body;
}
