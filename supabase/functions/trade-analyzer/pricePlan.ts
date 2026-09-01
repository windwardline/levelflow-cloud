import type { CategoryCalibration } from "./calibration.ts";
import { getAssetType } from "./calibration.ts";
import {
  estimateExecutionQuality,
  type ExecutionQuality,
} from "./executionQuality.ts";
import {
  applyFuturesTickRules,
  type FuturesContractSpec,
  needsFuturesTickGrid,
} from "./futures.ts";
import {
  averageTrueRange,
  findSwingPivots,
  nearestLevelBeyond,
} from "./indicators.ts";
import type { MarketContext, Regime, Side, SupportedSymbol } from "./types.ts";

// Which anchor set the stop: the pivot-buffered structural level, the
// 1.25-ATR minimum width (also covers the no-pivot buffer fallback), or the
// class volatility cap clipping the structural stop nearer.
/**
 * Why `buildPricePlan` declined, at the grain of the branch that fired.
 *
 * R2b's field list, and its only entry. Thirteen `return null` paths reached
 * the sweep as the single string `planRejected`, and a refused decision emits
 * NO outcome row — so the rejection ledger's `{reason, time}` was the entire
 * record of a decision the engine declined, with one word for thirteen causes.
 *
 * The price of that is measured twice. Livestock's ladder refused 396 of the
 * 416 decisions that reached its geometry — 5% survival against a healthy
 * 73-99% — and indices refused 63%, where a 96-variant grid across four axes
 * moved survival 37% to 38% and named the incumbent as its own best
 * combination, while the real cause was the one axis held fixed. Correcting it
 * took survival to 96% and out-of-sample R from +7.4 to +19.2.
 * `docs/trade-model.md`: "planRejected — a counter that names no lever, which
 * is why four grids walked past it."
 *
 * The counter struct is unchanged: `rejections.planRejected` stays the
 * aggregate every existing reader counts. This rides the LEDGER, which already
 * carries a free-form reason per decision.
 */
export type PlanRefusalReason =
  /** The limit sits at or inside the current print — not a limit at all. */
  | "entry_too_close"
  /** Live only: a buy at/above the ask, or a sell at/below the bid. */
  | "quote_crossed"
  /** The stop landed on the wrong side of the entry. */
  | "stop_crossed_entry"
  /** The window cannot carry the payoff floor — the feasibility refusal. */
  | "window_cannot_carry_payoff"
  /** TP1 collapsed to zero or negative distance. */
  | "tp1_not_positive"
  /** The runner target sits at or inside TP1. */
  | "runner_inside_tp1"
  /** A tick-gridded symbol with no contract spec to align against. */
  | "no_contract_spec"
  /** After alignment, the runner target crossed the entry. */
  | "runner_crossed_entry"
  /** After alignment, TP1 crossed the entry. */
  | "tp1_crossed_entry"
  /** Non-finite reward:risk, or a risk distance of zero. */
  | "non_finite_geometry";

export type PlanRefusal = { reason?: PlanRefusalReason };

export type StopProvenance = "pivot" | "volatility_floor" | "cap";

// Which anchor set the RUNNER: a real structural level inside the reachable
// band, or the band's own ceiling when no level qualified. The second case is a
// pure formula with no structure in it, and until now nothing recorded which one
// happened — so "the runner is the nearest structural level the window can
// reach" was an unmeasured claim about most of the corpus.
export type RunnerProvenance = "structural_level" | "window_ceiling";

// Which of TP1's three candidates won. It is min(max(riskShare, atrFloor),
// windowCap), so exactly one of the three binds: the risk-proportional share,
// the ATR floor lifting a too-small partial, or the window cap pulling an
// unreachable one back. Tuning tp1RiskShare is pointless on a market where the
// ATR floor or the window cap is what actually places TP1.
export type Tp1Provenance = "risk_share" | "atr_floor" | "window_cap";

// Which entry offset applied. Trend and non-trend regimes carry different
// offsets in every class, and nothing recorded which one a setup used.
export type EntryProvenance = "trend_offset" | "default_offset";

