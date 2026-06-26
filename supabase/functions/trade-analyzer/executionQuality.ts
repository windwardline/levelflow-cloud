import type { AssetType } from "./calibration.ts";

export type ExecutionQualityInput = {
  assetType: AssetType;
  atr: number;
  availableTimeframes: string[];
  dailyAtr: number;
  entryPrice: number;
  latestClose: number;
  providerWarnings: string[];
  side: "buy" | "sell";
  stopLoss: number;
  symbol: string;
  takeProfit: number;
};

export type ExecutionQuality = {
  confidencePenalty: number;
  effectiveRewardRisk: number;
  estimatedRoundTripCost: number;
  estimatedSlippage: number;
  estimatedSpread: number;
  grossRewardRisk: number;
  label: "Clean" | "Acceptable" | "Thin" | "Poor";
  notes: string[];
  score: number;
};

type ExecutionProfile = {
  atrSlippageFactor: number;
  atrSpreadFactor: number;
  maxPenalty: number;
  minimumCost: number;
  slippageBps: number;
  spreadBps: number;
};

const EXECUTION_PROFILES: Record<AssetType, ExecutionProfile> = {
  crypto: {
    atrSlippageFactor: 0.012,
    atrSpreadFactor: 0.018,
    maxPenalty: 12,
    minimumCost: 0.00001,
    slippageBps: 2.5,
    spreadBps: 3.5,
  },
  forex: {
    atrSlippageFactor: 0.006,
    atrSpreadFactor: 0.01,
    maxPenalty: 8,
    minimumCost: 0.00001,
    slippageBps: 0.16,
    spreadBps: 0.35,
  },
  futures: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    minimumCost: 0.01,
    slippageBps: 0.8,
    spreadBps: 1.4,
  },
  metals: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.014,
    maxPenalty: 10,
    minimumCost: 0.0001,
    slippageBps: 1.1,
    spreadBps: 1.9,
  },
};

export function estimateExecutionQuality(
  input: ExecutionQualityInput,
): ExecutionQuality {
  const profile = EXECUTION_PROFILES[input.assetType];
  const latestClose = Math.abs(input.latestClose);
  const atr = Math.max(Math.abs(input.atr), profile.minimumCost);
  const dailyAtr = Math.max(Math.abs(input.dailyAtr), atr);
  const riskDistance = Math.abs(input.entryPrice - input.stopLoss);
  const rewardDistance = Math.abs(input.takeProfit - input.entryPrice);
  const estimatedSpread = roundPrice(
    Math.max(
      latestClose * (profile.spreadBps / 10_000),
      atr * profile.atrSpreadFactor,
      profile.minimumCost,
    ),
  );
  const estimatedSlippage = roundPrice(
    Math.max(
      latestClose * (profile.slippageBps / 10_000),
      atr * profile.atrSlippageFactor,
      profile.minimumCost,
    ),
  );
  const estimatedRoundTripCost = roundPrice(
    estimatedSpread + estimatedSlippage * 2,
  );
  const grossRewardRisk = rewardDistance / Math.max(riskDistance, 0.00001);
  const effectiveRewardRisk = Math.max(
    0,
    rewardDistance - estimatedRoundTripCost,
  ) / Math.max(riskDistance + estimatedRoundTripCost, 0.00001);
  const costToRisk = estimatedRoundTripCost / Math.max(riskDistance, 0.00001);
  const entryCushion = Math.abs(input.latestClose - input.entryPrice);
  const notes: string[] = [];

  let penalty = Math.round(costToRisk * 90);
  if (entryCushion < estimatedSpread * 2) {
    penalty += 3;
    notes.push("Entry is close to the current spread.");
  }
  if (input.availableTimeframes.length < 3) {
    penalty += 2;
    notes.push("Fewer chart intervals were available.");
  }
  if (input.providerWarnings.length > 0) {
    penalty += Math.min(3, input.providerWarnings.length);
    notes.push("Chart coverage has provider warnings.");
  }
  if (dailyAtr > 0 && atr / dailyAtr > 0.5) {
    penalty += 2;
    notes.push("Short-term movement is elevated versus daily range.");
  }
  if (effectiveRewardRisk < grossRewardRisk * 0.85) {
    notes.push("Estimated execution cost meaningfully reduces payoff.");
  }

  const confidencePenalty = clampInteger(penalty, 0, profile.maxPenalty);
  const score = clampInteger(100 - confidencePenalty * 8, 0, 100);
  const label = score >= 84
    ? "Clean"
    : score >= 72
    ? "Acceptable"
    : score >= 55
    ? "Thin"
    : "Poor";

  if (notes.length === 0) {
    notes.push("Spread and slippage estimates are within the risk budget.");
  }

  return {
    confidencePenalty,
    effectiveRewardRisk: roundPrice(effectiveRewardRisk),
    estimatedRoundTripCost,
    estimatedSlippage,
    estimatedSpread,
    grossRewardRisk: roundPrice(grossRewardRisk),
    label,
    notes,
    score,
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(5)) : 0;
}
