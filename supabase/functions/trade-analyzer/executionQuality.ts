import type { AssetType } from "./calibration.ts";

export type ExecutionQualityInput = {
  assetType: AssetType;
  atr: number;
  availableTimeframes: string[];
  dailyAtr: number;
  entryPrice: number;
  latestClose: number;
  providerWarnings: string[];
  quotedSpread?: number | null;
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
  modeledSpread: number;
  notes: string[];
  quotedSpread: number | null;
  score: number;
  spreadSource: "quoted" | "modeled";
};

type ExecutionProfile = {
  atrSlippageFactor: number;
  atrSpreadFactor: number;
  maxPenalty: number;
  slippageBps: number;
  spreadBps: number;
};

/**
 * Divide-by-zero guard, and nothing more.
 *
 * This replaced a per-class `minimumCost` expressed as an ABSOLUTE price
 * increment (futures and indices carried 0.01). A cost floor in absolute
 * price cannot be right for a class at all: E8's futures program spans
 * natural gas near 2.67 to the E-mini S&P near 7752, so one constant is
 * either invisible at the top of the range or ruinous at the bottom. At 0.01
 * it was ruinous — modeled round-trip cost reached 1.8x copper's whole risk
 * distance and 2.7x gas's, turning a genuine 2:1 setup into a reported 0.077
 * and 0.018 and rejecting every one of them. Copper cleared reward:risk 1.25
 * in 0 of 2304 replayed setups, gas in 0 of 1689, and the 10-year note was
 * throttled to 136 filled against the bond's 1540.
 *
 * Cost is modeled two ways that already scale with the instrument — basis
 * points of price, and a fraction of ATR. Both are market-specific by
 * construction. The guard exists only so a zero price or a zero ATR cannot
 * produce a zero denominator, and it must never outrank either real term.
 */
const COST_EPSILON = 1e-9;

const EXECUTION_PROFILES: Record<AssetType, ExecutionProfile> = {
  // Agriculture, 2026-08-06. The bps terms are DERIVED, not judged: one tick is
  // the tightest spread a contract can quote, and tick over price is arithmetic.
  // Measured against the F9 sighting's own prices —
  //   soybean oil  0.01 / 67.75   = 1.5 bps
  //   soybeans     0.25c / 1168c  = 2.1
  //   soymeal      0.10 / 313.5   = 3.2
  //   rough rice   0.005 / 14.205 = 3.5
  //   corn         0.25c / 449.75c= 5.6
  //   oats         0.25c / 316.3c = 7.9
  // — a mean one-tick spread of 4.0 bps against the E-mini S&P's 0.32. That is
  // the whole reason this class exists: the futures profile's 1.4 bps understates
  // agricultural cost by roughly 3x, and understating cost is how a market gets
  // credited with edge it does not have.
  //
  // The two ATR-relative factors carry futures' values because nothing in the
  // corpus measures them, and the bps term dominates at these price levels
  // anyway. Marked so they are not mistaken for derived.
  agriculture: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 2.5,
    spreadBps: 4.0,
  },
  crypto: {
    atrSlippageFactor: 0.012,
    atrSpreadFactor: 0.018,
    maxPenalty: 12,
    slippageBps: 2.5,
    spreadBps: 3.5,
  },
  energies: {
    atrSlippageFactor: 0.01,
    atrSpreadFactor: 0.014,
    maxPenalty: 11,
    slippageBps: 1.1,
    spreadBps: 1.8,
  },
  forex: {
    atrSlippageFactor: 0.006,
    atrSpreadFactor: 0.01,
    maxPenalty: 8,
    slippageBps: 0.16,
    spreadBps: 0.35,
  },
  futures: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 0.8,
    spreadBps: 1.4,
  },
  indices: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 0.7,
    spreadBps: 1.1,
  },
  metals: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.014,
    maxPenalty: 10,
    slippageBps: 1.1,
    spreadBps: 1.9,
  },
};

export function estimateExecutionQuality(
  input: ExecutionQualityInput,
): ExecutionQuality {
  const profile = EXECUTION_PROFILES[input.assetType];
  const latestClose = Math.abs(input.latestClose);
  const atr = Math.max(Math.abs(input.atr), COST_EPSILON);
  const dailyAtr = Math.max(Math.abs(input.dailyAtr), atr);
  const riskDistance = Math.abs(input.entryPrice - input.stopLoss);
  const rewardDistance = Math.abs(input.takeProfit - input.entryPrice);
  const modeledSpread = roundPrice(
    Math.max(
      latestClose * (profile.spreadBps / 10_000),
      atr * profile.atrSpreadFactor,
      COST_EPSILON,
    ),
  );
  const quotedSpread = normalizeQuotedSpread(input.quotedSpread);
  const estimatedSpread = quotedSpread === null
    ? modeledSpread
    : roundPrice(Math.max(quotedSpread, COST_EPSILON));
  const spreadSource = quotedSpread === null ? "modeled" : "quoted";
  const estimatedSlippage = roundPrice(
    Math.max(
      latestClose * (profile.slippageBps / 10_000),
      atr * profile.atrSlippageFactor,
      COST_EPSILON,
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

  if (spreadSource === "quoted") {
    notes.push("Live bid/ask spread was used.");
  }
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
    modeledSpread,
    notes,
    quotedSpread,
    score,
    spreadSource,
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(5)) : 0;
}

function normalizeQuotedSpread(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return roundPrice(value);
}
