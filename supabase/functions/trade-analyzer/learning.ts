export type LearningStats = {
  ambiguous: number;
  losses: number;
  total: number;
  wins: number;
};

export type LearningWeight = {
  ambiguityPenalty: number;
  confidenceAdjustment: number;
  sampleWeight: number;
  winRate: number;
  /** Non-null when the adjustment is refused rather than computed. */
  withheld: string | null;
};

export function calculateLearningWeight(stats: LearningStats): LearningWeight {
  // 2e / round-8 PH-7: an ambiguous path resolved AGAINST the trade — the
  // engine prices its exit at the stop side — so the learning layer counts
  // it as a loss in the win rate rather than quietly dropping it from the
  // denominator. The ambiguity penalty below stays as a separate DATA
  // QUALITY discount on sample weight; the double effect is deliberate and
  // conservative, which is the direction 2e demands.
  const ambiguous = Math.max(stats.ambiguous, 0);
  const resolved = Math.max(stats.wins + stats.losses, 0) + ambiguous;
  const total = Math.max(stats.total, resolved);
  const winRate = stats.wins / Math.max(resolved, 1);
  const baseSampleWeight = resolved >= 20
    ? 1
    : resolved >= 8
    ? resolved / 20
    : 0;
  const ambiguityShare = total > 0 ? ambiguous / total : 0;
  const ambiguityPenalty = Math.min(0.45, ambiguityShare * 0.75);
  const sampleWeight = roundWeight(baseSampleWeight * (1 - ambiguityPenalty));

  return {
    ambiguityPenalty: roundWeight(ambiguityPenalty),
    // WITHHELD, not computed. See WITHHELD_REASON.
    confidenceAdjustment: 0,
    sampleWeight,
    winRate: roundWeight(winRate),
    withheld: WITHHELD_REASON,
  };
}

/**
 * Why this layer emits no adjustment.
 *
 * The transfer function was `(winRate - 0.5) * 20`, which treats 0.5 as the
 * point where a market is neither helping nor hurting. That is only true when a
 * win and a loss are the same size. HERE THEY ARE NOT, and the gap is not small.
 *
 * The ladder banks half the position at TP1 and runs the rest with the stop
 * moved to entry (replay.ts: `protection === "trail_tp1" ? takeProfit1 : entry`).
 * So a `tp1_partial` realises `0.5 * (tp1Distance / riskDistance)` R before
 * costs — with tp1AtrMultiplier 0.5 against stopAtrMultiplier 1.2 to 1.45, that
 * is 0.17R to 0.21R — while a `stop_loss` is a full -1R. Break-even therefore
 * sits at `1 / (1 + bankedR)`: between 0.83 and 0.85, never 0.5.
 *
 * The consequence is a WRONG SIGN, not a small miscalibration. A market winning
 * 70% of its setups is losing money and was receiving +4.0 confidence — pushed
 * UP, on the strength of losing. The whole 0.5-to-0.83 band is inverted, and a
 * TP1-heavy ladder lives inside that band by construction.
 *
 * `take_profit` and `tp1_partial` also both increment `wins` (index.ts), so the
 * rate being fed in does not distinguish a full runner from a banked half.
 *
 * §19e: a refusal beats a wrong number. The adjustment is withheld until its
 * neutral point is DERIVED from each market's own ladder geometry, which is
 * blocked on setup_key carrying the symbol — today it does not, so one market's
 * outcomes cannot even be told from another's inside a class.
 *
 * The right statistic is almost certainly realised R rather than a win rate at
 * all: replay.ts already computes `netRealizedR` per resolution and this layer
 * ignores it. That is a model change and an owner call, so this file refuses
 * rather than guessing a replacement curve.
 */
export const WITHHELD_REASON =
  "neutral point not derived from ladder geometry (break-even is ~0.83, not 0.5)";

function roundWeight(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