export type PricePlan = {
  atr: number;
  // R2b's field list (2026-08-23). All three are ALREADY computed here and were
  // simply not exposed, and all three are additive — nothing reads them to make
  // a decision, so live behaviour is unchanged and ANALYZER_VERSION does not
  // move. They exist because the corpus carried no price level at all: emit
  // `latestClose` and the plan reconstructs. Five fields doing the work of
  // twelve, on a corpus where per-row width is the cost.
  //
  // THE ORDER MATTERS, and an earlier draft of this comment gave the wrong
  // one. Tick alignment is LAST, not second. Read this function: entry offset,
  // stop buffer, structural and cap stops, the ladder — every one of them
  // computed from the UNALIGNED entry — and only then does
  // `applyFuturesTickRules` rewrite entry, stop, both targets and
  // riskDistance together. A reconstruction that snapped the entry to the grid
  // first would derive its stop from the aligned entry and land on a different
  // number, on the 27 futures-shaped markets where the grid applies at all.
  //
  // What reconstructs exactly, on all 97: the unaligned entry from
  // `latestClose ∓ atr × entryOffset` with `entryProvenance` naming the
  // offset; the aligned entry, stop and runner from the tick rules, then
  // `riskDistance` and `grossRewardRisk × riskDistance`; `expectedWindowMove`
  // from `dailyAtr`; and spread, slippage and commission, which are pure
  // functions of (symbol, latestClose, atr, tickSize) over tables the
  // manifest's analyzerVersion pins.
  //
  // TP1 UNDER `risk_share` ON A GRID MARKET reconstructs too, and closing it
  // took no new field. The ladder consumes the riskDistance from BEFORE
  // alignment while only the after value is emitted, so the recovery runs
  // backwards through the pivot: `stopPivotDistance` is measured against the
  // PLANNED entry, which gives back `nearestStopPivot`, and from it the
  // pre-alignment stop and the riskDistance the ladder actually used.
  //
  // That only works because the anchor was corrected. Until 2026-08-30 this
  // field was measured against the ALIGNED entry — a level the stop logic
  // never saw — so it meant one thing on the 70 grid-free markets and another
  // on the 27, and the gap was read as needing a ninth emit field. Emitting
  // the planned riskDistance would have fixed TP1, spent a permanent column
  // on the one corpus R3 gets to write, and left the wrong anchor in place.
  // `tests/pricePlan.test.ts` proves it by execution: the emitted distance
  // lands exactly on the pivot the stop chain selected, and the recovered
  // planned entry and stop, pushed back through production's own tick rules,
  // reproduce the plan's entry, stop and TP1 bit-for-bit on a grid market.
  // Both die when the anchor moves — which an earlier version of this comment
  // claimed of a pair where only one did.
  //
  // `dailyAtr` is the second stop lever — stopBuffer is the MAX of two
  // calibration levers and nothing recorded which one bound, which is the
  // defect stopProvenance itself was created to end, one choice point over.
  //
  // `stopPivotDistance` separates "a pivot was chosen" from "a pivot existed
  // and lost to the cap" — on 26 of the 97 markets the cap binds on every
  // setup by arithmetic, so the provenance alone cannot say whether structure
  // was there.
  dailyAtr: number;
  latestClose: number;
  /** R2b question 3: nearest structure in the trade's direction, unfloored. */
  nearestStructureDistance: number | null;
  runnerNearestBeyondMinimum: number | null;
  stopPivotDistance: number | null;
  contractSpec: FuturesContractSpec | null;
  entryPrice: number;
  executionQuality: ExecutionQuality;
  expectedWindowMove: number;
  futuresTickAdjustments: string[];
  grossRewardRisk: number;
  /** What the ladder pays on a full win; null when there is no TP1 leg. */
  ladderRewardRisk: number | null;
  rewardRisk: number;
  stopLogic: string;
  stopLoss: number;
  stopProvenance: StopProvenance;
  runnerProvenance: RunnerProvenance;
  tp1Provenance: Tp1Provenance;
  entryProvenance: EntryProvenance;
  targetLogic: string;
  takeProfit: number;
  takeProfit1: number;
};

// One sentence per provenance, so the description cannot outlive the mechanism.
// If a future geometry lets the pivot bind again, the copy follows without
// anyone remembering to change it.
const STOP_LOGIC_BY_PROVENANCE: Record<StopProvenance, string> = {
  cap:
    "Invalidation at the review window's volatility ceiling — the furthest stop this window can defend.",
  pivot:
    "Invalidation beyond the nearest confirmed swing pivot, with a volatility buffer.",
  volatility_floor:
    "Invalidation at the minimum volatility width, no confirmed swing pivot sitting nearer.",
};

