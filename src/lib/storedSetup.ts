import { getSecurityOption, type SupportedSymbol } from "./symbolMap";
import type { MarketScanCandidate, TradeSetupRow } from "./tradeAnalyzer";

/**
 * A stored setup, in the shape the Desk stage adopts.
 *
 * Owner ruling, 2026-08-02: "The whole point of the Current Trades section is to
 * serve as a reliable reference for the trades we generate, so we need to be
 * able to come back to the expanded detail view if we click on it — regardless
 * of if we click on it in the scan results or in the current trades."
 *
 * A reference restores what was STORED. Re-running the analyzer on a click could
 * hand back different levels for the card the reader is looking at, which is the
 * one thing a reference may not do — so this reads the row and nothing else, and
 * the only request a restore makes is the chart's own bars (the same fetch every
 * market selection already triggers). Zero analyzer claims.
 *
 * Its own module rather than a member of tradeAnalyzer.ts, whose import graph
 * reaches the Supabase client and so cannot be pulled into this repo's
 * jsdom-free, env-free unit-test harness; and not a member of the history
 * surfaces' own historyUtils.ts either, because the consumer is the stage — a
 * stage importing a history presenter to build its own input would misname the
 * dependency.
 */
export function storedSetupAsCandidate(
  setup: TradeSetupRow,
): MarketScanCandidate {
  const symbol = setup.symbol as SupportedSymbol;
  // take_profit_1 is genuinely absent on a non-laddered instrument, and
  // `Number(null) === 0` — a zero here would make AdvisorRecommendationPanel's
  // hasLadder check draw a "Target 1 · bank half" row at price 0. Undefined is
  // what the analyzer's own wire shape uses for "no first target", so the
  // restored setup says exactly what a freshly scanned one would.
  const takeProfit1 = asPrice(setup.take_profit_1);

  return {
    // Derived, not invented: getSecurityOption is where every other surface in
    // the app reads a market's class from.
    assetType: getSecurityOption(setup.symbol).assetType,
    // Only what the stage's adoption path actually reads (its symbol and its
    // setup) plus the class above. The scan row's own reporting — cost chip,
    // payoff, regime, rationale — belongs to a scan that has just run; it is not
    // a stored fact, and a restore states nothing it cannot read (§17f).
    setup: {
      breakevenTriggerPrice: Number(setup.breakeven_trigger_price),
      confidenceScore: Number(setup.confidence_score),
      // The receipt ("Why this setup") renders entirely from these two jsonb
      // columns, and the analyzer persists both verbatim
      // (trade-analyzer/index.ts). So a restored stage's five rows are the same
      // five a scan-adopted stage draws — not a reduced version of them.
      confluence: setup.confluence ?? {},
      correlationGroup: setup.correlation_group ?? "",
      entryPrice: Number(setup.limit_entry),
      orderType: "limit",
      riskModel: setup.risk_model ?? {},
      side: setup.side,
      stopLoss: Number(setup.stop_loss),
      symbol,
      takeProfit: Number(setup.take_profit),
      ...(takeProfit1 === null ? {} : { takeProfit1 }),
    },
    symbol,
  };
}

/**
 * When the stored setup's levels were computed, epoch milliseconds — the
 * stagehead's "Reviewed {time}" stamp (spec §16).
 *
 * A scan ROW click claims no review moment, for the reason AdvisorWorkspace's
 * AnalysisState docblock states: neither AnalyzerSetup nor MarketScanCandidate
 * carries a creation timestamp. A stored row does. `created_at` is the moment
 * the analyzer produced these prices, so a reader reopening a three-day-old
 * setup sees how old it is instead of seeing nothing.
 *
 * null for an unparseable timestamp — ConfidenceUnit then drops the half rather
 * than printing a placeholder where a real moment belongs.
 */
export function storedSetupReviewedAt(setup: TradeSetupRow): number | null {
  const createdAt = new Date(setup.created_at).getTime();
  return Number.isNaN(createdAt) ? null : createdAt;
}

function asPrice(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}
