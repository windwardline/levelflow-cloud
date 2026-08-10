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
  contractSpec: FuturesContractSpec | null;
  entryPrice: number;
  executionQuality: ExecutionQuality;
  expectedWindowMove: number;
  futuresTickAdjustments: string[];
  grossRewardRisk: number;
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
): PricePlan | null {
  const bars = market.primary;
  const daily = market.daily;
  const latest = bars.at(-1)!;
  const currentClose = market.latest.close;
  const atr = averageTrueRange(bars, 14);
  const dailyAtr = averageTrueRange(daily, 14);
  const pivots = findSwingPivots(bars, 3);
  const dailyPivots = findSwingPivots(daily, 2);
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
  const nearestStopPivot = nearestLevelBeyond(
    side === "buy" ? "sell" : "buy",
    entryPrice,
    side === "buy" ? pivots.lows : pivots.highs,
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
    return null;
  }

  if (
    side === "sell" &&
    roundPrice(entryPrice) <= roundPrice(currentClose + minimumLimitDistance)
  ) {
    return null;
  }

  if (side === "buy" && roundPrice(stopLoss) >= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(stopLoss) <= roundPrice(entryPrice)) {
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
  });

  if (!ladder) {
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
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit) >= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "buy" && roundPrice(takeProfit1) <= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit1) >= roundPrice(entryPrice)) {
    return null;
  }

  const rewardRisk = Math.abs(takeProfit - entryPrice) /
    Math.max(riskDistance, 0.00001);
  if (!Number.isFinite(rewardRisk) || riskDistance <= 0) {
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
    entryPrice,
    executionQuality,
    expectedWindowMove: ladder.expectedWindowMove,
    futuresTickAdjustments: futuresTickPlan?.adjustments ?? [],
    grossRewardRisk: rewardRisk,
    rewardRisk: executionQuality.effectiveRewardRisk,
    // Derived from what actually happened, never asserted. The constant this
    // replaces said "Invalidation beyond the nearest confirmed swing pivot with
    // a volatility buffer" on EVERY setup — and the pivot never wins in seven of
    // eight classes, because structuralStop is floored at 1.25 ATR while the cap
    // is maxStopAtrMultiplier x ATR, which is 1.0 everywhere except metals. So
    // the sentence was false wherever it mattered most, and stopProvenance was
    // sitting two lines away recording the truth.
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
  sizingHoursFactor?: number;
  minimumTargetRewardRisk: number;
  runnerWindowShare: number;
  tp1AtrMultiplier: number;
  tp1RiskShare: number;
};

export type LadderTargets = {
  expectedWindowMove: number;
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
}): LadderTargets | null {
  const { atr, calibration, dailyAtr, entryPrice, riskDistance, side } = input;
  // Q4's split (4c): the factor scales ONLY the sizing hat — patience and
  // expiry keep reading defaultReviewHours, which the baseline measured as
  // censoring nothing (median exit 0.5h against 6-12h windows).
  const expectedWindowMove = dailyAtr *
    Math.sqrt(
      (calibration.defaultReviewHours * (calibration.sizingHoursFactor ?? 1)) /
        24,
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
  if (minimumRunnerDistance > runnerLimit || tp1Distance <= 0) {
    return null;
  }
  const qualifyingLevels = input.pivotLevels.filter((level) => {
    const distance = side === "buy" ? level - entryPrice : entryPrice - level;
    return distance >= minimumRunnerDistance && distance <= runnerLimit;
  });
  // Nearest structural level inside the reachable band; with no structure in
  // the band, the expected-move objective itself is the runner.
  const structuralRunner = nearestLevelBeyond(side, entryPrice, qualifyingLevels);
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
    return null;
  }

  return {
    expectedWindowMove,
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