// 1o's residue, repaired the way stopLogic was: targetLogic asserted "the
// runner is the nearest structural level" unconditionally while
// runnerProvenance two lines away recorded window_ceiling for most of the
// corpus, and called TP1 "a risk-scaled partial" on setups where the ATR
// floor or the window cap is what actually placed it. Two halves, one
// sentence each per provenance, joined at the return — the description
// cannot outlive the mechanism.
const TP1_LOGIC_BY_PROVENANCE: Record<Tp1Provenance, string> = {
  atr_floor:
    "TP1 banks at the minimum volatility width — the risk-scaled partial sat nearer than one volatility unit.",
  risk_share:
    "TP1 banks a risk-scaled partial.",
  window_cap:
    "TP1 is pulled back to what the review window can statistically reach.",
};

const RUNNER_LOGIC_BY_PROVENANCE: Record<RunnerProvenance, string> = {
  structural_level:
    "The runner sits on a confirmed structural level inside the window's reach.",
  window_ceiling:
    "The runner sits at the window's statistical ceiling — no structural level qualified nearer.",
};

export function buildPricePlan(
  side: Side,
  symbol: SupportedSymbol,
  market: MarketContext,
  regime: Regime,
  calibration: CategoryCalibration,
  // Out-channel naming WHICH refusal fired (R2b, 2026-08-31). It began as the
  // single non-geometry cause (#362 round 5, finding 1): 1b's rule — a distinct
  // cause must not wear "no valid limit entry" — applied to the quote gate, and
  // the caller that narrates refusals needed that one distinction.
  //
  // It now carries all thirteen. The sweep called this function without the
  // channel at all, so every branch reached the corpus as `planRejected` and
  // the ledger could say a market was starved but never by which gate.
  refusal?: PlanRefusal,
): PricePlan | null {
  const bars = market.primary;
  const daily = market.daily;
  const latest = bars.at(-1)!;
  // E3 (#362 review, finding 1): ONE anchor. The viability gate below
  // used to read market.latest — a fresher print than the bar the entry
  // offset came from — which made the gate a live-only, direction-biased
  // filter the corpus never had: in the sweep the decision bar IS the
  // latest bar, so the gate compares an offset against its own base and
  // fires only on degenerate offsets. Every price here now derives from
  // the same completed decision bar; the loader guarantees market.latest
  // and bars.at(-1) agree, and this function no longer depends on that.
  const currentClose = latest.close;
  const atr = averageTrueRange(bars, 14);
  const dailyAtr = averageTrueRange(daily, 14);
  // AXES-3, expressible since 2026-09-01. The literals stay the defaults, so
  // every shipped cell produces the pivots it always did; only a grid variant
  // moves them. Pivot depth is upstream of the stop's chosen level, the
  // runner's structural target and `nearestStructureDistance` alike.
  const pivots = findSwingPivots(bars, calibration.pivotStrengthIntraday ?? 3);
  const dailyPivots = findSwingPivots(
    daily,
    calibration.pivotStrengthDaily ?? 2,
  );
  // Recorded, not just applied: trend and non-trend regimes carry different
  // entry offsets in every class, and until now nothing said which one a setup
  // used — so an entry-offset grid could not tell which half of the corpus it
  // was even moving.
  const usesTrendOffset = regime.name === "trend";
  const entryProvenance: EntryProvenance = usesTrendOffset
    ? "trend_offset"
    : "default_offset";
  const entryOffset = atr *
    (usesTrendOffset
      ? calibration.entryOffsetTrend
      : calibration.entryOffsetDefault);
  let entryPrice = side === "buy"
    ? latest.close - entryOffset
    : latest.close + entryOffset;
  const stopBuffer = Math.max(
    atr * calibration.stopAtrMultiplier,
    dailyAtr * calibration.dailyStopAtrMultiplier,
  );
  // The entry EVERY level below is derived from, held because `entryPrice`
  // is reassigned to the aligned value at the tick step and the emitted
  // `stopPivotDistance` was being measured against that — a different anchor
  // from the one the pivot was selected against, three lines down. See the
  // field's own note at the emit site.
  const plannedEntry = entryPrice;
  // WHICH ARRAYS THE STOP MAY SEE — a grid axis, defaulting to what has always
  // shipped. The ladder below reads all four pivot arrays; this search reads
  // the intraday pair unless a variant says otherwise. R2b question 4 measured
  // the difference (32.0% of decisions move on the 71 markets that can be
  // structure-stopped); R3 prices it. Nothing sets this in a shipped cell, so
  // `intraday` is the only value production ever takes.
  const stopStructure = side === "buy"
    ? (calibration.stopStructureSource === "intraday_and_daily"
      ? [...pivots.lows, ...dailyPivots.lows]
      : pivots.lows)
    : (calibration.stopStructureSource === "intraday_and_daily"
      ? [...pivots.highs, ...dailyPivots.highs]
      : pivots.highs);
  const nearestStopPivot = nearestLevelBeyond(
    side === "buy" ? "sell" : "buy",
    entryPrice,
    stopStructure,
  );
  // Structure may pull the stop nearer than the volatility ceiling, never
  // beyond it: a stop the review window cannot defend is a swing-trade stop
  // on an intraday setup (production: 5-10 ATR stops, 50% expired open).
  const maxStopDistance = atr * calibration.maxStopAtrMultiplier;
  // Structural candidate before the cap: the farther of the pivot-buffered
  // stop (entry-buffered when no pivot exists) and the 1.25-ATR minimum
  // width. Recording which anchor survives the cap is the r14 instrumentation
  // — at tight caps the ladder must prove, not assume, it is still
  // structure-stopped.
  const pivotBufferedStop = nearestStopPivot === null ? null : (side === "buy"
    ? nearestStopPivot - stopBuffer
    : nearestStopPivot + stopBuffer);
  const structuralStop = side === "buy"
    ? Math.min(
      pivotBufferedStop ?? entryPrice - stopBuffer,
      entryPrice - atr * 1.25,
    )
    : Math.max(
      pivotBufferedStop ?? entryPrice + stopBuffer,
      entryPrice + atr * 1.25,
    );
  const capStop = side === "buy"
    ? entryPrice - maxStopDistance
    : entryPrice + maxStopDistance;
  const capBinds = side === "buy"
    ? structuralStop < capStop
    : structuralStop > capStop;
  const stopProvenance: StopProvenance = capBinds
    ? "cap"
    : pivotBufferedStop !== null && structuralStop === pivotBufferedStop
    ? "pivot"
    : "volatility_floor";
  let stopLoss = side === "buy"
    ? Math.max(structuralStop, capStop)
    : Math.min(structuralStop, capStop);
  let riskDistance = Math.abs(entryPrice - stopLoss);
  const minimumLimitDistance = Math.max(
    atr * 0.05,
    Math.abs(currentClose) * 0.00005,
    0.00001,
  );

  if (
    side === "buy" &&
    roundPrice(entryPrice) >= roundPrice(currentClose - minimumLimitDistance)
  ) {
    if (refusal) refusal.reason = "entry_too_close";
    return null;
  }

  if (
    side === "sell" &&
    roundPrice(entryPrice) <= roundPrice(currentClose + minimumLimitDistance)
  ) {
    if (refusal) refusal.reason = "entry_too_close";
    return null;
  }

  // #362 round 4, finding 1 — the admission half of E3's clock. The
  // anchor is deliberately a completed bar, so between its close and
  // this instant the market kept moving. In the corpus anchor latency is
  // zero by construction (the sweep's decision instant IS its anchor
  // bar), so the corpus contains no plan whose limit the market had
  // already crossed at creation; live, nothing else would refuse one —
  // a buy limit at/above the ask (or a sell at/below the bid) is a
  // market order wearing a limit costume, an out-of-population shape.
  // The quote NEVER enters a derived price: construction stays
  // single-anchor, and with no quote (fetch failure; every sweep
  // context) admission is unchanged — the residual anchor-latency
  // smear is named in the divergence map.
  if (market.quote) {
    if (
      side === "buy" &&
      roundPrice(entryPrice) >= roundPrice(market.quote.ask)
    ) {
      if (refusal) {
        refusal.reason = "quote_crossed";
      }
      return null;
    }
    if (
      side === "sell" &&
      roundPrice(entryPrice) <= roundPrice(market.quote.bid)
    ) {
      if (refusal) {
        refusal.reason = "quote_crossed";
      }
      return null;
    }
  }

  if (side === "buy" && roundPrice(stopLoss) >= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "stop_crossed_entry";
    return null;
  }

  if (side === "sell" && roundPrice(stopLoss) <= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "stop_crossed_entry";
    return null;
  }

  const ladder = buildLadderTargets({
    atr,
    calibration,
    dailyAtr,
    entryPrice,
    pivotLevels: [
      ...pivots.highs,
      ...pivots.lows,
      ...dailyPivots.highs,
      ...dailyPivots.lows,
    ],
    riskDistance,
    side,
  }, refusal);

  if (!ladder) {
    // The ladder stamped its OWN cause — window feasibility, a collapsed TP1,
    // or a runner inside TP1 — which is three of the thirteen and the group
    // whose remedies are the furthest apart.
    return null;
  }

  let takeProfit = ladder.runnerTarget;
  let takeProfit1 = ladder.takeProfit1;

  const assetType = getAssetType(symbol);
  // 1b: every futures-shaped class, not `=== "futures"` alone — agriculture
  // and livestock trade on the same exchange grids, and the narrower gate
  // meant alignment was never even attempted for them.
  const needsTickGrid = needsFuturesTickGrid(symbol);
  const futuresTickPlan = needsTickGrid
    ? applyFuturesTickRules({
      entryPrice,
      side,
      stopLoss,
      symbol,
      takeProfit,
      takeProfit1,
    })
    : null;

  // 1b's belt: the analysis door refuses a spec-less futures-shaped market
  // with its own reason before any of this runs; if a future call path skips
  // the door, no off-grid plan ships from here either.
  if (needsTickGrid && !futuresTickPlan) {
    if (refusal) refusal.reason = "no_contract_spec";
    return null;
  }

  if (futuresTickPlan) {
    entryPrice = futuresTickPlan.entryPrice;
    stopLoss = futuresTickPlan.stopLoss;
    takeProfit = futuresTickPlan.takeProfit;
    riskDistance = Math.abs(entryPrice - stopLoss);
    // Clamp AFTER alignment, and take the aligned TP1 as the input. The clamp
    // moves a level only when the aligned entry or target has crossed it, and
    // clampBetween returns one of its own bounds — both already on the grid.
    takeProfit1 = clampBetween(
      futuresTickPlan.takeProfit1 ?? takeProfit1,
      entryPrice,
      takeProfit,
    );
  }

  if (side === "buy" && roundPrice(takeProfit) <= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "runner_crossed_entry";
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit) >= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "runner_crossed_entry";
    return null;
  }

  if (side === "buy" && roundPrice(takeProfit1) <= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "tp1_crossed_entry";
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit1) >= roundPrice(entryPrice)) {
    if (refusal) refusal.reason = "tp1_crossed_entry";
    return null;
  }

  const rewardRisk = Math.abs(takeProfit - entryPrice) /
    Math.max(riskDistance, 0.00001);
  if (!Number.isFinite(rewardRisk) || riskDistance <= 0) {
    if (refusal) refusal.reason = "non_finite_geometry";
    return null;
  }
  const executionQuality = estimateExecutionQuality({
    assetType,
    atr,
    availableTimeframes: market.availableTimeframes,
    dailyAtr,
    entryPrice,
    latestClose: currentClose,
    providerWarnings: market.providerWarnings,
    quotedSpread: market.quote?.spread ?? null,
    side,
    stopLoss,
    symbol,
    takeProfit,
    tickSize: futuresTickPlan?.contractSpec.tickSize ?? null,
  });

  return {
    atr,
    contractSpec: futuresTickPlan?.contractSpec ?? null,
    dailyAtr,
    entryPrice,
    latestClose: currentClose,
    nearestStructureDistance: ladder.nearestStructureDistance,
    runnerNearestBeyondMinimum: ladder.runnerNearestBeyondMinimum,
    // MEASURED AGAINST THE PLANNED ENTRY, not the aligned one.
    //
    // The pivot is selected against the unaligned entry and consumed against
    // it — `pivotBufferedStop`, `structuralStop` and the whole stop chain run
    // before `applyFuturesTickRules` touches anything. This field was measured
    // after, against an `entryPrice` the tick step had already rewritten, so
    // on the 27 futures-shaped markets it reported a distance from a level the
    // stop logic never used. The same field meant one thing on 70 markets and
    // another on 27, which is the defect this repo keeps finding under a
    // different name: a rule correct for the population it was derived on,
    // applied to one it was not, with nothing to notice.
    //
    // It also closes R2b's one open reconstruction gap. With the right anchor
    // the pivot recovers as `plannedEntry ∓ stopPivotDistance` (the sign is
    // fixed by `side` — `nearestLevelBeyond` searches below a buy and above a
    // sell, so `Math.abs` discards nothing), and from it the pre-alignment
    // stop and `riskDistance` — which is what TP1 was built from under
    // `risk_share`. The proposed ninth emit field would have fixed TP1 only,
    // spent a permanent column on the one corpus R3 gets to write, and left
    // this wrong.
    stopPivotDistance: nearestStopPivot === null
      ? null
      : Math.abs(nearestStopPivot - plannedEntry),
    executionQuality,
    expectedWindowMove: ladder.expectedWindowMove,
    futuresTickAdjustments: futuresTickPlan?.adjustments ?? [],
    grossRewardRisk: rewardRisk,
    /**
     * What the LADDER pays on a full win, which is not what the runner target
     * pays.
     *
     * `rewardRisk` is the runner target's ratio on a FULL-SIZE basis. Half the
     * position leaves at TP1, so a setup gated at 1.6x and reported as 1.6x
     * actually realises `0.5 * tp1 + 0.5 * target` — about 1.0R against a
     * -1.00R stop. The surface printed the first number under the words
     * "payoff after costs" and the operator read a larger edge than the
     * ladder can deliver.
     *
     * Amendment 39: profit potential must exceed loss potential STRUCTURALLY,
     * and may never be manufactured. The geometry is not touched here — the
     * target still comes from real structure and window feasibility. What
     * changes is that the number shown is the one the ladder pays.
     *
     * The round trip is charged ONCE against the blended reward, exactly as
     * effectiveRewardRisk charges it once against the target: entry at full
     * size plus two half-size exits is one round trip of size, and the venue
     * bills per lot (venueCosts.ts), not per ticket.
     *
     * Null when there is no TP1 leg — a full-size runner IS `rewardRisk`, and
     * repeating it under a second name would invite the two to drift.
     */
    ladderRewardRisk: takeProfit1 === null ? null : roundPrice(
      (0.5 * Math.abs(takeProfit1 - entryPrice) +
        0.5 * Math.abs(takeProfit - entryPrice) -
        executionQuality.estimatedRoundTripCost) /
        Math.max(riskDistance, 0.00001),
    ),
    rewardRisk: executionQuality.effectiveRewardRisk,
    // Derived from what actually happened, never asserted. The constant this
    // replaces said "Invalidation beyond the nearest confirmed swing pivot with
    // a volatility buffer" on EVERY setup. It is not: structuralStop is floored
    // at 1.25 ATR while the cap is maxStopAtrMultiplier x ATR, so wherever the
    // cap sits at or below 1.25 the cap binds by arithmetic and the pivot
    // cannot win. The sentence was false wherever that held, and stopProvenance
    // was sitting two lines away recording the truth.
    //
    // The old note said "1.0 everywhere except metals", which was a
    // class-level reading that the per-market cells have since overtaken.
    // Measured 2026-08-25 over the scan roster: 26 markets at 1.0, 6 at 2.5,
    // 65 at 4.0 — the cap binds by arithmetic on 26, and 71 carry both levers.
    stopLogic: STOP_LOGIC_BY_PROVENANCE[stopProvenance],
    stopLoss,
    stopProvenance,
    runnerProvenance: ladder.runnerProvenance,
    tp1Provenance: ladder.tp1Provenance,
    entryProvenance,
    targetLogic: `${TP1_LOGIC_BY_PROVENANCE[ladder.tp1Provenance]} ${
      RUNNER_LOGIC_BY_PROVENANCE[ladder.runnerProvenance]
    }`,
    takeProfit,
    takeProfit1,
  };
}

