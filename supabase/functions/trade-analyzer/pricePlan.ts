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
  let stopLoss = side === "buy"
    ? Math.min(
      (nearestStopPivot ?? entryPrice) - stopBuffer,
      entryPrice - atr * 1.25,
    )
    : Math.max(
      (nearestStopPivot ?? entryPrice) + stopBuffer,
      entryPrice + atr * 1.25,
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
      "Invalidation beyond the nearest confirmed swing pivot with a volatility buffer.",
    stopLoss,
    targetLogic:
      "TP1 sized to the review window's expected move; runner at the nearest structural liquidity level.",
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
  tp1AtrMultiplier: number;
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
  const tp1Distance = Math.min(
    atr * calibration.tp1AtrMultiplier,
    expectedWindowMove * TP1_WINDOW_SHARE,
  );
  // The runner is the nearest structural level that also clears the payoff
  // floor — pivots inside the minimum distance are skipped, not stretched.
  const minimumRunnerDistance = riskDistance *
    calibration.minimumTargetRewardRisk;
  const qualifyingLevels = input.pivotLevels.filter((level) =>
    side === "buy"
      ? level >= entryPrice + minimumRunnerDistance
      : level <= entryPrice - minimumRunnerDistance
  );
  const runnerTarget = nearestLevelBeyond(side, entryPrice, qualifyingLevels);

  if (runnerTarget === null || tp1Distance <= 0) {
    return null;
  }

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
