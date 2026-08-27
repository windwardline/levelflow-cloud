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
 * win and a loss are the same size, and here they are not.
 *
 * BREAK-EVEN IS NOT A CONSTANT. It is `1 / (1 + avgWinR)`, and avgWinR depends
 * on the MIX of the two winning outcomes:
 *
 *   tp1_partial  banks 0.5 * (tp1Distance / riskDistance) R and the runner then
 *                exits at entry (replay.ts: `protection === "trail_tp1" ?
 *                takeProfit1 : entry`) — about +0.20R on the shipped geometry
 *   take_profit  banks the same partial AND runs to a target at least
 *                `minimumTargetRewardRisk` (1.6-1.7) away — about +1.00R
 *   stop_loss    a full -1.00R
 *
 * So the neutral point runs from 0.500 for a cohort that always reaches the
 * runner target to 0.833 for one that never does. A CORRECTION TO THE FIRST
 * VERSION OF THIS COMMENT, which quoted 0.71-0.83 as though it were the whole
 * range and claimed a 70% win rate always loses money: that holds only for a
 * partial-heavy cohort. At a 65% partial share break-even is about 0.676, and
 * 70% is marginally profitable there.
 *
 * The defect is not that 0.5 is the wrong constant. It is that ANY constant is
 * wrong: 0.5 is correct only at the all-take_profit extreme, and the observed
 * fill mix is partial-heavy, so the live neutral point sat well above the
 * pivot and every cohort between the two was scored with the wrong sign.
 *
 * `take_profit` and `tp1_partial` also both increment `wins` (index.ts), so the
 * rate being fed in cannot distinguish the two outcomes whose difference IS the
 * neutral point. The mix is not recoverable from the numbers this layer stores.
 *
 * §19e: a refusal beats a wrong number. The adjustment is withheld until the
 * neutral point is derived per cohort from its own realised outcomes — which is
 * why the answer is almost certainly realised R rather than a win rate at all.
 * replay.ts already computes `netRealizedR` per resolution and this layer
 * ignores it. That is a model change and an owner call, so this file refuses
 * rather than guessing a replacement curve or freezing one end of the range.
 */
export const WITHHELD_REASON =
  "neutral point is not a constant (0.500 to 0.833 by outcome mix) and was not derived per cohort";

function roundWeight(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