function clampBetween(value: number, boundA: number, boundB: number) {
  const lower = Math.min(boundA, boundB);
  const upper = Math.max(boundA, boundB);
  return Math.min(Math.max(value, lower), upper);
}

export type LadderCalibration = {
  defaultReviewHours: number;
  // Required, mirroring CategoryCalibration: every class row now states it,
  // so a caller that cannot supply one is a caller holding an incomplete
  // calibration — which the type should say out loud rather than paper over.
  sizingHoursFactor: number;
  minimumTargetRewardRisk: number;
  runnerWindowShare: number;
  tp1AtrMultiplier: number;
  tp1RiskShare: number;
};

export type LadderTargets = {
  expectedWindowMove: number;
  /**
   * Distance to the nearest structural level in the trade's direction, with NO
   * floor and NO cap — null when the market has no pivot beyond the entry.
   *
   * R2b question 3. Every other structural distance the corpus carries is
   * floored at `minimumRunnerDistance`, and wherever the risk share places
   * TP1 it lands at most HALF that floor on every market on the scan roster,
   * so nothing describes the band the partial is parked in.
   */
  nearestStructureDistance: number | null;
  /**
   * Distance to the nearest structural level clearing the minimum payoff,
   * IGNORING the window cap — null when no level clears it at all.
   *
   * `runnerProvenance: "window_ceiling"` collapses two opposite causes: no
   * structure at these distances, or structure the review window cannot
   * reach. Different findings, different remedies, and the corpus could not
   * tell them apart.
   */
  runnerNearestBeyondMinimum: number | null;
  runnerProvenance: RunnerProvenance;
  runnerTarget: number;
  takeProfit1: number;
  tp1Provenance: Tp1Provenance;
};

