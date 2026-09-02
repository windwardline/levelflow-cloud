import type { AssetType } from "./calibration.ts";

export type StrategyProfileVote = {
  baseScore?: number;
  confidence: number;
  name: string;
  profileWeight?: number;
  rationale: string;
  score: number;
};

const DEFAULT_PROFILE_WEIGHT = 1;

// Exported for the value guard in tests/strategyProfileCompleteness.test.ts.
// Read-only there; nothing in production reads it through this name.
export const STRATEGY_PROFILE_WEIGHTS: Record<
  AssetType,
  Partial<Record<string, number>>
> = {
  crypto: {
    breakout_continuation: 1.06,
    failed_breakout_reversal: 1.02,
    momentum_confirmation: 1.1,
    momentum_divergence: 1.04,
    multi_timeframe_bias: 1.02,
    range_mean_reversion: 0.94,
    smart_money_liquidity: 0.98,
    volatility_expansion: 1.12,
    volume_value_extension: 0.96,
    volume_value_retest: 0.96,
  },
  energies: {
    breakout_continuation: 1.06,
    failed_breakout_reversal: 1.05,
    momentum_confirmation: 1.04,
    momentum_divergence: 1,
    multi_timeframe_bias: 1.05,
    range_mean_reversion: 0.94,
    smart_money_liquidity: 1.04,
    trend_pullback_to_value: 1.05,
    volatility_expansion: 1.08,
    volume_value_extension: 1.02,
    volume_value_retest: 1.02,
  },
  forex: {
    breakout_continuation: 1,
    failed_breakout_reversal: 1.04,
    momentum_confirmation: 1,
    momentum_divergence: 1.02,
    multi_timeframe_bias: 1.08,
    range_mean_reversion: 1.06,
    smart_money_liquidity: 1.03,
    volatility_expansion: 0.98,
    volume_value_extension: 1,
    volume_value_retest: 1,
  },
  // Livestock, 2026-08-06 — the weights the class's measured result was produced
  // under, carried from futures and NOT derived. No per-strategy attribution
  // exists for cattle or hogs, and inventing weights that "feel right for
  // livestock" is the fabrication the class was built to escape. A standing item
  // for a strategy-attribution pass.
  livestock: {
    breakout_continuation: 1.08,
    failed_breakout_reversal: 1.05,
    momentum_confirmation: 1.03,
    momentum_divergence: 1,
    multi_timeframe_bias: 1.06,
    range_mean_reversion: 0.94,
    smart_money_liquidity: 1.02,
    trend_pullback_to_value: 1.08,
    volatility_expansion: 1.04,
    volume_value_extension: 1.03,
    volume_value_retest: 1.03,
  },
  // Agriculture, 2026-08-06. These are the weights the class's measured +0.205
  // was produced under, carried over verbatim from futures — NOT derived. No
  // per-strategy attribution exists for the grains yet, so inventing weights
  // that "feel right for agriculture" would be exactly the fabrication the
  // class was created to escape. They ship unchanged so the measured result is
  // preserved, and they are a standing item for a strategy-attribution pass.
  agriculture: {
    breakout_continuation: 1.08,
    failed_breakout_reversal: 1.05,
    momentum_confirmation: 1.03,
    momentum_divergence: 1,
    multi_timeframe_bias: 1.06,
    range_mean_reversion: 0.94,
    smart_money_liquidity: 1.02,
    trend_pullback_to_value: 1.08,
    volatility_expansion: 1.04,
    volume_value_extension: 1.03,
    volume_value_retest: 1.03,
  },
  futures: {
    breakout_continuation: 1.08,
    failed_breakout_reversal: 1.05,
    momentum_confirmation: 1.03,
    momentum_divergence: 1,
    multi_timeframe_bias: 1.06,
    range_mean_reversion: 0.94,
    smart_money_liquidity: 1.02,
    trend_pullback_to_value: 1.08,
    volatility_expansion: 1.04,
    volume_value_extension: 1.03,
    volume_value_retest: 1.03,
  },
  indices: {
    breakout_continuation: 1.04,
    failed_breakout_reversal: 1.03,
    momentum_confirmation: 1.04,
    momentum_divergence: 0.98,
    multi_timeframe_bias: 1.08,
    range_mean_reversion: 0.98,
    smart_money_liquidity: 1.02,
    trend_pullback_to_value: 1.06,
    volatility_expansion: 1.03,
    volume_value_extension: 1.01,
    volume_value_retest: 1.01,
  },
  metals: {
    breakout_continuation: 1.02,
    failed_breakout_reversal: 1.08,
    momentum_confirmation: 1.02,
    momentum_divergence: 1.04,
    multi_timeframe_bias: 1.03,
    range_mean_reversion: 0.96,
    smart_money_liquidity: 1.08,
    trend_pullback_to_value: 1.04,
    volatility_expansion: 1.05,
    volume_value_extension: 1.02,
    volume_value_retest: 1.02,
  },
};

export function applyStrategyProfile<T extends StrategyProfileVote>(
  assetType: AssetType,
  votes: T[],
): Array<T & { baseScore: number; profileWeight: number }> {
  const weights = STRATEGY_PROFILE_WEIGHTS[assetType];

  return votes.map((vote) => {
    const profileWeight = weights[vote.name] ?? DEFAULT_PROFILE_WEIGHT;
    const baseScore = vote.score;
    const score = Math.max(0, Math.round(vote.score * profileWeight));

    return {
      ...vote,
      baseScore,
      confidence: Number(
        Math.min(1, vote.confidence * profileWeight).toFixed(2),
      ),
      profileWeight,
      score,
    };
  });
}

export function getStrategyProfileWeight(
  assetType: AssetType,
  strategyName: string,
) {
  return STRATEGY_PROFILE_WEIGHTS[assetType][strategyName] ??
    DEFAULT_PROFILE_WEIGHT;
}
