import type { CategoryCalibration } from "./calibration.ts";
import { getAssetType } from "./calibration.ts";
import {
  estimateExecutionQuality,
  type ExecutionQuality,
} from "./executionQuality.ts";
import { applyFuturesTickRules, type FuturesContractSpec } from "./futures.ts";
import {
  averageTrueRange,
  findSwingPivots,
  nearestLevelBeyond,
} from "./indicators.ts";
import type { MarketContext, Regime, Side, SupportedSymbol } from "./types.ts";

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
  targetLogic: string;
  takeProfit: number;
  takeProfit1: number;
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
  const entryOffset = atr *
    (regime.name === "trend"
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
  let stopLoss = side === "buy"
    ? Math.max(
      Math.min(
        (nearestStopPivot ?? entryPrice) - stopBuffer,
        entryPrice - atr * 1.25,
      ),
      entryPrice - maxStopDistance,
    )
    : Math.min(
      Math.max(
        (nearestStopPivot ?? entryPrice) + stopBuffer,
        entryPrice + atr * 1.25,
      ),
      entryPrice + maxStopDistance,
    );
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
  const futuresTickPlan = assetType === "futures"
    ? applyFuturesTickRules({
      entryPrice,
      side,
      stopLoss,
      symbol,
      takeProfit,
    })
    : null;

  if (futuresTickPlan) {
    entryPrice = futuresTickPlan.entryPrice;
    stopLoss = futuresTickPlan.stopLoss;
    takeProfit = futuresTickPlan.takeProfit;
    riskDistance = Math.abs(entryPrice - stopLoss);
    takeProfit1 = clampBetween(takeProfit1, entryPrice, takeProfit);
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
    stopLogic:
      "Invalidation beyond the nearest confirmed swing pivot with a volatility buffer, capped at the window's volatility ceiling.",
    stopLoss,
    targetLogic:
      "TP1 banks a risk-scaled partial; the runner is the nearest structural level the review window can statistically reach.",
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
  minimumTargetRewardRisk: number;
  runnerWindowShare: number;
  tp1AtrMultiplier: number;
  tp1RiskShare: number;
};

export type LadderTargets = {
  expectedWindowMove: number;
  runnerTarget: number;
  takeProfit1: number;
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
  const expectedWindowMove = dailyAtr *
    Math.sqrt(calibration.defaultReviewHours / 24);
  // TP1 must be meaningful in R terms, not a fixed ATR crumb: the partial
  // is a share of risk, floored by the ATR multiplier, capped by what the
  // window can deliver.
  const tp1Distance = Math.min(
    Math.max(
      riskDistance * calibration.tp1RiskShare,
      atr * calibration.tp1AtrMultiplier,
    ),
    expectedWindowMove * TP1_WINDOW_SHARE,
  );
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
  const runnerTarget = nearestLevelBeyond(side, entryPrice, qualifyingLevels) ??
    (side === "buy" ? entryPrice + runnerLimit : entryPrice - runnerLimit);

  const runnerDistance = Math.abs(runnerTarget - entryPrice);
  if (runnerDistance <= tp1Distance) {
    return null;
  }

  return {
    expectedWindowMove,
    runnerTarget,
    takeProfit1: side === "buy"
      ? entryPrice + tp1Distance
      : entryPrice - tp1Distance,
  };
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}