const TP1_WINDOW_SHARE = 0.6;

export function buildLadderTargets(input: {
  atr: number;
  calibration: LadderCalibration;
  dailyAtr: number;
  entryPrice: number;
  pivotLevels: number[];
  riskDistance: number;
  side: Side;
}, refusal?: PlanRefusal): LadderTargets | null {
  const { atr, calibration, dailyAtr, entryPrice, riskDistance, side } = input;
  // Q4's split (4c): the factor scales ONLY the sizing hat — patience and
  // expiry keep reading defaultReviewHours, which the baseline measured as
  // censoring nothing (median exit 0.5h against 6-12h windows).
  // No `?? 1` here any more. That operator gave 25 of the 97 markets a sizing
  // factor nobody chose, sitting in the arithmetic where no reader of the
  // calibration table would find it, and reading identically to the 13
  // markets whose derived value genuinely is 1. The class rows carry the
  // value now, so the fallback was unreachable — and an unreachable fallback
  // is worse than none, because it keeps the field optional and lets the
  // next absence pass silently.
  const expectedWindowMove = dailyAtr *
    Math.sqrt(
      (calibration.defaultReviewHours * calibration.sizingHoursFactor) / 24,
    );
  // TP1 must be meaningful in R terms, not a fixed ATR crumb: the partial
  // is a share of risk, floored by the ATR multiplier, capped by what the
  // window can deliver.
  const tp1FromRisk = riskDistance * calibration.tp1RiskShare;
  const tp1AtrFloor = atr * calibration.tp1AtrMultiplier;
  const tp1WindowCap = expectedWindowMove * TP1_WINDOW_SHARE;
  const tp1Distance = Math.min(Math.max(tp1FromRisk, tp1AtrFloor), tp1WindowCap);
  // Exactly one of the three binds, and knowing which changes what is worth
  // tuning: moving tp1RiskShare does nothing on a market where the ATR floor or
  // the window cap is placing TP1. Tested in the same order the expression
  // evaluates — the cap outranks both, then the floor outranks the share.
  const tp1Provenance: Tp1Provenance =
    tp1WindowCap < Math.max(tp1FromRisk, tp1AtrFloor)
      ? "window_cap"
      : tp1AtrFloor > tp1FromRisk
      ? "atr_floor"
      : "risk_share";
  // The payoff floor is a feasibility filter, not a target-stretcher: if the
  // required distance exceeds what the window can statistically reach, the
  // setup is rejected instead of decorated with an unreachable target.
  const runnerLimit = expectedWindowMove * calibration.runnerWindowShare;
  const minimumRunnerDistance = riskDistance *
    calibration.minimumTargetRewardRisk;
  // SPLIT, because the two causes share nothing. The first says the review
  // window cannot carry the payoff floor — a window, ceiling or floor lever.
  // The second says TP1 collapsed to nothing, which is a TP1 lever. Collapsing
  // them is how indices spent a 96-variant grid on four axes while the binding
  // one was held fixed.
  if (minimumRunnerDistance > runnerLimit) {
    if (refusal) refusal.reason = "window_cannot_carry_payoff";
    return null;
  }
  if (tp1Distance <= 0) {
    if (refusal) refusal.reason = "tp1_not_positive";
    return null;
  }
  const qualifyingLevels = input.pivotLevels.filter((level) => {
    const distance = side === "buy" ? level - entryPrice : entryPrice - level;
    return distance >= minimumRunnerDistance && distance <= runnerLimit;
  });
  // Nearest structural level inside the reachable band; with no structure in
  // the band, the expected-move objective itself is the runner.
  const structuralRunner = nearestLevelBeyond(side, entryPrice, qualifyingLevels);
  // The SAME search without the upper cap, which is the only thing that can
  // tell R4 what `window_ceiling` actually meant on a row.
  //
  // The band filter above excludes a level for two opposite reasons — it did
  // not clear the minimum payoff, or it sat beyond what the window can reach
  // — and the provenance collapses both into one word. So a corpus full of
  // `window_ceiling` cannot distinguish "this market has no structure at
  // these distances" from "the structure is there and the review window is
  // too short to reach it", which are different findings with different
  // remedies. Recorded as a DISTANCE rather than a level so it is comparable
  // across markets without a price.
  const beyondMinimum = input.pivotLevels.filter((level) => {
    const distance = side === "buy" ? level - entryPrice : entryPrice - level;
    return distance >= minimumRunnerDistance;
  });
  const nearestBeyondMinimum = nearestLevelBeyond(side, entryPrice, beyondMinimum);
  const runnerNearestBeyondMinimum = nearestBeyondMinimum === null
    ? null
    : Math.abs(nearestBeyondMinimum - entryPrice);
  // R2b question 3: the SAME search with NO floor and NO cap.
  //
  // TP1 is placed from risk share, ATR floor and window cap and never consults
  // `pivotLevels` at all — the levels are spent entirely on the runner, at the
  // two sites above, both floored at `minimumRunnerDistance`.
  //
  // Derived over `defaultScanSymbols` rather than asserted, and pinned by
  // `tests/preR3Fields.test.ts` so a calibration edit cannot quietly retire
  // it: the smallest `minimumTargetRewardRisk / tp1RiskShare` on the roster is
  // 2.00, so wherever the RISK SHARE places TP1 it lands at most half the
  // nearest distance `runnerNearestBeyondMinimum` is able to report. That
  // covers the risk-share branch only — the ATR floor is a multiple of ATR
  // rather than of risk, so no ratio of calibration cells bounds it, which is
  // itself a reason to record the distance rather than reason about it.
  //
  // UNFLOORED RATHER THAN BAND-RESTRICTED, and that is the whole design. A
  // field clipped to TP1's band is null on most rows and cannot separate "this
  // market has no structure at these distances" from "the structure sits just
  // outside the band" — the exact two-opposite-causes conflation
  // `runnerNearestBeyondMinimum` was created to end, reintroduced one field
  // over. Where this lands at or inside `tp1Distance` it IS the nearest level
  // in TP1's band; where it lands beyond, it says how far structure actually
  // was. Strictly more information for the same column.
  //
  // ANCHORED TO THE PLANNED (UNALIGNED) ENTRY, like `stopPivotDistance` and
  // `runnerNearestBeyondMinimum` beside it. Inside this function `entryPrice`
  // is still the planned one — tick alignment runs later in `buildPricePlan` —
  // so the anchor comes free, and mixing anchors is the defect #462 shipped
  // and #472 found again one field over.
  //
  // It answers EXISTENCE, not placement. Whether structure sits in TP1's band,
  // on what share of rows, at what distance. The counterfactual R of a
  // structure-placed TP1 is NOT derivable from it: banking earlier re-arms
  // protection earlier and changes the runner's exit path, which no emitted
  // column reproduces.
  const nearestStructure = nearestLevelBeyond(
    side,
    entryPrice,
    input.pivotLevels,
  );
  const nearestStructureDistance = nearestStructure === null
    ? null
    : Math.abs(nearestStructure - entryPrice);
  // The fallback is a pure formula with no structure in it. Recording which
  // happened is the whole point: "the runner is the nearest structural level the
  // window can reach" described the corpus without ever being measured on it.
  const runnerProvenance: RunnerProvenance = structuralRunner === null
    ? "window_ceiling"
    : "structural_level";
  const runnerTarget = structuralRunner ??
    (side === "buy" ? entryPrice + runnerLimit : entryPrice - runnerLimit);

  const runnerDistance = Math.abs(runnerTarget - entryPrice);
  if (runnerDistance <= tp1Distance) {
    if (refusal) refusal.reason = "runner_inside_tp1";
    return null;
  }

  return {
    expectedWindowMove,
    nearestStructureDistance,
    runnerNearestBeyondMinimum,
    runnerProvenance,
    runnerTarget,
    tp1Provenance,
    takeProfit1: side === "buy"
      ? entryPrice + tp1Distance
      : entryPrice - tp1Distance,
  };
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}
