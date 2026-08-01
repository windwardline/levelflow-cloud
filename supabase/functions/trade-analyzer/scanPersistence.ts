import { mapWithConcurrency } from "./concurrency.ts";

/**
 * What one write of a scanned setup did. The third value is the C2 guard —
 * a scan must never rewrite a symbol whose position is already live — and it
 * is reported rather than folded into "wrote it", because "nothing was written
 * and that was correct" and "nothing was written and that was a failure" are
 * the two states the scan path could not tell apart before this module
 * existed (spec §17m.2).
 */
export type ScanWriteOutcome = "inserted" | "updated" | "skipped_live_position";

/**
 * Every qualifying opportunity, accounted for exactly once:
 * `persisted + skipped + failed === attempted`, and `attempted` is the length
 * of the set the caller is about to show. That identity IS the contract — the
 * scan response carries these numbers so a persistence outage can never again
 * look like a successful scan (the owner's 2026-08-01 finding: results on the
 * rail, nothing in Insights, and no signal anywhere in between).
 */
export type ScanPersistenceReport = {
  attempted: number;
  failed: number;
  persisted: number;
  skipped: number;
};

export type ScanPersistenceInput<Context> = {
  concurrency?: number;
  /** Per-symbol write context, keyed by the opportunity's own symbol. */
  contexts: Map<string, Context>;
  /**
   * Called for every symbol that did not get written, with the reason. Wired
   * to analyzer telemetry by the caller: a swallowed console.error is
   * invisible to the product, to CI, and to the owner, which is exactly how
   * this went unnoticed through a live deploy run.
   */
  onFailure: (symbol: string, error: unknown) => Promise<void> | void;
  opportunities: Array<{ symbol: string }>;
  write: (context: Context) => Promise<{ outcome: ScanWriteOutcome }>;
};

const DEFAULT_CONCURRENCY = 4;

/**
 * Writes every qualifying scan opportunity, one write per opportunity.
 *
 * Deliberately never throws: a write failure must not blank the scan the user
 * is already looking at — this is the record of what was shown, not a gate on
 * showing it. What changed with spec §17m.2 is that the failure is now
 * *reported* in two directions (telemetry via onFailure, counts via the
 * returned report) instead of being logged into a void.
 *
 * A missing context counts as a failure, not a skip: the caller builds one
 * context per non-blocked market, so an opportunity without one means the two
 * collections disagree — precisely the divergence between "what the response
 * says qualified" and "what was written" that the contract exists to catch.
 */
export async function persistScannedOpportunities<Context>(
  {
    concurrency = DEFAULT_CONCURRENCY,
    contexts,
    onFailure,
    opportunities,
    write,
  }: ScanPersistenceInput<Context>,
): Promise<ScanPersistenceReport> {
  const report: ScanPersistenceReport = {
    attempted: opportunities.length,
    failed: 0,
    persisted: 0,
    skipped: 0,
  };

  await mapWithConcurrency(opportunities, concurrency, async (opportunity) => {
    const context = contexts.get(opportunity.symbol);
    if (!context) {
      report.failed += 1;
      await onFailure(
        opportunity.symbol,
        new Error("No persistence context was built for this scan candidate."),
      );
      return;
    }

    try {
      const { outcome } = await write(context);
      if (outcome === "skipped_live_position") {
        report.skipped += 1;
        return;
      }
      report.persisted += 1;
    } catch (error) {
      report.failed += 1;
      await onFailure(opportunity.symbol, error);
    }
  });

  return report;
}
