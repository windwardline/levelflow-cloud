import type { CategoryCalibration } from "./calibration.ts";
import { getAssetType } from "./calibration.ts";
import {
  estimateExecutionQuality,
  type ExecutionQuality,
} from "./executionQuality.ts";
import { applyFuturesTickRules, type FuturesContractSpec } from "./futures.ts";
import { averageTrueRange, findStructureLevels } from "./indicators.ts";
import type { MarketContext, Regime, Side, SupportedSymbol } from "./types.ts";

export type PricePlan = {
  atr: number;
  contractSpec: FuturesContractSpec | null;
  entryPrice: number;
  executionQuality: ExecutionQuality;
  futuresTickAdjustments: string[];
  grossRewardRisk: number;
  rewardRisk: number;
  stopLogic: string;
  stopLoss: number;
  targetLogic: string;
  takeProfit: number;
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
  const atr = averageTrueRange(bars, 14);
  const dailyAtr = averageTrueRange(daily, 14);
  const structure = findStructureLevels(bars);
  const dailyStructure = findStructureLevels(daily);
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
  let stopLoss = side === "buy"
    ? Math.min(structure.latestSwingLow - stopBuffer, entryPrice - atr * 1.25)
    : Math.max(structure.latestSwingHigh + stopBuffer, entryPrice + atr * 1.25);
  let riskDistance = Math.abs(entryPrice - stopLoss);
  const minimumLimitDistance = Math.max(
    atr * 0.05,
    Math.abs(latest.close) * 0.00005,
    0.00001,
  );

  if (
    side === "buy" &&
    roundPrice(entryPrice) >= roundPrice(latest.close - minimumLimitDistance)
  ) {
    return null;
  }

  if (
    side === "sell" &&
    roundPrice(entryPrice) <= roundPrice(latest.close + minimumLimitDistance)
  ) {
    return null;
  }

  if (side === "buy" && roundPrice(stopLoss) >= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(stopLoss) <= roundPrice(entryPrice)) {
    return null;
  }

  const liquidityTarget = side === "buy"
    ? Math.max(structure.nextLiquidityHigh, dailyStructure.latestSwingHigh)
    : Math.min(structure.nextLiquidityLow, dailyStructure.latestSwingLow);
  const minimumTarget = side === "buy"
    ? entryPrice + riskDistance * calibration.minimumTargetRewardRisk
    : entryPrice - riskDistance * calibration.minimumTargetRewardRisk;
  const volatilityTarget = side === "buy"
    ? entryPrice +
      Math.max(
        atr * calibration.volatilityTargetAtrMultiplier,
        dailyAtr * calibration.dailyTargetAtrMultiplier,
      )
    : entryPrice -
      Math.max(
        atr * calibration.volatilityTargetAtrMultiplier,
        dailyAtr * calibration.dailyTargetAtrMultiplier,
      );
  let takeProfit = selectHighestProbabilityTarget(side, {
    liquidityTarget,
    minimumTarget,
    volatilityTarget,
  });

  if (side === "buy" && takeProfit <= entryPrice) {
    takeProfit = entryPrice + riskDistance * 2;
  }
  if (side === "sell" && takeProfit >= entryPrice) {
    takeProfit = entryPrice - riskDistance * 2;
  }

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
  }

  if (side === "buy" && roundPrice(takeProfit) <= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit) >= roundPrice(entryPrice)) {
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
    latestClose: latest.close,
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
    futuresTickAdjustments: futuresTickPlan?.adjustments ?? [],
    grossRewardRisk: rewardRisk,
    rewardRisk: executionQuality.effectiveRewardRisk,
    stopLogic:
      "Price-structure invalidation with a volatility buffer and daily volatility floor.",
    stopLoss,
    targetLogic:
      "Nearest qualifying target from price structure, volatility, and payoff checks.",
    takeProfit,
  };
}

export function selectHighestProbabilityTarget(
  side: Side,
  targets: {
    liquidityTarget: number;
    minimumTarget: number;
    volatilityTarget: number;
  },
) {
  const candidates = [targets.liquidityTarget, targets.volatilityTarget]
    .filter(Number.isFinite)
    .map((target) =>
      side === "buy"
        ? Math.max(target, targets.minimumTarget)
        : Math.min(target, targets.minimumTarget)
    );

  if (candidates.length === 0) {
    return targets.minimumTarget;
  }

  return side === "buy" ? Math.min(...candidates) : Math.max(...candidates);
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}
