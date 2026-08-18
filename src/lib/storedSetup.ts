import { reviewWindowHoursForSymbol } from "./advisorReview";
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
 * THE THREE GAPS a restored stage has against a scan-adopted one. Written here,
 * beside the code that would have to invent the missing datum, because this is
 * where a later reader edits:
 *
 * 1. **No "valid until" half on the stagehead's stamp.** trade_setups has no
 *    expires_at column at all, so there is no stored window to print. The half
 *    is absent rather than computed after the fact (§17f). The COPY GATE is
 *    the deliberate exception since 2026-08-09: `copyWindowEndsAt` below is
 *    derived from created_at + the symbol's own review window, consulted by
 *    the ladder's affordance gate and printed nowhere — §17f governs claims,
 *    §17c governs controls, and the two rules are compatible exactly here.
 * 2. **No dataProvider and no fmpSymbol.** Both are wire-only fields on
 *    AnalyzerSetup that no reader in src touches, so their absence is invisible.
 * 3. **The Size row degrades for a bridged pair.** collectBrokerQuotes (§19c)
 *    may read only the quotes the client already holds, and a restore holds
 *    exactly one: this setup's own latestClose. So a cross like GBPJPY under E8
 *    Pro Forex, whose sizing needs a USD leg, reads `Rate unavailable` where a
 *    stage adopted from an All-markets scan — which left those legs in hand —
 *    printed a real lot size. The degrade itself is §19c's own rule and stays;
 *    reaching for a rate to close the gap is what the boundary forbids.
 *
 * Everything else comes back whole, including all five "Why this setup" rows.
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
  // Every level through one coercion, so no price can reach the stage in a shape
  // another surface would refuse to print. The rail's own formatLevel and the
  // ledger's formatPriceValue both guard and render an em dash; the stage's
  // formatNumber does not guard at all, so an unreadable price passed through
  // here would print the literal "NaN" on the ladder beside the "—" the rail
  // drew for the same column.
  const breakevenTriggerPrice = asPrice(setup.breakeven_trigger_price);
  // The copy gate's window: created_at + the row's OWN review window when
  // the analyzer stamped one (risk_model.reviewWindowHours — E7's rule
  // that decision-time facts ride the row, read with the bridge's exact
  // validation; #362 review, finding 5), else the calibration mirror for
  // pre-E7 rows. Re-modelling from the mirror alone meant this gate and
  // the resolver could disagree the moment the calibration moved. Known
  // remaining gap (#362 round 2, finding 4 — pre-existing, named in the
  // divergence map's residue): the resolver also clamps every non-crypto
  // window to the weekly close (getSetupExpiryTime), and this gate does
  // not, so a Friday-afternoon forex setup stays copyable past the
  // cutoff the resolver expires it at. Closing that means mirroring the
  // NY-clock weekly-close rule client-side — its own considered change,
  // not a rider. Null when created_at is unparseable — the gate then
  // leaves the affordances live, exactly as a scan row without an
  // expiry does.
  const reviewedAtMs = storedSetupReviewedAt(setup);
  const rowReviewWindowHours = Number(setup.risk_model?.reviewWindowHours);
  const reviewWindowHours =
    Number.isFinite(rowReviewWindowHours) && rowReviewWindowHours > 0
      ? rowReviewWindowHours
      : reviewWindowHoursForSymbol(
        setup.symbol,
        getSecurityOption(setup.symbol).assetType,
      );
  const copyWindowEndsAt = reviewedAtMs === null ? null : new Date(
    reviewedAtMs + reviewWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const entryPrice = asPrice(setup.limit_entry);
  const stopLoss = asPrice(setup.stop_loss);
  const takeProfit = asPrice(setup.take_profit);
  // take_profit_1 is the one level genuinely absent on a non-laddered
  // instrument, and `Number(null) === 0` — a zero here would make
  // AdvisorRecommendationPanel's hasLadder check draw a "Target 1 · bank half"
  // row at price 0. Undefined is what the analyzer's own wire shape uses for "no
  // first target", so the restored setup says exactly what a freshly scanned one
  // would.
  const takeProfit1 = asPrice(setup.take_profit_1);

  // The four above are NOT NULL and `> 0` in the schema, so this is defensive:
  // only a change in how PostgREST represents numeric could deliver one
  // unreadable. If it ever does, the honest answer is that there is no setup to
  // restore — the market is still selected and the stage says it has no setup,
  // which is a state it already draws, rather than a ladder of NaN presented as
  // stored levels (§17f). The score is not in this set: it has its own floor
  // downstream (ConfidenceUnit's clampConfidencePercent), so it degrades to 0
  // rather than to a printed lie.
  const restorable = breakevenTriggerPrice !== null && entryPrice !== null &&
    stopLoss !== null && takeProfit !== null;

  return {
    // Derived, not invented: getSecurityOption is where every other surface in
    // the app reads a market's class from.
    assetType: getSecurityOption(setup.symbol).assetType,
    // Only what the stage's adoption path actually reads (its symbol and its
    // setup) plus the class above. The scan row's own reporting — cost chip,
    // payoff, regime, rationale — belongs to a scan that has just run; it is not
    // a stored fact, and a restore states nothing it cannot read (§17f).
    ...(restorable
      ? {
        setup: {
          breakevenTriggerPrice,
          ...(copyWindowEndsAt === null ? {} : { copyWindowEndsAt }),
          confidenceScore: Number(setup.confidence_score),
          // The receipt ("Why this setup") renders entirely from these two jsonb
          // columns, and the analyzer persists both verbatim
          // (trade-analyzer/index.ts). So a restored stage's five rows are the
          // same five a scan-adopted stage draws — not a reduced version of them.
          confluence: setup.confluence ?? {},
          correlationGroup: setup.correlation_group ?? "",
          entryPrice,
          orderType: "limit" as const,
          riskModel: setup.risk_model ?? {},
          side: setup.side,
          stopLoss,
          symbol,
          takeProfit,
          ...(takeProfit1 === null ? {} : { takeProfit1 }),
        },
      }
      : {}),
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
